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
import { StatefulCell } from 'src/lib/weblab/lab-worker-cell';
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
import { accuracy } from '@tensorflow/tfjs-vis/dist/util/math';
import { Metrics } from 'src/lib/weblab/cellspec';
import { GTensor } from 'src/lib/gtensor/gtensor';

const cell = new StatefulCell(trainerCellSpec);
const { derived, setable, derivedNullable } = cell.space;

// { batchId: -1, values: { entropyLoss: -1, accuracy: -1 } }

type MetricsToReport = Metrics<'entropyLoss' | 'accuracy'>;

// const metrics = setable<Metrics<'entropyLoss' | 'accuracy'> | null>(null);
// // const { reportMetrics } = makeMetricReporter(cell.space, metrics);
// derivedNullable(() => cell.output('lastTrainMetric', defined(metrics)), { definedDeps: [metrics] });

function shouldCheckpoint(batch: Batch, config: TrainConfig): boolean {
  return batch.batchId % config.checkpointFrequencyInBatches === 0;
}
function shouldReportMetrics(batch: Batch, config: TrainConfig): boolean {
  return (
    batch.batchId % config.metricReporting.metricFrequencyInBatches === 0 ||
    shouldCheckpoint(batch, config)
  );
}

function reportMetrics(
  batch: Batch,
  model: TransformerModel,
  computation: TransformerComputation,
  nextTokenIdx: GTensor<'batch'>,
  entropyLoss: tf.Scalar
): MetricsToReport {
  const accuracy = transformerAccuracy(model, computation, nextTokenIdx);
  const nextMetrics = {
    batchId: batch.batchId,
    values: { entropyLoss: entropyLoss.arraySync(), accuracy: accuracy.arraySync() },
  };
  cell.output('lastTrainMetric', nextMetrics);
  return nextMetrics;
}

function computeLoss(model: TransformerModel, batch: Batch, config: TrainConfig): tf.Scalar {
  const gtensorInputs = strSeqPrepFnAddingFinalMask(model, batch.inputs, config);
  // const gtensorInputs = strSeqPrepFn(model, batch.inputs, options);
  const computation = computeTransformer(model, gtensorInputs);
  const nextTokenIdx = singleNextTokenIdxOutputPrepFn(model, batch.outputs);
  const entropyLoss = lastTokenCrossEntropyLoss(model, computation, nextTokenIdx);
  if (shouldReportMetrics(batch, config)) {
    const nextMetrics = reportMetrics(batch, model, computation, nextTokenIdx, entropyLoss);
    if (shouldCheckpoint(batch, config)) {
      cell.output('checkpoint', {
        config: model.config,
        serializedParams: serializeParams(model.params),
        lastBatch: batch,
        metrics: nextMetrics,
      });
    }
  }
  return entropyLoss;
}

type Model = { config: TransformerConfig; params: VarTransformerParams };

// TODO: instead of updating all params at the same time, we should use some
// streaming iterator through the parts... (and save memory), and allow
// transfer to happen at the same time as we assign in the GPU.
function updateModel(modelUpdate: ModelUpdate, modelSignal: SetableSignal<Model | null>) {
  console.log(`...updateModel ${modelUpdate.kind}`);

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

cell.run(async () => {
  const { modelUpdateEvents: modelUpdates, trainConfig, nextTrainBatch } = await cell.onceAllInputs;

  console.log('trainer has all inputs...');

  const model = setable<Model | null>(null);
  derived(() => updateModel(modelUpdates(), model));
  // Technically, because 'varParamList' is all vars, we don't need to do this;
  // But I want to show how you can backprop/update only to selected params if
  // you wanted.
  const varParamList = derivedNullable(
    () => listifyVarParams(defined(model).params).map((g) => g.variable),
    { definedDeps: [model] }
  );

  let optimizer = tf.train.adam();

  derivedNullable(
    () => {
      console.log('optimizer.minimize...');

      optimizer.minimize(
        () => computeLoss(defined(model), nextTrainBatch(), trainConfig()),
        false,
        defined(varParamList)
      );
      console.log('done a step!');
    },
    { definedDeps: [model, varParamList] }
  );

  await cell.onceFinishRequested.then(() => {
    console.log('cell.onceFinishRequested: disposing stuff');
    if (optimizer) {
      optimizer.dispose();
    }
    const m = model();
    if (m) {
      disposeParams(m.params);
    }
  });
});
// console.log(
//   `batch: ${batchId} `.padEnd(15) +
//     ('entropyLoss: ' + entropyLoss.arraySync().toFixed(8)).padEnd(25) +
//     ('accuracy: ' + accuracy.arraySync().toFixed(8)).padEnd(25)
// );
