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
import { SignalSpace } from '../signalspace/signalspace';
import { sigmoid } from '@tensorflow/tfjs';

describe('lab-env', () => {
  beforeEach(async () => {});

  it('Running a simple cell', async () => {
    const env = new LabEnv(new SignalSpace());
    const prefix = env.space.setable('Foo');
    const cell = env.start(exampleCellAbstract, { prefix });

    const { prefixRev, prefixLen } = await cell.onceAllOutputs;
    expect(prefixLen()).toEqual(3);
    expect(prefixRev()).toEqual('ooF');

    for (const i of [1, 2, 3]) {
      await cell.inStreams.nameStream.send(`name_${i}`);
    }
    cell.inStreams.nameStream.done();

    const vs = [];
    for await (const v of cell.outStreams.prefixedNameStream) {
      vs.push(v);
    }
    expect(vs.length).toEqual(3);

    expect(vs[0]).toEqual('hello Foo name_1');
    expect(vs[1]).toEqual('hello Foo name_2');
    expect(vs[2]).toEqual('hello Foo name_3');

    const onceRevFoo = new Promise((resolve) => {
      env.space.derived(() => {
        if (prefixRev() === 'ooF') {
          resolve(prefixRev());
        }
      });
    });
    expect(await onceRevFoo).toEqual('ooF');

    const onceRevBar = new Promise((resolve) => {
      env.space.derived(() => {
        if (prefixRev() === 'raB') {
          resolve(prefixRev());
        }
      });
    });

    prefix.set('Bar');
    expect(await onceRevBar).toEqual('raB');

    expect(env.runningCells.has(cell)).toBeTrue();
    cell.requestStop();
    await cell.onceFinished;
    expect(env.runningCells.has(cell)).toBeFalse();
  });

  fit('Running two cells, with delayed piping', async () => {
    const env = new LabEnv(new SignalSpace());
    const prefix = env.space.setable('Foo');
    const cell = env.init(exampleCellAbstract);
    const cell2 = env.init(exampleCellAbstract);

    // Cells have assignX methods to assign input signals and streams.
    cell.assignInputFromSignal('prefix', prefix);
    // The environment helper can be used to pipe between cells (and has nice
    // auto-completion)
    env.pipeSignal(cell, 'prefixRev', cell2, 'prefix');
    // But if you want refactoring to work more smoothly, you are best to pipe
    // like so:
    cell2.inStreams.nameStream.pipeFrom(cell.outStreams.prefixedNameStream);

    for (const i of [1, 2, 3]) {
      await cell.inStreams.nameStream.send(`name_${i}`);
    }
    cell.inStreams.nameStream.done();

    const vs = [];
    for await (const v of cell2.outStreams.prefixedNameStream) {
      vs.push(v);
    }
    expect(vs.length).toEqual(3);

    expect(vs[0]).toEqual('hello ooF name_1');
    expect(vs[1]).toEqual('hello ooF name_2');
    expect(vs[2]).toEqual('hello ooF name_3');

    expect(await cell2.outputs.prefixRev.onceReady).toEqual('Foo');

    cell.requestStop();
    cell2.requestStop();
  });
});
