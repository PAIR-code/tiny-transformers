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

import { nodeToFsa } from 'memfs/lib/node-to-fsa';
import { WorkerOp } from './worker-op';
import { WorkerEnv } from './worker-env';
import { SerializedGTensor } from 'src/lib/gtensor/gtensor';

type Name = string;
type TensorValue = {
  t: SerializedGTensor<'a'>;
  v: number;
} | null;

type Globals = {
  name: Name;
  t: TensorValue;
};

type OpKind = {
  workerpath: string;
  inputs: (keyof Globals)[];
  outputs: (keyof Globals)[];
};

describe('worker-ops', () => {
  // // const dir = nodeToFsa(fs, os.tmpdir(), { mode: 'readwrite' });
  // const ops: OpKind[] = [
  //   {
  //     workerpath: './app.worker',
  //     inputs: ['name'],
  //     outputs: ['t'],
  //   },
  // ];
  // beforeEach(async () => {});
  // it('should create', async () => {
  //   console.log(dir.__path);
  //   const env = new WorkerEnv<Globals>(
  //     // TODO: bug in typings? nodeToFsa should presumably
  //     // result in FileSystemDirectoryHandle, not
  //     // NodeFileSystemDirectoryHandle
  //     dir as unknown as FileSystemDirectoryHandle
  //   );
  //   const op = new WorkerOp('./app.worker', {
  //     inputs: ['name'],
  //     outputs: ['t'],
  //   });
  //   const outputs = await env.run(op);
  //   expect(outputs.t).toBeTruthy();
  // });
  it('ignoreme', () => {
    expect(true).toBeTruthy();
  });
});
