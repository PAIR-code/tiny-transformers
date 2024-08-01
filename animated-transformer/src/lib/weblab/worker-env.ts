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

import { WorkerOp } from './worker-op';
import { FromWorkerMessage } from 'src/lib/weblab/messages';
import { LabState } from './lab-state';

export type ItemMetaData = {
  timestamp: Date;
};

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export class WorkerEnv<Globals extends { [key: string]: any }> {
  inputFileHandles: Map<keyof Globals, FileSystemFileHandle> = new Map();
  inputFiles: Map<keyof Globals, FileSystemFileHandle> = new Map();
  stateVars: Partial<Globals> = {};
  metadata: Map<keyof Globals, ItemMetaData> = new Map();

  constructor(public workerState: LabState) {}

  async run<I extends keyof Globals & string, O extends keyof Globals & string>(
    op: WorkerOp<I, O>
  ): Promise<{ [key in O]: Globals[O] }> {
    const outputs = {} as { [key in O]: Globals[O] };
    // Ensure inputs in memory.
    for (const inputName of op.api.inputs) {
      if (this.stateVars[inputName] === undefined) {
        const inputValue = await this.workerState.loadValue<Globals[O]>(
          inputName
        );
        if (!inputValue) {
          throw new Error(
            `No state for op (${op.workerPath}) for input: ${inputName}`
          );
        }
        this.stateVars[inputName] = inputValue.data;
      }
    }

    const worker = new Worker(new URL(op.workerPath, import.meta.url));
    worker.onmessage = ({ data }) => {
      const messageFromWorker = data as FromWorkerMessage;
      switch (messageFromWorker.kind) {
        case 'finished':
          worker.terminate();
          break;
        case 'requestInput':
          worker.postMessage(this.stateVars[messageFromWorker.name]);
          break;
        case 'providingOutput':
          const outputName = messageFromWorker.name as O;
          outputs[outputName] = messageFromWorker.outputData as Globals[O];
          break;
        default:
          console.error('unknown worker message: ', data);
          break;
      }
    };

    // worker.onmessage(() => {});

    return outputs;
  }
}
