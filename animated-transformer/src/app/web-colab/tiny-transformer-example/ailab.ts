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
import { CellSpec, Kind, Metrics } from 'src/lib/weblab/cellspec';
import { SerializeTensorParams } from 'src/lib/gtensor/params';
import { TinyWorldTaskConfig } from 'src/lib/seqtasks/tiny_worlds';

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

export enum ModelUpdateKind {
  ReinitFromConfig = 'ReinitFromConfig',
  ReplaceParams = 'ReplaceParams',
  ReplaceParamsAndConfig = 'ReplaceParamsAndConfig',
  Null = 'Null',
}

export type ModelUpdate =
  | {
      kind: ModelUpdateKind.ReplaceParams;
      config: TransformerConfig;
      serializedParams: SerializeTensorParams<TransformerParams>;
    }
  | {
      kind: ModelUpdateKind.ReinitFromConfig;
      config: TransformerConfig;
    }
  | {
      kind: ModelUpdateKind.ReplaceParamsAndConfig;
      config: TransformerConfig;
      serializedParams: SerializeTensorParams<TransformerParams>;
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

export const trainerCellSpec = new CellSpec({
  cellName: 'Trainer cell',
  workerFn: () => new Worker(new URL('./trainer-cell.worker', import.meta.url)),
  inputs: {
    testSet: Kind<Example[]>,
    modelUpdateEvents: Kind<ModelUpdate>,
    trainConfig: Kind<TrainConfig>,
    nextTrainBatch: Kind<Batch>,
  },
  outputs: {
    lastTrainMetric: Kind<SimpleMetrics>,
    checkpoint: Kind<Checkpoint>,
  },
});

export type TaskGenSate =
  | { kind: 'paused' }
  | {
      kind: 'generating';
      // Current batch seen
      curBatchId: number;
      // generate up to this many in the message queue
      batchMaxQueueSize: number;
      // max number of batches to generate
      maxBatches: number;
    }
  | { kind: 'finished' };

export const taskCellSpec = new CellSpec({
  cellName: 'Task cell',
  workerFn: () => new Worker(new URL('./task-cell.worker', import.meta.url)),
  inputs: {
    taskConfig: Kind<TinyWorldTaskConfig>,
    testSetSize: Kind<number>,
    batchSize: Kind<number>,
    useBatchSeed: Kind<number | null>,
    taskGenState: Kind<TaskGenSate>,
  },
  outputs: {
    nextTrainBatch: Kind<Batch>,
    testSet: Kind<Example[]>,
  },
});
