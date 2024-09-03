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

import { SpecificValueStruct, ValueStruct, CellFuncSpec } from './cellspec';
import { FromWorkerMessage } from 'src/lib/weblab/messages';
import { LabState } from './lab-state';

export type ItemMetaData = {
  timestamp: Date;
};

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export class LabEnv<Globals extends ValueStruct> {
  inputFileHandles: Map<keyof Globals, FileSystemFileHandle> = new Map();
  inputFiles: Map<keyof Globals, FileSystemFileHandle> = new Map();
  stateVars: Partial<Globals> = {};
  metadata: Map<keyof Globals, ItemMetaData> = new Map();
  runningCells: {
    [name: string]: CellFuncSpec<{}, {}>;
  } = {};

  constructor(public workerState: LabState) {
    console.log('import.meta.url', import.meta.url.toString());
  }

  async run<I extends keyof Globals & string, O extends keyof Globals & string>(
    op: CellFuncSpec<SpecificValueStruct<I>, SpecificValueStruct<O>>
  ): Promise<{ [key in O]: Globals[O] }> {
    this.runningCells[op.name] = op as CellFuncSpec<{}, {}>;

    const outputs = {} as { [key in O]: Globals[O] };
    // Ensure inputs in memory.
    for (const inputName of op.inputs) {
      if (this.stateVars[inputName] === undefined) {
        const inputValue = await this.workerState.loadValue<Globals[O]>(inputName);
        if (!inputValue) {
          throw new Error(`No state for op (${op.createWorker}) for input: ${inputName}`);
        }
        this.stateVars[inputName] = inputValue.data;
      }
    }

    let resolveWithOutputFn: (output: { [key in O]: Globals[O] }) => void;
    const onceFinished = new Promise<{ [key in O]: Globals[O] }>((resolve, reject) => {
      resolveWithOutputFn = resolve;
    });

    const worker = op.createWorker();
    // const worker = new Worker(op.workerPath, { type: 'module' });
    // console.log(worker);
    worker.onmessage = ({ data }) => {
      console.log('main thread got worker.onmessage', data);
      const messageFromWorker = data as FromWorkerMessage;
      switch (messageFromWorker.kind) {
        case 'requestInput':
          console.log(
            'this.stateVars[messageFromWorker.name]',
            this.stateVars[messageFromWorker.name]
          );
          worker.postMessage({
            kind: 'providingInput',
            name: messageFromWorker.name,
            inputData: this.stateVars[messageFromWorker.name],
          });
          break;
        // only called when the webworker is really finished.
        case 'finished':
          delete this.runningCells[op.name];
          resolveWithOutputFn(outputs);
          break;
        case 'providingOutput':
          const outputName = messageFromWorker.name as O;
          outputs[outputName] = messageFromWorker.outputData as Globals[O];
          break;
        default:
          console.error('main thread go unknown worker message: ', data);
          break;
      }
    };

    // worker.onmessage(() => {});

    return onceFinished;
  }
}
