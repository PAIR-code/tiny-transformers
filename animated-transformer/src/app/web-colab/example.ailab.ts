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

import { nodeToFsa } from 'memfs/lib/node-to-fsa';
import { fs } from 'memfs';
import os from 'os';
import { WorkerOp } from './worker-op';
import { WorkerEnv } from './worker-env';
import { SerializedGTensor } from 'src/lib/gtensor/gtensor';

export type Name = string;
export type TensorValue = {
  t: SerializedGTensor<'a'>;
  v: number;
} | null;

export type Globals = {
  name: Name;
  t: TensorValue;
};

// export const exampleWorkerOp = {
//   workerPath: './app.worker',
//   inputs: ['name'] as const,
//   outputs: ['t'] as const,
// } as WorkerOp<'name', 't'>;

export const exampleWorkerOp = new WorkerOp('./app.worker', {
  inputs: ['name'],
  outputs: ['t'],
});

export type OpInputs<Op> = Op extends WorkerOp<infer I, any> ? I : never;

type ExampleInput = OpInputs<typeof exampleWorkerOp>;

type ExampleInput2 = typeof exampleWorkerOp extends WorkerOp<infer I, any>
  ? I
  : never;
