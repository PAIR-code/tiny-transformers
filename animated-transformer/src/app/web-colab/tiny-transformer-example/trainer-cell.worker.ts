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
/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import {
  singleNextTokenIdxOutputPrepFn,
  strSeqPrepFnAddingFinalMask,
} from 'src/lib/tokens/token_gemb';
import { workerCell } from 'src/lib/weblab/lab-worker-cell';
import {
  Batch,
  ModelUpdateKind,
  ModelUpdate as ModelUpdate,
  TrainConfig,
  trainerCellSpec,
} from './ailab';
import {
  computeTransformer,
  transformerAccuracy,
  TransformerConfig,
  lastTokenCrossEntropyLoss,
  TransformerModel,
  VarTransformerParams,
  initDecoderParams,
  TransformerComputation,
} from 'src/lib/transformer/transformer_gtensor';
import {
  assignParams,
  deserializeParams,
  disposeParams,
  listifyVarParams,
  serializeParams,
  varifyParams,
} from 'src/lib/gtensor/params';
import { defined, SetableSignal } from 'src/lib/signalspace/signalspace';
import { Metrics } from 'src/lib/weblab/cell-types';

// ----------------------------------------------------------------------------
const cell = workerCell(trainerCellSpec);
const { derived, setable, derivedNullable } = cell.space;

// profiling variables.
let optimiserBatchCount = 0;
let optimiserTime = 0;

type MetricsToReport = Metrics<
  | 'entropyLoss'
  | 'accuracy'
  | 'metricTime'
  | 'lossTime'
  | 'avgOptimiserTime'
  | 'optimiserBatchCount'
>;

function shouldCheckpoint(batch: Batch, config: TrainConfig): boolean {
  return batch.batchId % config.checkpointFrequencyInBatches === 0;
}
function shouldReportMetrics(batch: Batch, config: TrainConfig): boolean {
  const report =
    batch.batchId % config.metricReporting.metricFrequencyInBatches === 0 ||
    shouldCheckpoint(batch, config);
  return report;
}

// ----------------------------------------------------------------------------
function computeLoss(model: TransformerModel, batch: Batch, config: TrainConfig): tf.Scalar {
  const lossComputeStartMs = Date.now();
  const gtensorInputs = strSeqPrepFnAddingFinalMask(model, batch.inputs, config);
  // const gtensorInputs = strSeqPrepFn(model, batch.inputs, options);
  const computation = computeTransformer(model, gtensorInputs);
  const nextTokenTargetIdx = singleNextTokenIdxOutputPrepFn(model, batch.outputs);
  const entropyLossTfScalar = lastTokenCrossEntropyLoss(model, computation, nextTokenTargetIdx);
  const lossComputeEndMs = Date.now();
  const lossTime = lossComputeEndMs - lossComputeStartMs;

  if (shouldReportMetrics(batch, config)) {
    const accAndLossStartMs = Date.now();
    const accuracyTfScalar = transformerAccuracy(model, computation, nextTokenTargetIdx);
    const accuracy = accuracyTfScalar.arraySync();
    const entropyLoss = entropyLossTfScalar.arraySync();
    const metricTime = Date.now() - accAndLossStartMs;
    const avgOptimiserTime = optimiserTime / optimiserBatchCount;
    const nextMetrics: MetricsToReport = {
      batchId: batch.batchId,
      values: {
        entropyLoss,
        accuracy,
        metricTime,
        lossTime,
        avgOptimiserTime,
        optimiserBatchCount,
      },
    };
    // TODO: we should move the output stuff into a cached object, and not
    // output it within the loss function; that way we can do proper conjestion
    // control; having said that, probability that consuming thread is slower
    // than training is very unlikely, so in practice its unlikely to blow up.
    cell.outStream.metrics.send(nextMetrics);
    if (shouldCheckpoint(batch, config)) {
      cell.outStream.checkpoint.send({
        config: model.config,
        serializedParams: serializeParams(model.params),
        lastBatch: batch,
        metrics: nextMetrics,
      });
    }
    optimiserBatchCount = 0;
    optimiserTime = 0;
  }
  return entropyLossTfScalar;
}

type Model = { config: TransformerConfig; params: VarTransformerParams };

// ----------------------------------------------------------------------------
// TODO: instead of updating all params at the same time, we should use some
// streaming iterator through the parts... (and save memory), and allow
// transfer to happen at the same time as we assign in the GPU.
function updateModel(modelUpdate: ModelUpdate, modelSignal: SetableSignal<Model | null>) {
  const model = modelSignal.lastValue();

  if (modelUpdate.kind === ModelUpdateKind.ReinitFromConfig) {
    if (model) {
      disposeParams(model.params);
    }
    const config = modelUpdate.config;
    modelSignal.set({ config, params: varifyParams(initDecoderParams(config)) });
  } else if (modelUpdate.kind === ModelUpdateKind.ReplaceParamsAndConfig) {
    const config = modelUpdate.config;
    modelSignal.set({
      config,
      params: varifyParams(deserializeParams(modelUpdate.serializedParams)),
    });
  } else if (modelUpdate.kind === ModelUpdateKind.ReplaceParams) {
    if (!model) {
      throw new Error('updateModel with InitModelAction.ReplaceParams but model is null');
    }
    assignParams(model.params, deserializeParams(modelUpdate.serializedParams));
  } else {
    //  modelUpdate.kind === ModelUpdateKind.Null
    if (model) {
      disposeParams(model.params);
    }
    modelSignal.set(null);
  }
}

// ----------------------------------------------------------------------------
cell.run(async () => {
  // TODO: Test set should be used for metrics reporting at least, and/or evaluated
  // per checkpoint?
  const { testSet, modelUpdateEvents, trainConfig } = await cell.onceAllInputs;

  const model = setable<Model | null>(null);
  derived(() => updateModel(modelUpdateEvents(), model));
  // Technically, because 'varParamList' is all vars, we don't need to do this;
  // But I want to show how you can backprop/update only to selected params if
  // you wanted.
  const varParamList = derivedNullable(
    () => listifyVarParams(defined(model).params).map((g) => g.variable),
    { definedDeps: [model] }
  );

  let optimizer = tf.train.adam();

  for await (const trainBatch of cell.inStream.trainBatches) {
    if (cell.finishRequested) {
      break;
    }
    optimiserBatchCount++;
    const startAtMs = Date.now();
    optimizer.minimize(
      () => computeLoss(defined(model), trainBatch, trainConfig()),
      false,
      defined(varParamList)
    );
    optimiserTime += Date.now() - startAtMs;
  }

  await cell.onceFinishRequested.then(() => {
    if (optimizer) {
      optimizer.dispose();
    }
    const m = model();
    if (m) {
      disposeParams(m.params);
    }
    model.set(null);
  });
});
