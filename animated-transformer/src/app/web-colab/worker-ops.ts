import { SerializedGTensor } from 'src/lib/gtensor/gtensor';
import * as json5 from 'json5';

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export type Name = string;
export type TensorValue = {
  t: SerializedGTensor<'a'>;
  v: number;
} | null;

export type Globals = {
  name: Name;
  t: TensorValue;
};

export type ItemMetaData = {
  timestamp: Date;
};

type ObjMap<G> = {
  [name in keyof G]: G[keyof G];
};
type ObjFileMap = { [name: string]: FileSystemFileHandle };

type Foo<G extends { [key: string]: any }> = keyof ObjMap<G>;

type Test = keyof { [key: string]: any };

// type Foo = keyof Globals;
// type Value = Globals[Foo];
// type Bar = { [key in Foo]: Globals[Foo]  }

export const initGlobals: Partial<Globals> = {
  name: 'init foo name',
};

export class WorkerEnv<Globals extends { [key: string]: any }> {
  inputFileHandles: Map<keyof Globals, FileSystemFileHandle> = new Map();
  inputFiles: Map<keyof Globals, FileSystemFileHandle> = new Map();
  state: Partial<Globals> = {};
  metadata: Map<keyof Globals, ItemMetaData> = new Map();

  constructor(public workingDir: FileSystemDirectoryHandle) {}

  // having to add string here to avoid Typescript bug.
  async loadValueFromFile<Key extends keyof Globals & string>(
    inputFileName: Key
  ): Promise<Globals[Key]> {
    const fileHandle = await this.workingDir.getFileHandle(inputFileName);
    const file = await fileHandle.getFile();
    const dec = new TextDecoder('utf-8');
    const json = dec.decode(await file.arrayBuffer());
    let obj: Globals[Key];
    try {
      obj = json5.parse(json);
    } catch (e: unknown) {
      // Remark: Why don't errors come in trees, so one can provide
      // context in try/catch blocks?
      console.error(`Failed to parse ${inputFileName}.`);
      throw e;
    }
    // TODO: introduce concept of escaping & object registry.
    return obj;
  }

  async run<I extends keyof Globals & string, O extends keyof Globals & string>(
    op: WorkerOp<I, O>
  ): Promise<{ [key in O]: Globals[O] }> {
    const outputs = {} as { [key in O]: Globals[O] };
    // Ensure inputs in memory.
    for (const inputName of op.inputs) {
      if (this.state[inputName] === undefined) {
        const inputValue = await this.loadValueFromFile(inputName);
        this.state[inputName] = inputValue;
      }
    }

    const worker = new Worker(new URL(op.workerPath, import.meta.url));

    return outputs;
  }
}

export class WorkerOp<
  Inputs extends string | number | symbol,
  Outputs extends string | number | symbol
> {
  constructor(
    public workerPath: string,
    public inputs: Inputs[],
    public outputs: Outputs[]
  ) {}

  // async run(
  //   workerEnv: WorkerEnv,
  //   inputs: ObjMap<Inputs, Globals>
  // ): Promise<ObjMap<Outputs, Globals>> {
  //   const outputs = {} as ObjMap<Outputs, Globals>;

  //   const inputFiles = {} as ObjFileMap;

  //   // start worker,
  //   // send all inputs
  //   // wait for outputs
  //   return outputs;
  // }
}

type OpKind = {
  workerpath: string;
  inputs: (keyof Globals)[];
  outputs: (keyof Globals)[];
};

export const ops: OpKind[] = [
  {
    workerpath: './app.worker',
    inputs: ['name'],
    outputs: ['t'],
  },
];
