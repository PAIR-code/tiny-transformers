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
import { Batch, globals, trainerCell } from './ailab';
import {
  computeTransformer,
  transformerAccuracy,
  TransformerConfig,
  lastTokenCrossEntropyLoss,
  TransformerParams,
  TransformerModel,
  VarTransformerParams,
  initDecoderParams,
} from 'src/lib/transformer/transformer_gtensor';
import {
  assignParams,
  deserializeParams,
  disposeParams,
  listifyVarParams,
  SerializeTensorParams,
  varifyParams,
} from 'src/lib/gtensor/params';

const cell = new StatefulCell(globals, trainerCell);
const { computed, effect, writable } = cell.space;

const metrics = writable({ batchId: -1, values: { entropyLoss: -1, accuracy: -1 } });
const { reportMetrics } = makeMetricReporter(cell.space, metrics);
effect(() => cell.output('lastTrainMetric', metrics()));

type LossOptions = {
  maxInputLength: number;
  metricFrequency: number;
  checkpointFrequency: number;
};

function computeLoss(model: TransformerModel, batch: Batch, options: LossOptions): tf.Scalar {
  const gtensorInputs = strSeqPrepFnAddingFinalMask(model, batch.inputs, options);
  // const gtensorInputs = strSeqPrepFn(model, batch.inputs, options);
  const computation = computeTransformer(model, gtensorInputs);
  const nextTokenIdx = singleNextTokenIdxOutputPrepFn(model, batch.outputs);
  const entropyLoss = lastTokenCrossEntropyLoss(model, computation, nextTokenIdx);
  if (batch.batchId % options.metricFrequency === 0) {
    const accuracy = transformerAccuracy(model, computation, nextTokenIdx);
    reportMetrics(batch.batchId, { entropyLoss, accuracy });
  }
  if (batch.batchId % options.checkpointFrequency === 0) {
    console.log('TODO: save checkpoint');
  }
  return entropyLoss;
}

// TODO: instead of updating all params at the same time, we should use some
// streaming iterator through the parts... (to save memory), and allow
// transfer to happen at the same time as we assign in the GPU.
function updateModel(
  newModel: { config?: TransformerConfig; params?: SerializeTensorParams<TransformerParams> },
  oldModel?: { config: TransformerConfig; params: VarTransformerParams }
): { config: TransformerConfig; params: VarTransformerParams } {
  const { config, params } = newModel;
  if (config) {
    // Use the new params and config.
    if (oldModel) {
      disposeParams(oldModel.params);
    }
    if (params) {
      return { config, params: varifyParams(deserializeParams(params)) };
    } else {
      return { config, params: varifyParams(initDecoderParams(config)) };
    }
  } else {
    if (params && oldModel) {
      // new params for existing config.
      assignParams(oldModel.params, deserializeParams(params));
      return oldModel;
    } else {
      throw new Error('updateModel called with no params and no config, what do you expect?');
    }
  }
}

cell.run(async (inputs) => {
  const model = writable(updateModel(inputs.model()));
  effect(() => {
    updateModel(inputs.model(), model());
  });
  const varParamList = computed(() => listifyVarParams(model().params).map((g) => g.variable));

  const options = computed(() => {
    const trainConfig = inputs.trainConfig();
    return {
      maxInputLength: trainConfig.maxInputLength,
      metricFrequency: trainConfig.metricReporting.metricFrequencyInBatches,
      checkpointFrequency: trainConfig.checkpointFrequencyInBatches,
    };
  });

  let optimizer = tf.train.adam();

  effect(() => {
    optimizer.minimize(
      () => computeLoss(model(), inputs.batch(), options()),
      false,
      varParamList()
    );
  });

  await cell.onceFinishRequested.then(() => {
    if (optimizer) {
      optimizer.dispose();
    }
    disposeParams(model().params);
  });
});

// console.log(
//   `batch: ${batchId} `.padEnd(15) +
//     ('entropyLoss: ' + entropyLoss.arraySync().toFixed(8)).padEnd(25) +
//     ('accuracy: ' + accuracy.arraySync().toFixed(8)).padEnd(25)
// );
