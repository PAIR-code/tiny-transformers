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
 * This is a simple example (web) ailab. This provides an example of defining
 * the types for a cell.
 */

import { BasicLmTask, BasicLmTaskConfig, Example } from 'src/lib/seqtasks/util';
import { TransformerConfig, TransformerParams } from 'src/lib/transformer/transformer_gtensor';
import { TrainStateConfig } from 'src/lib/trainer/train_state';

export type TaskConfig = {
  lmTaskConfig: BasicLmTaskConfig;
};

export type CustomDataSet = {
  descroption: string;
  examples: Example[];
};

export type TestSet = {
  initialTestSeed: number;
  // testSet may contain duplicates, depending on generation dynamics.
  // It is expected they will have distribution according to the generator's
  // specification.
  examples: Example[];
};

export type TrainBatch = {
  initialTrainSeed: number;
  currentBatchNumber: number;
  currentBatchSeed: number;
  examples: Example[];
};

export type ModelConfig = {
  transformerConfig: TransformerConfig;
};

export type Checkpoint = {
  modelConfig: ModelConfig;
  modelParams: TransformerParams;
};

export type OptimiserParams = {};

export type OptimizerState = {
  optimizerConfig: TrainStateConfig;
  optimizerParams?: OptimiserParams;
};

export type Metrics = {
  [metricName: string]: number;
};

export type Evaluation = {
  examples: Example[];
  curMetrics: Metrics;
};

export type EvaluationPoint = {
  checkpoint?: Checkpoint;
  eval: Evaluation;
};

export type EvaluationGraph = {
  evalPoints: EvaluationPoint[];
};

// const initialState: Partial<ExampleGlobals> = {
//   toyInput: 'some initial input',
// };

// // export const exampleWorkerOp = {
// //   workerPath: './app.worker',
// //   inputs: ['name'] as const,
// //   outputs: ['t'] as const,
// // } as WorkerOp<'name', 't'>;
// export const exampleWorkerSpec = new CellSpec<ExampleCellInput, ExampleCellOutput>(
//   'an example cell',
//   // 'src/lib/weblab/example.worker.js' as never as URL,
//   () => new Worker(new URL('./example.worker', import.meta.url)),
//   ['toyInput'], // new URL('http://localhost:9876/_karma_webpack_/example.worker'),
//   ['toyOutputStr', 'toyOutputNumber']
// );
