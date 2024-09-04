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

import { BasicLmTask, BasicLmTaskConfig, Example, indexExample } from 'src/lib/seqtasks/util';
import { TransformerConfig, TransformerParams } from 'src/lib/transformer/transformer_gtensor';
import { WritableSignal } from 'src/lib/weblab/signalspace';
import { cellFactory, Metrics } from 'src/lib/weblab/cellspec';
import { TaskConfig } from 'src/lib/seqtasks/task_registry';

export type TrainConfig = {
  learningRate: number;
  batchSize: number;
  maxInputLength: number;
  checkpointFrequencyInBatches: number;
  metricReporting: {
    metricFrequencyInBatches: number;
  };
};

export type Globals = {
  taskConfig: TaskConfig;
  transformerConfig: TransformerConfig;
  transformerParams: TransformerParams;
  trainConfig: TrainConfig;
  testSet: Example[];
  lastTrainMetric: Metrics<'entropyLoss' | 'accuracy'>;
};
export const globals: Partial<Globals> = {};

export const trainerCell = cellFactory(
  globals,
  'Trainer cell',
  () => new Worker(new URL('./trainer-cell.worker', import.meta.url)),
  ['testSet', 'trainConfig', 'transformerConfig'],
  ['transformerParams', 'lastTrainMetric']
);
