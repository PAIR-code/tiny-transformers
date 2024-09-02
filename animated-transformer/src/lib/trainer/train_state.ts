/* Copyright 2023 Google LLC. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import {
  GTensor,
  DName,
  GVariable,
  GTensorOrScalar,
  makeScalar,
  GTensorOrVar,
  AnyGTensorOrVar,
  TensorOrVarKind,
} from '../gtensor/gtensor';
import * as tf from '@tensorflow/tfjs';
import { BasicLmTask, Example, generateBatch } from '../seqtasks/util';
import { gradsVarTreeFunctor } from '../gtensor/grad';
import { BasicTaskTokenRep, StrSeqPrepFn } from '../tokens/token_gemb';
import * as jstree from '../js_tree/js_tree';

export type TrainingBatch<InputDims extends DName, TargetDims extends DName> = {
  inputs: GTensor<InputDims>;
  // TODO: this is a special case of predicting only a single next token.
  targets: GTensor<TargetDims>;
  nExampleBatchDelta: number;
};

export type TrainStateConfig = {
  learningRate: number;
  batchSize: number;
  maxInputlength: number;
  testSetSize: number;
  trainSetSize: number;
};

export type TaskDatasetSplit = {
  task: BasicLmTask;
  testSetIndex: Set<string>;
  testSetExamples: Example[];
  trainSetIter: Iterator<Example>;
};

// export type TrainingBatchGenerator<I extends DName, T extends DName> = Iterator<
//   TrainingBatch<I, T>
// >;

// /**
//  * Assumes: that the output TrainingBatch may have extra padding examples, or
//  * have only an initial subset of the examples. This is indicated by the output
//  * TrainingBatch.nExampleBatchDelta
//  */
// export type ExamplePrepFn<InputDims extends DName, TargetDims extends DName> =
//   (tokenRep: MaskedTaskTokenRep, batch: Example[])
//     => TrainingBatch<InputDims, TargetDims>;

export type LossFn<
  // SpecKind defines the meta-data for the model specification, e.g.
  // hyper-params for the transformer model itself (dimension size, nLayers,
  // etc), as well as any other constants needed to compute the loss.
  SpecKind,
  // A JS object type that holds the parameter updated during training.
  // This is the only thing needed for computing gradients.
  ParamsKind,
  // The inputed dimension names of the model
  InputDims extends DName,
  // The outputed dimension names of the model
  TargetDims extends DName
> = (
  spec: SpecKind,
  params: ParamsKind,
  inputs: GTensor<InputDims>,
  targets: GTensor<TargetDims>
) => tf.Scalar;

type VarParams = jstree.DictArrTree<GVariable<any>>;
// You might think we'd need this:
//   type TensorOrVarParams<T extends TensorOrVarKind> = jstree.DictArrTree<AnyGTensorOrVar<T>>;
// but we don't because
//   jstree.DictArrTree<GVariable<any>> extends jstree.DictArrTree<GTensor<any>>

// Class to hold state, primarily for memory management.
export class TrainState<
  // Specifies the kind of model being used, and any extra data used to compute
  // the loss, but not a parameter that can change during learning.
  SpecKind,
  Params extends VarParams,
  // Names of the dimensions in the input tensor.
  InputDims extends DName,
  // Names of dimensions in the output tensor.
  TargetDims extends DName
> {
  // The examples we intended to put in the batch.
  batchExamples: Example[] = [];
  batchMeanLoss = 0;
  nSteps = 0;
  nExamples = 0;
  epochSize = 0;
  grads: VarParams;
  // Additional GVariable trees to cleanup when we dispose.
  // ownedGVarTrees: GVariableTree<unknown>[] = [];

  // Initialized within the tf.tidy call, which is synchronous.
  inputsVar!: GVariable<InputDims>;
  targetsVar!: GVariable<TargetDims>;

  _calculateGradsAndLoss: () => {
    grads: VarParams;
    loss: tf.Scalar;
  };

  /**
   * This class takes ownership of params, taking responsibility for
   * its memory cleanup.
   */
  constructor(
    // SpecKind defines the meta-data for the model's specification, e.g.
    // what model is it and what hyper-params does it have.
    // (dimension size, nLayers, etc).
    public spec: SpecKind,
    // This is a JS object that contains the actual parameters.
    // Note: this class, the TrainState, does not own the params tree.
    // It's caller is responsible for initialization and cleanup.
    public params: Params,
    // Config is
    public config: TrainStateConfig,
    public lossFn: LossFn<SpecKind, Params, InputDims, TargetDims>,
    public tokenRep: BasicTaskTokenRep,
    public taskSplit: TaskDatasetSplit,
    public inputPrepFn: StrSeqPrepFn<Params, InputDims>,
    public targetPrepFn: (
      tokenRep: BasicTaskTokenRep,
      outputSeqs: string[][]
    ) => GTensor<TargetDims>
  ) {
    // Make a copy of params with GVariables of zero value. init grad = 0
    this.grads = jstree.map(this.params, (t: GTensor<any>) => new GVariable(t.zero()));

    // Note: creating the function (gradsFunctor) doesn't create or do any
    // tensor computation, that's why we don't need a tf.tidy here, but when we
    // call this._calculateGradsAndLoss, then we will need to wrap it in
    // tf.tidy.
    //
    // CONSIDER: Maybe wrap gradients into a special class that by default only
    // stores the list of tensors for the params, and only on request re-creates
    // the same shape as the params. Ater all, we only need the shape after the
    // number of training steps when the caller wants to programatically do
    // stuff with the udpated params.
    this._calculateGradsAndLoss = gradsVarTreeFunctor(this.params, () =>
      this.lossFn(this.spec, this.params, this.inputsVar, this.targetsVar)
    );

    this.initInputsAndTargets();
  }

  // makeGVarTree(f: (t: GVariableOrScalar) => GVariable<string>
  // ): GVariableTree<ParamsKind> {
  //   const newParamTreeVars = this.params.map(f);
  //   this.associatedParamVars.push(newParamTreeVars);
  //   return newParamTreeVars;
  // }

  initInputsAndTargets(): void {
    if (this.inputsVar && !this.inputsVar.tensor.isDisposed) {
      this.inputsVar.dispose();
    }
    if (this.targetsVar && !this.targetsVar.tensor.isDisposed) {
      this.targetsVar.dispose();
    }
    this.prepareNextTrainBatch();
    this.updateGradsAndLoss();
  }

  prepareBatch(examples: Example[]): void {
    this.batchExamples = examples;
    if (examples.length !== this.config.batchSize) {
      throw new Error('number of examples !== batch size');
    }
    tf.tidy(() => {
      const inputs = this.inputPrepFn(
        this.tokenRep,
        this.params,
        this.config.maxInputlength,
        examples.map((e) => e.input)
      );
      const targets = this.targetPrepFn(
        this.tokenRep,
        examples.map((e) => e.output)
      );
      if (this.inputsVar && !this.inputsVar.tensor.isDisposed) {
        this.inputsVar.assign(inputs);
      } else {
        this.inputsVar = new GVariable(inputs, false);
      }
      if (this.targetsVar && !this.targetsVar.tensor.isDisposed) {
        this.targetsVar.assign(targets);
      } else {
        this.targetsVar = new GVariable(targets, false);
      }
    });
  }

  prepareNextTrainBatch(): void {
    this.prepareBatch(generateBatch(this.taskSplit.trainSetIter, this.config.batchSize));
  }

  updateGradsAndLoss() {
    tf.tidy(() => {
      const { grads, loss } = this._calculateGradsAndLoss();
      // TODO: think about how to allow gradVar: GVariableOrScalar
      // The issue is that
      jstree.forEachZip(
        (newGrad: GTensorOrScalar, gradVar: GVariable<string>) => gradVar.assign(newGrad),
        grads,
        this.grads
      );

      // gtensorTrees.forEachZip((newGrad: GTensor<string>, gradVar: GVariable<string>) =>
      //   gradVar.assign(newGrad),
      //   grads as JsTreeGTensor, this.gradVarsTree);
      this.batchMeanLoss = loss.dataSync()[0];
    });
  }

  updateLoss(): number {
    tf.tidy(() => {
      const loss = this.lossFn(this.spec, this.params, this.inputsVar, this.targetsVar);
      this.batchMeanLoss = loss.dataSync()[0];
    });
    return this.batchMeanLoss;
  }

  // TODO: posible (minor?) optimization: store lr scalar in var and reuse it.
  updateParamsWithGrad(lr: number) {
    this.updateParamsFn((paramVar, grad) => paramVar.pointwiseSub(grad.scalarMul(makeScalar(lr))));
    // tf.tidy(() => {
    //   // TODO treating these as GVariable<string> hides the fact that they can
    //   // be scalars (GVariable<never>). But when that happens both paramVar and
    //   // grad will both be scalars. We need a way for the types to capture that
    //   // in a common zip function. I think we need a type for shapes, and the
    //   // different shape cases.
    //   this.params.forEachZip(
    //     (paramVar: GVariable<string>, grad: GTensor<string>) =>
    //       paramVar.assign(paramVar.pointwiseSub(grad._tfScalarMul(tf.scalar(lr))))
    //     ,
    //     this.grads);
    // });
  }

  // TODO: posible (minor?) optimization: store lr scalar in var and reuse it.
  updateParamsFn(
    f: (paramVar: GTensor<string>, grad: GTensor<string>, i: number) => GTensor<string>
  ) {
    tf.tidy(() => {
      // TODO treating these as GVariable<string> hides the fact that they can
      // be scalars (GVariable<never>). But when that happens both paramVar and
      // grad will both be scalars. We need a way for the types to capture that
      // in a common zip function. I think we need a type for shapes, and the
      // different shape cases.
      jstree.forEachZip(
        (paramVar: GVariable<string>, grad: GTensor<string>, i) =>
          paramVar.assign(f(paramVar, grad, i)),
        this.params,
        this.grads
      );
    });
  }

  // Memory cleanup.
  dispose() {
    // this.params.forEach(g => g.dispose());
    jstree.forEach<GVariable<any>>((g) => g.dispose(), this.grads);
    // for (const pt of this.ownedGVarTrees) {
    //   pt.forEach(p => p.dispose());
    // }
    this.inputsVar.dispose();
    this.targetsVar.dispose();
  }
}

export function trySgdTrainStep<
  SpecKind,
  Params extends VarParams,
  InputDims extends DName,
  TargetDims extends DName
>(state: TrainState<SpecKind, Params, InputDims, TargetDims>): boolean {
  // The first batch is already prepared, so we update to the next train batch
  // only when nsteps > 0.
  if (state.nSteps > 0) {
    state.prepareNextTrainBatch();
  }
  state.updateParamsWithGrad(state.config.learningRate);
  state.updateGradsAndLoss();
  state.nSteps++;
  state.nExamples += state.batchExamples.length;
  return true;
}
