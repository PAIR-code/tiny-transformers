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


import { GTensor, DName, GVariable, GTensorOrScalar } from '../gtensor/gtensor';
import * as tf from '@tensorflow/tfjs';
import { BasicLmTask, Example, ExampleGenerator, generateBatch } from '../seqtasks/util';
import { GTensorTree, GVariableTree } from '../gtensor/gtensor_tree';
import { gradsVarTreeFunctor } from '../gtensor/grad';
import { BasicTaskTokenRep, StrSeqPrepFn } from '../tokens/token_gemb';

export type TrainingBatch<InputDims extends DName, TargetDims extends DName> = {
  inputs: GTensor<InputDims>;
  // TODO: this is a special case of predicting only a single next token.
  targets: GTensor<TargetDims>;
  nExampleBatchDelta: number,
};

export type TrainStateConfig = {
  learningRate: number;
  batchSize: number;
  maxInputlength: number;
  testSetSize: number;
  trainSetSize: number;
}

export type TaskDatasetSplit = {
  task: BasicLmTask;
  testSetIndex: Set<string>,
  testSetExamples: Example[];
  trainSetGen: ExampleGenerator;
}

export type TrainingBatchGenerator<I extends DName, T extends DName> =
  Generator<TrainingBatch<I, T>, undefined, undefined>;

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
  // etc)
  SpecKind,
  // Defines the specific parameter names & values (created by the SpecKind)
  ParamsKind,
  // The inputed dimension names of the model
  InputDims extends DName,
  // The outputed dimension names of the model
  TargetDims extends DName> = (
    spec: SpecKind,
    params: ParamsKind,
    inputs: GTensor<InputDims>,
    targets: GTensor<TargetDims>
  ) => tf.Scalar;

// Class to hold state, primarily for memory management.
export class TrainState<
  SpecKind,
  ParamsKind,
  InputDims extends DName,
  TargetDims extends DName,
> {
  // The examples we intended to put in the batch.
  batchExamples: Example[] = [];
  batchMeanLoss = 0;
  nSteps = 0;
  nExamples = 0;
  epochSize = 0;
  grads: GVariableTree<ParamsKind>;

  // Initialized within the tf.tidy call, which is synchronous.
  inputsVar!: GVariable<InputDims>;
  targetsVar!: GVariable<TargetDims>;

  _calculateGradsAndLoss: () => {
    grads: GTensorTree<ParamsKind>;
    loss: tf.Scalar;
  }

  /**
   * This class takes ownership of params, taking responsibility for
   * its memory cleanup.
   */
  constructor(
    // SpecKind defines the meta-data for the model's specification, e.g.
    // hyper-params for the transformer model itself (dimension size, nLayers,
    // etc)
    public spec: SpecKind,
    // Does not own params.
    public params: GVariableTree<ParamsKind>,
    public config: TrainStateConfig,
    public lossFn: LossFn<SpecKind, ParamsKind, InputDims, TargetDims>,
    public tokenRep: BasicTaskTokenRep,
    public taskSplit: TaskDatasetSplit,
    public inputPrepFn: StrSeqPrepFn<InputDims>,
    public targetPrepFn: StrSeqPrepFn<TargetDims>,
  ) {

    // Make a copy of params with GVariables of zero value. init grad = 0
    this.grads = this.params.map(t => new GVariable(t.zero()));

    // Note: creating the function (gradsFunctor) doesn't create or do any
    // tensor computation, that's why we don't need a tf.tidy here, but when we
    // call this._calculateGradsAndLoss, then we will need to wrap it in
    // tf.tidy.
    //
    // TODO: Maybe wrap gradients into a special class that by default only
    // stores the list of tensors for the params, and only on request re-creates
    // the same shape as the params. Ater all, we only need the shape after the
    // number of training steps when the caller wants to programatically do
    // stuff with the udpated params.
    this._calculateGradsAndLoss = gradsVarTreeFunctor(this.params,
      () => this.lossFn(
        this.spec, this.params.obj, this.inputsVar, this.targetsVar));

    this.initInputsAndTargets();
  }

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
        this.tokenRep, this.config.maxInputlength, examples.map(e => e.input));
      const targets = this.targetPrepFn(
        this.tokenRep, this.config.maxInputlength, examples.map(e => e.output));
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
    this.prepareBatch(generateBatch(this.taskSplit.trainSetGen, this.config.batchSize));
  }

  updateGradsAndLoss() {
    tf.tidy(() => {
      const { grads, loss } = this._calculateGradsAndLoss();
      // TODO: think about how to allow gradVar: GVariableOrScalar
      // The issue is that
      grads.forEachZip(
        (newGrad: GTensorOrScalar, gradVar: GVariable<string>) =>
          gradVar.assign(newGrad),
        this.grads);

      // gtensorTrees.forEachZip((newGrad: GTensor<string>, gradVar: GVariable<string>) =>
      //   gradVar.assign(newGrad),
      //   grads as JsTreeGTensor, this.gradVarsTree);
      this.batchMeanLoss = loss.dataSync()[0];
    });
  }

  updateLoss(): number {
    tf.tidy(() => {
      const loss = this.lossFn(
        this.spec, this.params.obj, this.inputsVar, this.targetsVar)
      this.batchMeanLoss = loss.dataSync()[0];
    });
    return this.batchMeanLoss;
  }

  // TODO: posible (minor?) optimization: store lr scalar in var and reuse it.
  updateParamsWithGrad(lr: number) {
    tf.tidy(() => {
      // TODO treating these as GVariable<string> hides the fact that they can
      // be scalars (GVariable<never>). But when that happens both paramVar and
      // grad will both be scalars. We need a way for the types to capture that
      // in a common zip function. I think we need a type for shapes, and the
      // different shape cases.
      this.params.forEachZip(
        (paramVar: GVariable<string>, grad: GTensor<string>) =>
          paramVar.assign(paramVar.pointwiseSub(grad._tfScalarMul(tf.scalar(lr))))
        ,
        this.grads);
    });
  }

  // Memory cleanup.
  dispose() {
    // this.params.forEach(g => g.dispose());
    this.grads.forEach(g => g.dispose());
    this.inputsVar.dispose();
    this.targetsVar.dispose();
  }
}

export function trySgdTrainStep<
  SpecKind, ParamsKind, InputDims extends DName, TargetDims extends DName>(
    state: TrainState<SpecKind, ParamsKind, InputDims, TargetDims>): boolean {
  // The first batch is already prepared, so we update to the next train batch
  // only when nsteps > 0.
  if (state.nSteps > 0) {
    state.prepareNextTrainBatch()
  }
  state.updateParamsWithGrad(state.config.learningRate);
  state.updateGradsAndLoss();
  state.nSteps++;
  state.nExamples += state.batchExamples.length;
  return true;
}
