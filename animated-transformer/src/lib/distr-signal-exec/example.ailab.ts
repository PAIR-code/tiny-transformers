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

import { CellKind, Kind } from './cell-kind';

// A cell outputs to prefixedStream the prefix prefixed to the input strStream,
// and outputs the reverse for the given prefix (until finished), and outputs
// the first prefix's length (only once at the start).
export const exampleCellAbstract = new CellKind({
  cellKindId: `testing-cell`,
  workerFn: () => new Worker(new URL('./example.worker', import.meta.url)),
  inputs: { prefix: Kind<string> },
  outputs: { prefixRev: Kind<string>, prefixLen: Kind<number> },
  inStreams: { strStream: Kind<string> },
  outStreams: { prefixedStream: Kind<string> },
});
