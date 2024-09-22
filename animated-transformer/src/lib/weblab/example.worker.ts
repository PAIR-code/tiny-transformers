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

import * as lab from './lab-worker-cell';
import { exampleWorkerSpec } from './example.ailab';

console.log('example.worker', self.location);

const cell = new lab.FuncCell(exampleWorkerSpec);
cell.run((inputs) => {
  const toyOutput = `webworker got input! ${inputs.toyInput}`;

  // TODO: consider using the packr for transfers too...
  return {
    toyOutputStr: toyOutput,
    toyOutputNumber: 3,
  };
});

// Above is equivalent to...
// async function run() {
//   const cell = new lab.Cell(exampleWorkerSpec);

//   const name = await cell.input.name;

//   console.log(`webworker got input! ${name}`);

//   const t = new GTensor(tf.tensor([1, 2, 3]), ['a']);
//   const v = t.contract(t, ['a']).tensor.arraySync() as number;

//   // TODO: handle all transferable objects, and for objects that are
//   // serializable (have a toSerialised, and a from Serialised), go via that
//   // if/as needed.
//   cell.output('tensor', {
//     t: t.toSerialised(),
//     v,
//   });

//   console.log('worker going to finish...');
//   cell.finished();
//   console.log('worker finished.');
// }

// run();
