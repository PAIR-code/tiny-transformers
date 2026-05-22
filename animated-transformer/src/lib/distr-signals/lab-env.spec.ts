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
/**
 * NOTE ON TESTING WEB WORKERS IN BROWSER SPEC TESTS:
 *
 * Playwright/Chromium test environments running under Vitest's dev server fail to load
 * workers natively using 'new Worker(new URL("./name.worker", import.meta.url))' because:
 * 1. Vite dev server injects HMR client-side code (which references the 'window' object)
 *    into compiled .ts files. This throws ReferenceError inside worker threads.
 * 2. Angular unit-test builder compiles worker TS files as hashed lazy chunk files 
 *    (e.g. 'worker-xxxx.js') in its output directory, which is not reachable via standard 
 *    Vite project-relative URLs.
 *
 * WORKAROUND / BUILD PROCESS:
 * All worker entrypoints are pre-compiled to the static asset folder. This is done
 * automatically as a pretest script when running `pnpm test`, or can be executed manually via:
 *   pnpm build-test-workers
 * (under the hood: `pnpm esbuild src/lib/distr-signals/example.worker.ts --bundle --outfile=src/assets/test_only_assets/example.worker.js --format=esm`)
 *
 * The Vitest server maps '/src/assets/' directly to '/assets/' without injecting any Vite/HMR 
 * client HMR code, allowing standard ES module workers to load seamlessly and with 
 * high performance on a real thread:
 *   new Worker('/assets/test_only_assets/example.worker.js', { type: 'module' })
 */

import { LabEnv } from './lab-env';
import { exampleCellAbstract } from './example.ailab';
import { SignalSpace } from '../signalspace/signalspace';
import { CellStatus } from './cell-controller';

describe('lab-env', () => {
  beforeEach(async () => {});

  it('Running a simple cell', async () => {
    const env = new LabEnv(new SignalSpace());
    const prefix = env.space.setable('Foo');
    const { cell, onceStarted } = env.start(
      exampleCellAbstract,
      new Worker('/assets/test_only_assets/example.worker.js', { type: 'module' }),
      { inputs: { prefix } },
    );
    expect(cell.status()).toEqual(CellStatus.StartingWaitingForInputs);
    await onceStarted;
    expect(cell.status()).toEqual(CellStatus.Running);

    const { prefixRev, prefixLen } = await cell.connectAllOutputs();
    expect(cell.status()).toEqual(CellStatus.Running);

    expect(prefixLen()).toEqual(3);
    expect(prefixRev()).toEqual('ooF');

    const strStream = cell.inStreams.strStream.connect();
    const prefixedStream = cell.outStreams.prefixedStream.connect();

    for (const i of [1, 2, 3]) {
      await strStream.send(`name_${i}`);
    }
    strStream.done();

    const vs = [];
    for await (const v of prefixedStream) {
      vs.push(v);
    }
    expect(vs.length).toEqual(3);

    expect(vs[0]).toEqual('Foo name_1');
    expect(vs[1]).toEqual('Foo name_2');
    expect(vs[2]).toEqual('Foo name_3');

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

    expect(cell.status()).toEqual(CellStatus.Running);
    cell.requestStop();
    await cell.onceFinished;
    expect(cell.status()).toEqual(CellStatus.Stopped);
  });

  it('Running two cells, with delayed piping', async () => {
    const env = new LabEnv(new SignalSpace());
    const prefix = env.space.setable('Foo');
    const cell = env.init(exampleCellAbstract, {
      inputs: { prefix },
      config: {
        id: 'cell1',
      },
    });
    const cell2 = env.init(exampleCellAbstract, {
      config: {
        id: 'cell2',
      },
    });

    cell2.inputs.prefix.addPipeFrom(cell.outputs.prefixRev);
    cell2.inStreams.strStream.addPipeFrom(cell.outStreams.prefixedStream);
    const doublePrefixedStream = cell2.outStreams.prefixedStream.connect();

    cell.startWithWorker(new Worker('/assets/test_only_assets/example.worker.js', { type: 'module' }));
    cell2.startWithWorker(new Worker('/assets/test_only_assets/example.worker.js', { type: 'module' }));

    const strStream = cell.inStreams.strStream.connect();
    for (const i of [1, 2, 3]) {
      await strStream.send(`name_${i}`);
    }
    strStream.done();

    const vs = [];
    for await (const v of doublePrefixedStream) {
      vs.push(v);
    }
    expect(vs.length).toEqual(3);

    expect(vs[0]).toEqual('ooF Foo name_1');
    expect(vs[1]).toEqual('ooF Foo name_2');
    expect(vs[2]).toEqual('ooF Foo name_3');

    const cell2prefixRevSignal = await cell2.outputs.prefixRev.connect();

    expect(cell2prefixRevSignal()).toEqual('Foo');

    cell.requestStop();
    cell2.requestStop();
  });
});
