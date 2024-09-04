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
  BasicTaskTokenRep,
  singleNextTokenIdxOutputPrepFn,
  strSeqPrepFn,
} from 'src/lib/tokens/token_gemb';
import { StatefulCell, makeMetricReporter, space } from '../../../lib/weblab/lab-cell';
import { globals, trainerCell } from './ailab';
import {
  computeDecoder,
  computeTransformer,
  transformerAccuracy,
  TransformerComputation,
  TransformerConfig,
  lastTokenCrossEntropyLoss,
  TransformerParams,
  TransformerParamSpec,
} from 'src/lib/transformer/transformer_gtensor';
import { Signal } from 'src/lib/weblab/signalspace';

const { lastMetrics, reportMetrics } = makeMetricReporter(['entropyLoss', 'accuracy']);

type ComputeOptions = {
  maxInputLength: number;
  metricFrequency: Signal<number>;
  checkpointFrequency: Signal<number>;
};

type Batch = {
  batchId: number;
  inputs: string[][];
  outputs: string[][];
};

type Model = {
  config: { spec: TransformerParamSpec };
  params: TransformerParams;
  tokenRep: BasicTaskTokenRep;
};

function computeLoss(model: Model, batch: Batch, options: ComputeOptions): tf.Scalar {
  const gtensorInputs = strSeqPrepFn(model, batch.inputs, options);
  const computation = computeTransformer(model, gtensorInputs);
  const nextTokenIdx = singleNextTokenIdxOutputPrepFn(model, batch.outputs);
  const entropyLoss = lastTokenCrossEntropyLoss(model, computation, nextTokenIdx);
  if (batch.batchId % options.metricFrequency() === 0) {
    const accuracy = transformerAccuracy(model, computation, nextTokenIdx);
    reportMetrics(batch.batchId, { entropyLoss, accuracy });
  }
  if (batch.batchId % options.checkpointFrequency() === 0) {
    console.log('TODO: save checkpoint');
  }
  return entropyLoss;
}

const cell = new StatefulCell(globals, trainerCell);
cell.run((inputs) => {
  const metricFrequency = space.computed(
    () => inputs.trainConfig().metricReporting.metricFrequencyInBatches
  );
  const checkpointFrequency = space.computed(
    () => inputs.trainConfig().checkpointFrequencyInBatches
  );

  // train with optimiztaion
  const batchNum: number = 300;
  const batchSize: number = 64;

  let optimizer = tf.train.adam();
  let batchId = 0;
  for (let batch of batchGenerator(trainTask, batchNum, batchSize)) {
    let [batchInput, batchOutput] = batch;
    optimizer.minimize(() =>
      computeLoss(
        model, 
        batch, 
        options)
      )
    );
    batchId += 1;
  }
  optimizer.dispose();

  space.effect(() => {
    cell.output('lastTrainMetric', lastMetrics());
  });
});

// console.log(
//   `batch: ${batchId} `.padEnd(15) +
//     ('entropyLoss: ' + entropyLoss.arraySync().toFixed(8)).padEnd(25) +
//     ('accuracy: ' + accuracy.arraySync().toFixed(8)).padEnd(25)
// );
