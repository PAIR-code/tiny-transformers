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
/**
 * The shared environment between specification between webworkers and the AI
 * lab environment.
 */

import { BasicLmTaskConfig, Example } from 'src/lib/seqtasks/util';
import { TransformerConfig, TransformerParams } from 'src/lib/transformer/transformer_gtensor';
import { cellSpec, Metrics } from 'src/lib/weblab/cellspec';
import { SerializeTensorParams } from 'src/lib/gtensor/params';

export type Batch = {
  batchId: number;
  inputs: string[][];
  outputs: string[][];
};

export type TrainConfig = {
  // Training hyper-params
  learningRate: number;
  batchSize: number;
  maxInputLength: number;
  // Eval
  testSetSize: number;
  checkpointFrequencyInBatches: number;
  metricReporting: {
    metricFrequencyInBatches: number;
  };
};

export type EnvModel = {
  config: TransformerConfig;
  serializedParams?: SerializeTensorParams<TransformerParams>;
};

export type Globals = {
  taskConfig: BasicLmTaskConfig<{}>;
  model: EnvModel;
  trainConfig: TrainConfig;
  batch: Batch;
  testSet: Example[];
  lastTrainMetric: Metrics<'entropyLoss' | 'accuracy'>;
};
export const globals: Partial<Globals> = {};

// Note: one the advantages of this global var namespace approach is that you
// can work with partial global var namespace, and worker can simply wait for
// objects to be constructed.
//
// The alternative require definition of empty/initial objects for all types,
// and handling these dummy base-cases; which often feels like a distraction.
// (although longer term you do want to be able to always have some kind of
// dummy/test values...)
export const trainerCell = cellSpec(
  globals,
  'Trainer cell',
  () => new Worker(new URL('./trainer-cell.worker', import.meta.url)),
  ['testSet', 'trainConfig', 'model', 'batch'],
  ['model', 'lastTrainMetric']
);

// const globalSpace = new SignalSpace();
// const { writable } = globalSpace;

// export const trainerSpec = {
//   name: 'Trainer cell',
//   workerFn: () => new Worker(new URL('./trainer-cell.worker', import.meta.url)),
//   data: {
//     model: writable({ config: defaultTransformerConfig }),
//     testSet: writable<Example[]>([]),
//     batch: writable<Batch>({ batchId: -1, inputs:[], outputs: []}),

//   },
// };

// cellSpec(
//   globals,
//   'Trainer cell',
//   () => new Worker(new URL('./trainer-cell.worker', import.meta.url)),
//   ['testSet', 'trainConfig', 'model', 'batch'],
//   ['model', 'lastTrainMetric']
// );
