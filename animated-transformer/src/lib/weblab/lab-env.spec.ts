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
import { exampleWorkerSpec } from './example.ailab';

describe('lab-env', () => {
  beforeEach(async () => {});

  it('Running a simple cell', async () => {
    const env = new LabEnv();
    const toyInput = env.space.setable('Foo');
    const cell = env.start(exampleWorkerSpec, { toyInput });

    const { num, str } = await cell.onceAllOutputs;
    expect(num()).toEqual(1);
    expect(str()).toEqual('hello Foo');

    for (const i of [1, 2, 3]) {
      await cell.inStream.numStream.send(i);
    }
    cell.inStream.numStream.done();

    const vs = [];
    for await (const v of cell.outStream.foo) {
      vs.push(v);
    }
    expect(vs.length).toEqual(3);

    expect(vs[0]).toEqual('foo1');
    expect(vs[1]).toEqual('foo2');
    expect(vs[2]).toEqual('foo3');

    expect(env.runningCells[cell.spec.data.cellName]).toBeDefined();
    cell.requestStop();
    await cell.onceFinished;
    expect(env.runningCells[cell.spec.data.cellName]).toBeUndefined();
  });
});
