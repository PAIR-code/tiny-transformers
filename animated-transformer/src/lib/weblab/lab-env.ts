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

import { SignalStructFn, ValueStruct, CellStateSpec, WritableStructFn } from './cellspec';
import { FromWorkerMessage, ToWorkerMessage } from 'src/lib/weblab/messages';
import { LabState } from './lab-state';
import { SignalSpace, writable, WritableSignal } from './signalspace';

export type ItemMetaData = {
  timestamp: Date;
};

export class LabEnvCell<
  Globals extends ValueStruct,
  I extends keyof Globals & string,
  O extends keyof Globals & string
> {
  public onceFinished: Promise<{ [Key in O]: Globals[Key] }>;
  public worker: Worker;

  constructor(
    public space: SignalSpace,
    public spec: CellStateSpec<Globals, I, O>,
    public uses: SignalStructFn<{ [Key in I]: Globals[Key] }>
  ) {
    let resolveWithOutputFn: (output: { [Key in O]: Globals[Key] }) => void;
    this.onceFinished = new Promise<{ [Key in O]: Globals[Key] }>((resolve, reject) => {
      resolveWithOutputFn = resolve;
    });
    this.worker = spec.createWorker();

    const outputs = {} as { [Key in O]: Globals[Key] };

    // Protocall of stuff a worker can send us, and we respond to...
    this.worker.onmessage = ({ data }) => {
      console.log('main thread got worker.onmessage', data);
      const messageFromWorker: FromWorkerMessage = data;
      switch (messageFromWorker.kind) {
        case 'requestInput':
          console.log(
            'this.stateVars[messageFromWorker.name]: requestInput: ',
            this.uses[messageFromWorker.name as I]()
          );
          this.worker.postMessage({
            kind: 'providingInput',
            name: messageFromWorker.name,
            inputData: this.uses[messageFromWorker.name as I](),
          });
          break;
        // only called when the webworker is really finished.
        case 'finished':
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

    // In addition, whenever any of the "uses" variables are updated, we send
    // the update to the worker.
    for (const key of Object.keys(uses)) {
      this.space.effect(() => {
        const value = uses[key as I]();
        const messageToWorker: ToWorkerMessage = {
          kind: 'providingInput',
          name: key,
          inputData: value,
        };
        this.worker.postMessage(messageToWorker);
      });
    }
  }

  // TODO: maybe send all at once?
  sendInputs() {
    for (const name of Object.keys(this.uses))
      this.worker.postMessage({
        kind: 'providingInput',
        name,
        inputData: this.uses[name as I](),
      });
  }
}

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export class LabEnv<Globals extends ValueStruct> {
  space = new SignalSpace();
  // inputFileHandles: Map<keyof Globals, FileSystemFileHandle> = new Map();
  // inputFiles: Map<keyof Globals, FileSystemFileHandle> = new Map();
  // stateVars: Partial<SignalsStructFn<Globals>> = {};
  metadata: Map<keyof Globals, ItemMetaData> = new Map();
  runningCells: {
    [name: string]: CellStateSpec<Globals, keyof Globals, keyof Globals>;
  } = {};

  constructor(public workerState: LabState) {
    console.log('import.meta.url', import.meta.url.toString());
  }

  start<I extends keyof Globals & string, O extends keyof Globals & string>(
    spec: CellStateSpec<Globals, I, O>,
    cellUses: SignalStructFn<{ [Key in I]: Globals[Key] }>
  ): LabEnvCell<Globals, I, O> {
    this.runningCells[spec.name] = spec as CellStateSpec<Globals, I, O>;

    // const cellUses = {} as SignalsStructFn<{ [Key in I]: Globals[Key] }>;

    // if (inputs) {
    //   for (const key of Object.keys(inputs)) {
    //     const curSignal = this.stateVars[key as I] as WritableSignal<Globals[I]> | undefined;
    //     if (curSignal) {
    //       curSignal.set(inputs[key as I]);
    //     } else {
    //       this.stateVars[key as I] = this.space.writable(inputs[key as I]);
    //     }
    //   }
    // }

    // // Ensure inputs in memory.
    // for (const inputName of spec.uses) {
    //   // if (this.stateVars[inputName] === undefined) {
    //   //   throw new Error(`Input '${inputName}' is not yet defined.`);
    //   //   // const inputValue = await this.workerState.loadValue<Globals[I]>(inputName);
    //   //   // if (!inputValue) {
    //   //   //   throw new Error(`No state for op (${spec.createWorker}) for input: ${inputName}`);
    //   //   // }
    //   //   // cellUses[inputName] = this.space.writable(inputValue.data);
    //   //   // this.stateVars[inputName] = cellUses[inputName];
    //   // } else {
    //   //   cellUses[inputName] = this.stateVars[inputName];
    //   // }
    // }

    const envCell = new LabEnvCell(this.space, spec, cellUses);
    envCell.sendInputs();
    envCell.onceFinished.then(() => delete this.runningCells[spec.name]);
    return envCell;
  }
}
