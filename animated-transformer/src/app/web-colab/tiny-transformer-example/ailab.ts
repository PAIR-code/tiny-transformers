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

import { Example, RandLmTaskConfig } from 'src/lib/seqtasks/util';
import { TransformerConfig, TransformerParams } from 'src/lib/transformer/transformer_gtensor';
import { cellSpec, Metrics } from 'src/lib/weblab/cellspec';
import { SerializeTensorParams } from 'src/lib/gtensor/params';

export type SimpleMetrics = Metrics<'entropyLoss' | 'accuracy'>;

export type Batch = {
  batchId: number; // just a counter
  nextSeed: number; // Unique ID that generates the batch.
  inputs: string[][]; // every example input is a string[] of tokens.
  outputs: string[][]; // every example output is a string[] of tokens.
};

export type TrainConfig = {
  id: string;
  kind: 'basicSeqTrainer';
  // Training hyper-params
  learningRate: number;
  batchSize: number;
  maxInputLength: number;
  trainForBatches: number;
  // Eval/reporting/saving
  checkpointFrequencyInBatches: number;
  metricReporting: {
    metricFrequencyInBatches: number;
  };
};

export type EnvModel = {
  config: TransformerConfig;
  serializedParams?: SerializeTensorParams<TransformerParams>;
};

export type Checkpoint = {
  config: TransformerConfig;
  serializedParams: SerializeTensorParams<TransformerParams>;
  lastBatch: Batch;
  metrics: SimpleMetrics;
};

// Note: one the advantages of this kind of global var namespace approach is
// that you can work with partial global var namespace, and worker can simply
// wait for objects to be constructed.
//
// The alternative require definition of empty/initial objects for all types,
// and handling these dummy base-cases; which often feels like a distraction.
// (although longer term you do want to be able to always have some kind of
// dummy/test values...)
//
// CONSIDER: add some type annotations for things being for
// Input/Ouput/StreamIn/StreamOut/Channel/etc.
//
// Then maybe all would be needed is cellSpec:
//
// ```
// cellSpec(
//   trainerVars,
//   'Trainer cell',
//   () => new Worker(new URL('./trainer-cell.worker', import.meta.url)));
// ```
export type TrainerVars = {
  // input...
  testSet: Example[];
  initModel: EnvModel;
  trainConfig: TrainConfig;
  nextTrainBatch: Batch;
  // output...
  lastTrainMetric: SimpleMetrics;
  checkpoint: Checkpoint;
};
export const trainerVars: Partial<TrainerVars> = {};
export const trainerCellSpec = cellSpec(
  trainerVars,
  'Trainer cell',
  () => new Worker(new URL('./trainer-cell.worker', import.meta.url)),
  ['testSet', 'trainConfig', 'initModel', 'nextTrainBatch'],
  ['checkpoint', 'lastTrainMetric']
);

export type TaskGenSate =
  | { kind: 'paused' }
  | { kind: 'generating'; lastBatchId: number }
  | { kind: 'finished' };

export type TaskVars = {
  // The task to generate from.
  taskConfig: RandLmTaskConfig;
  // Test set size + taskConfig is used to generated the test set.
  testSetSize: number;
  // Last seed allows us to restart from a given state/location.
  lastBatchSeed: number | null;
  // The size of the batch.
  batchSize: number;
  // A way to start/stop generation explicitly.
  taskGenState: TaskGenSate;
  // When generating, limit generation to at most this many examples in queue.
  maxBatchesQueueSize: number;
  // Last Id is used to provide back-pressure to stop generating we training
  // can't keep up with generation.
  lastBatchId: number;

  // These are output...
  nextTrainBatch: Batch;
  testSet: Example[];
};
export const taskVars: Partial<TaskVars> = {};

export const taskCellSpec = cellSpec(
  taskVars,
  'Task cell',
  () => new Worker(new URL('./task-cell.worker', import.meta.url)),
  [
    'taskConfig',
    'testSetSize',
    'batchSize',
    'lastBatchSeed',
    'taskGenState',
    'maxBatchesQueueSize',
  ],
  ['nextTrainBatch', 'testSet']
);
