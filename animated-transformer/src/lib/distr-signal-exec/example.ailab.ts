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
 * the types for a cell (called the cell's abstract).
 */

import { CellKind, Kind } from './cell-types';

export const exampleCellAbstract = new CellKind({
  cellName: 'an example cell that says hello to stuff',
  workerFn: () => new Worker(new URL('./example.worker', import.meta.url)),
  inputs: { sayHiToName: Kind<string> },
  outputs: { helloStr: Kind<string>, num: Kind<number> },
  inStreams: { numStream: Kind<number> },
  outStreams: { helloNumStream: Kind<string> },
});
