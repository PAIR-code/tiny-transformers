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

import { LabEnv } from './lab-env';
import { exampleCellAbstract } from './example.ailab';

describe('lab-env', () => {
  beforeEach(async () => {});

  fit('Running a simple cell', async () => {
    const env = new LabEnv();
    const sayHiToName = env.space.setable('Foo');
    const cell = env.start(exampleCellAbstract, { sayHiToName });

    const { num, helloStr } = await cell.onceAllOutputs;
    expect(num()).toEqual(1);
    expect(helloStr()).toEqual('hello Foo');

    for (const i of [1, 2, 3]) {
      await cell.inStream.numStream.send(i);
    }
    cell.inStream.numStream.done();

    const vs = [];
    for await (const v of cell.outStream.helloNumStream) {
      vs.push(v);
    }
    expect(vs.length).toEqual(3);

    expect(vs[0]).toEqual('hello number 1');
    expect(vs[1]).toEqual('hello number 2');
    expect(vs[2]).toEqual('hello number 3');

    const onceHiFoo = new Promise((resolve) => {
      env.space.derived(() => {
        if (helloStr() === 'hello Foo') {
          resolve(helloStr());
        }
      });
    });
    await onceHiFoo;

    const onceHiBob = new Promise((resolve) => {
      env.space.derived(() => {
        if (helloStr() === 'hello Bob') {
          resolve(helloStr());
        }
      });
    });

    sayHiToName.set('Bob');

    expect(await onceHiBob).toEqual('hello Bob');

    expect(env.runningCells[cell.cellKind.data.cellName]).toBeDefined();
    cell.requestStop();
    await cell.onceFinished;
    expect(env.runningCells[cell.cellKind.data.cellName]).toBeUndefined();
  });
});
