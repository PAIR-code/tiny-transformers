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

import { CellSpec, Kind } from './cellspec';

// export type Name = string;
// export type TensorValue = {
//   t: SerializedGTensor<'a'>;
//   v: number;
// } | null;

// export type Globals = {
//   name: Name;
//   tensor: TensorValue;
// };

// export type GlobalValue<Name extends string> = { [Key in keyof Globals & Name]: Globals[Key] };

export type ExampleCellInput = {
  toyInput: string;
};

export type ExampleCellOutput = {
  toyOutputStr: string;
  toyOutputNumber: number;
};

export type ExampleGlobals = ExampleCellInput & ExampleCellOutput;

// const initialState: Partial<ExampleGlobals> = {
//   toyInput: 'some initial input',
// };

// export const exampleWorkerOp = {
//   workerPath: './app.worker',
//   inputs: ['name'] as const,
//   outputs: ['t'] as const,
// } as WorkerOp<'name', 't'>;

// export const exampleWorkerSpec = new CellStateSpec<
//   Partial<ExampleGlobals>,
//   keyof ExampleCellInput,
//   keyof ExampleCellOutput
// >(
//   'an example cell',
//   () => new Worker(new URL('./example.worker', import.meta.url)),
//   ['toyInput'],
//   ['toyOutputStr', 'toyOutputNumber']
// );

export const exampleWorkerSpec = new CellSpec({
  cellName: 'an example cell',
  workerFn: () => new Worker(new URL('./example.worker', import.meta.url)),
  inputs: {
    toyInput: Kind<string>,
  },
  outputs: {
    str: Kind<string>,
    num: Kind<number>,
  },
});
