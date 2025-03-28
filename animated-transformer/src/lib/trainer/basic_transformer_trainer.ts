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

// TODO: add regulariztion methods, e.g. weight decay/L2/L1/Ln regularization.

import { GTensor } from '../gtensor/gtensor';
import * as transformer from '../transformer/transformer_gtensor';
import * as tf from '@tensorflow/tfjs';
import {
  BasicLmTask,
  BasicRandLmTask,
  Example,
  splitGenerativeTaskTestSet,
} from '../seqtasks/util';
import { BasicTaskTokenRep, StrSeqPrepFn } from '../tokens/token_gemb';
import { transformerAccuracy, lastTokenCrossEntropyLoss } from '../transformer/common_transformer';
import { TaskDatasetSplit, TrainState, TrainStateConfig } from './train_state';
import { RandomStream, makeRandomStream } from '../random/random';
// import { GTensorTree, GVariableTree } from 'src/lib/gtensor/gtensor_tree';

// Handy abbreviation for a Transformer Training state.
// This lets us write `new TransformerTrainState(...)`
export type TransformerTrainState = TrainState<
  transformer.TransformerParamSpec,
  transformer.VarTransformerParams,
  'batch' | 'pos' | 'inputRep',
  'batch'
>;

export interface TrainMetrics {
  nExamples: number;
  nEpochs: number;
  nSteps: number;
  // loss is per example normalized.
  trainBatchMeanLoss: number;
  testMeanLoss: number;
  // Accuracy.
  trainBatchAcc: number;
  testAcc: number;
}

export function initTransformerTrainState(
  task: BasicRandLmTask,
  model: {
    config: transformer.TransformerConfig;
    params: transformer.VarTransformerParams;
  },
  inputPrepFn: StrSeqPrepFn<transformer.VarTransformerParams, 'batch' | 'pos' | 'inputRep'>,
  targetPrepFn: (
    model: { config: { tokenRep: BasicTaskTokenRep } },
    outputSeqs: string[][]
  ) => GTensor<'batch'>,
  trainStateConfig: TrainStateConfig
): TransformerTrainState {
  function transformerLastTokenLoss(
    model: {
      config: { spec: transformer.TransformerParamSpec };
      params: transformer.VarTransformerParams;
    },
    inputs: GTensor<'batch' | 'pos' | 'inputRep'>,
    targets: GTensor<'batch'>,
    generator: RandomStream
  ): tf.Scalar {
    const decoderComputation = transformer.computeTransformer(model, inputs, generator);
    const loss = lastTokenCrossEntropyLoss(model, decoderComputation, targets);
    return loss as tf.Scalar;
  }

  const { testSetExamples, testSetIndex, trainExamples } = splitGenerativeTaskTestSet(
    trainStateConfig.testSetSize,
    task.exampleIter
  );

  const taskDatasetSplit: TaskDatasetSplit = {
    task,
    testSetIndex,
    testSetExamples,
    trainSetIter: trainExamples,
  };

  // Create generator for neural network randomness (e.g. dropout).
  const generator: RandomStream = makeRandomStream(model.config.init.seed);

  // console.log('testSetIndex.size:', testSetIndex.size);
  // console.log('testSetIndex.values:', [...testSetIndex.values()]);

  // We use ! because assignment is inside tf.tidy.
  let state!: TransformerTrainState;
  tf.tidy(() => {
    state = new TrainState(
      model,
      trainStateConfig,
      transformerLastTokenLoss,
      taskDatasetSplit,
      inputPrepFn,
      targetPrepFn,
      generator
    ) as TransformerTrainState;
  });
  return state;
}

export function computeMetrics(state: TransformerTrainState): TrainMetrics {
  const trainBatchAcc: number = computeStateBatchAccuracy(state);
  const testLossAndAcc = computeLossAndAccuracy(state, state.taskSplit.testSetExamples);
  return {
    nExamples: state.nExamples,
    nEpochs: state.nExamples / state.epochSize - 1,
    nSteps: state.nSteps,
    trainBatchMeanLoss: state.batchMeanLoss,
    trainBatchAcc,
    testAcc: testLossAndAcc.acc,
    testMeanLoss: testLossAndAcc.meanLoss,
  };
}

export function computeStateBatchAccuracy(state: TransformerTrainState): number {
  let meanAcc: number = -1;
  tf.tidy(() => {
    const decoderComputation = transformer.computeTransformer(
      state.model,
      state.inputsVar,
      state.generator
    );
    meanAcc = transformerAccuracy(state.model, decoderComputation, state.targetsVar).dataSync()[0];
  });
  return meanAcc;
}

export function computeLossAndAccuracy(
  state: TransformerTrainState,
  examples: Example[]
): { meanLoss: number; acc: number } {
  let meanAcc: number = -1;
  let meanLoss: number = -1;
  const meanAccPerBatch: number[] = [];
  const meanLossPerBatch: number[] = [];
  tf.tidy(() => {
    const initBatchExamples = state.batchExamples;
    const initBatchLoss = state.batchMeanLoss;
    for (let i = 0; i < examples.length; i += state.config.batchSize) {
      const testSetBatch = examples.slice(i, i + state.config.batchSize);
      state.prepareBatch(testSetBatch);
      const decoderComputation = transformer.computeTransformer(
        state.model,
        state.inputsVar,
        state.generator
      );
      const batchAcc = transformerAccuracy(
        state.model,
        decoderComputation,
        state.targetsVar
      ).dataSync()[0];
      meanAccPerBatch.push(batchAcc);
      meanLossPerBatch.push(state.updateLoss());
    }
    meanAcc = meanAccPerBatch.reduce((prev, cur) => cur + prev) / meanAccPerBatch.length;
    meanLoss = meanLossPerBatch.reduce((prev, cur) => cur + prev) / meanLossPerBatch.length;
    state.prepareBatch(initBatchExamples);
    state.batchMeanLoss = initBatchLoss;
  });
  return { acc: meanAcc, meanLoss };
}

// ----------------------------------------------------------------------------
/**
 * Train Transformer using SGD.
 *
 * TODO: do this in a webworker & provide updates/params out when/as they are
// wanted.
 */
// export function* SgdTrainTransfomer(
//   state: TransformerTrainState,
// ): Generator<TrainMetrics, undefined, undefined> {
//   let lastReportedAtStep = 0;
//   yield computeMetrics(state);
//   while (trySgdTrainStep(state)) {
//     if (state.nSteps - lastReportedAtStep >= state.config.updateEveryNsteps) {
//       lastReportedAtStep = state.nSteps;
//       yield computeMetrics(state);
//     }
//   }
//   if (state.nSteps > lastReportedAtStep) {
//     yield computeMetrics(state);
//   }
//   return;
// }

// type T = transformer.TransformerParams<VariableKind> extends transformer.TransformerParams<TensorKind> ? true : never;

// const t: { v: GVariable<any>[] } = {} as any;

// function f(x: { v: GTensor<any>[] }) {
//   return;
// }

// f(t);
