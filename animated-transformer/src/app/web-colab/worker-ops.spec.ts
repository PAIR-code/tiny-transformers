import { nodeToFsa } from 'memfs/lib/node-to-fsa';
import { fs } from 'memfs';
import os from 'os';
import { WorkerOp, WorkerEnv } from './worker-ops';
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

describe('worker-ops', () => {
  const dir = nodeToFsa(fs, os.tmpdir(), { mode: 'readwrite' });

  beforeEach(async () => {});

  it('should create', async () => {
    console.log(dir.__path);
    const env = new WorkerEnv<Globals>(
      // TODO: bug in typings? nodeToFsa should presumably
      // result in FileSystemDirectoryHandle, not
      // NodeFileSystemDirectoryHandle
      dir as unknown as FileSystemDirectoryHandle
    );
    const op = new WorkerOp('./app.worker', ['name'], ['t']);
    const outputs = await env.run(op);
    expect(outputs.t).toBeTruthy();
  });
});
