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

/// <reference lib="webworker" />

import { workerCell } from './lab-worker-cell';
import { exampleCellAbstract as exampleCellKind } from './example.ailab';

const cell = workerCell(exampleCellKind);
const { derived } = cell.space;

cell.start(async (inputs) => {
  const { prefix } = inputs;

  cell.outputs.prefixLen.set(prefix().length);

  // for every input, add hello to it.
  derived(() => {
    cell.outputs.prefixRev.set(prefix().split('').reverse().join(''));
  });

  for await (const n of cell.inStream.strStream) {
    await cell.outStream.prefixedStream.send(`${prefix()} ${n}`);
  }
  cell.outStream.prefixedStream.done();

  await cell.onceFinishRequested;
});
