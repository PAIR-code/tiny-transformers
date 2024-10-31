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
import { StatefulCell, makeMetricReporter } from '../../../lib/weblab/lab-worker-cell';
import {
  Batch,
  InitModelAction,
  ProvidedModel,
  TrainConfig,
  trainerCellSpec,
  trainerVars,
} from './ailab';
import {
  computeTransformer,
  transformerAccuracy,
  TransformerConfig,
  lastTokenCrossEntropyLoss,
  TransformerModel,
  VarTransformerParams,
  initDecoderParams,
} from 'src/lib/transformer/transformer_gtensor';
import {
  assignParams,
  deserializeParams,
  disposeParams,
  listifyVarParams,
  varifyParams,
} from 'src/lib/gtensor/params';
import { defined } from 'src/lib/signalspace/signalspace';

const cell = new StatefulCell(trainerVars, trainerCellSpec);
const { derived, setable, derivedNullable } = cell.space;

const metrics = setable({ batchId: -1, values: { entropyLoss: -1, accuracy: -1 } });
const { reportMetrics } = makeMetricReporter(cell.space, metrics);
derived(() => cell.output('lastTrainMetric', metrics()));

function computeLoss(model: TransformerModel, batch: Batch, config: TrainConfig): tf.Scalar {
  const gtensorInputs = strSeqPrepFnAddingFinalMask(model, batch.inputs, config);
  // const gtensorInputs = strSeqPrepFn(model, batch.inputs, options);
  const computation = computeTransformer(model, gtensorInputs);
  const nextTokenIdx = singleNextTokenIdxOutputPrepFn(model, batch.outputs);
  const entropyLoss = lastTokenCrossEntropyLoss(model, computation, nextTokenIdx);
  if (batch.batchId % config.metricReporting.metricFrequencyInBatches === 0) {
    const accuracy = transformerAccuracy(model, computation, nextTokenIdx);
    reportMetrics(batch.batchId, { entropyLoss, accuracy });
  }
  if (batch.batchId % config.checkpointFrequencyInBatches === 0) {
    console.log('TODO: save checkpoint');
  }
  return entropyLoss;
}

type Model = { config: TransformerConfig; params: VarTransformerParams };

// TODO: instead of updating all params at the same time, we should use some
// streaming iterator through the parts... (and save memory), and allow
// transfer to happen at the same time as we assign in the GPU.
function updateModel(newProvidedModel: ProvidedModel, oldModel: Model | null): Model | null {
  if (newProvidedModel.kind === InitModelAction.ReinitFromConfig) {
    if (oldModel) {
      disposeParams(oldModel.params);
    }
    const config = newProvidedModel.config;
    return { config, params: varifyParams(initDecoderParams(config)) };
  } else if (newProvidedModel.kind === InitModelAction.ReplaceParamsAndConfig) {
    const config = newProvidedModel.config;
    return { config, params: varifyParams(deserializeParams(newProvidedModel.serializedParams)) };
  } else if (newProvidedModel.kind === InitModelAction.ReplaceParams) {
    if (!oldModel) {
      throw new Error('updateModel with InitModelAction.ReplaceParams but model is null');
    }
    assignParams(oldModel.params, deserializeParams(newProvidedModel.serializedParams));
    return oldModel;
  } else {
    //  ProvidedModel === InitModelAction.Null
    if (oldModel) {
      disposeParams(oldModel.params);
    }
    return null;
  }
}

cell.run(async () => {
  const { providedModel, trainConfig, nextTrainBatch } = await cell.onceAllInputs;

  const model = setable<Model | null>(null);
  derived(() => updateModel(providedModel(), model()));
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
      optimizer.minimize(
        () => computeLoss(defined(model), nextTrainBatch(), trainConfig()),
        false,
        defined(varParamList)
      );
    },
    { definedDeps: [model, varParamList] }
  );

  await cell.onceFinishRequested.then(() => {
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
