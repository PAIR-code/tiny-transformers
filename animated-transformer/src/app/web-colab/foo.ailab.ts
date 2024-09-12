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

import { SerializedGTensor } from 'src/lib/gtensor/gtensor';
import { CellStateSpec } from '../../lib/weblab/cellspec';

export type Name = string;
export type TensorValue = {
  t: SerializedGTensor<'a'>;
  v: number;
} | null;

const globals: Partial<Globals> = {
  name: 'some silly fake initial name',
};

export type Globals = {
  name: Name;
  tensor: TensorValue;
};

export type GlobalValue<Name extends string> = { [Key in keyof Globals & Name]: Globals[Key] };

// export const exampleWorkerOp = {
//   workerPath: './app.worker',
//   inputs: ['name'] as const,
//   outputs: ['t'] as const,
// } as WorkerOp<'name', 't'>;

export const exampleWorkerSpec = new CellStateSpec<Globals, 'name', 'tensor'>(
  'example app worker',
  // 'src/lib/weblab/example.worker.js' as never as URL,
  // Hack because angular dev builder does a regexp replacement, so we need the full string of
  // new Worker(new URL('<literal path>', import.meta.url)) in order for dev server and prod
  // build to correctly create these paths.
  () => new Worker(new URL('./app.worker', import.meta.url)),
  ['name'], // new URL('http://localhost:9876/_karma_webpack_/example.worker'),
  ['tensor']
);
