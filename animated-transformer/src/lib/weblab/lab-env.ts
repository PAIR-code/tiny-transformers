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

import {
  SignalStructFn,
  ValueStruct,
  CellStateSpec,
  WritableStructFn,
  PromiseStructFn,
  PromisedSignalsFn,
  Subobj,
} from './cellspec';
import { FromWorkerMessage, ToWorkerMessage } from 'src/lib/weblab/messages';
import { SignalSpace } from '../signalspace/signalspace';

export type ItemMetaData = {
  timestamp: Date;
};

export class LabEnvCell<
  Globals extends ValueStruct,
  I extends keyof Globals & string,
  O extends keyof Globals & string
> {
  public onceFinished: Promise<void>;
  public onceAllOutputs: Promise<SignalStructFn<Subobj<Globals, O>>>;
  public worker: Worker;
  public outputs: PromiseStructFn<SignalStructFn<Subobj<Globals, O>>>;
  public outputSoFar: Partial<SignalStructFn<Subobj<Globals, O>>>;
  public stillExpectedOutputs: Set<O>;
  outputResolvers = {} as { [name: string]: (value: unknown) => void };

  constructor(
    public space: SignalSpace,
    public spec: CellStateSpec<Globals, I, O>,
    public uses: SignalStructFn<{ [Key in I]: Globals[Key] }>
  ) {
    let resolveWithAllOutputsFn: (output: SignalStructFn<Subobj<Globals, O>>) => void;
    this.onceAllOutputs = new Promise<SignalStructFn<Subobj<Globals, O>>>((resolve, reject) => {
      resolveWithAllOutputsFn = resolve;
    });
    let resolveWhenFinishedFn: () => void;
    this.onceFinished = new Promise<void>((resolve, reject) => {
      resolveWhenFinishedFn = resolve;
    });
    this.worker = spec.createWorker();

    this.outputs = {} as PromisedSignalsFn<Subobj<Globals, O>>;
    this.outputSoFar = {};
    this.stillExpectedOutputs = new Set(spec.updates);

    for (const outputName of spec.updates) {
      const promisedInput = this.initOnceOutput<Globals[typeof outputName]>(outputName as string);
      this.outputs[outputName] = promisedInput.then((inputValue) => {
        const signal = this.space.setable(inputValue);
        this.outputSoFar[outputName] = signal;
        this.stillExpectedOutputs.delete(outputName);
        if (this.stillExpectedOutputs.size === 0) {
          resolveWithAllOutputsFn(this.outputSoFar as SignalStructFn<Subobj<Globals, O>>);
        }
        // New inputs should now simply update the existing signal.
        this.outputResolvers[outputName as string] = (value) => {
          signal.set(value as Globals[typeof outputName]);
        };
        return signal;
      });
    }

    // Protocall of stuff a worker can send us, and we respond to...
    this.worker.onmessage = ({ data }) => {
      console.log('main thread got worker.onmessage', data);
      const messageFromWorker: FromWorkerMessage = data;
      switch (messageFromWorker.kind) {
        // case 'requestInput':
        //   console.log(
        //     'this.stateVars[messageFromWorker.name]: requestInput: ',
        //     this.uses[messageFromWorker.signalId as I]()
        //   );
        //   const message: ToWorkerMessage = {
        //     kind: 'setSignal',
        //     signalId: messageFromWorker.signalId,
        //     signalValue: this.uses[messageFromWorker.signalId as I](),
        //   };
        //   this.worker.postMessage(message);
        //   break;
        // only called when the webworker is really finished.
        case 'finished':
          // TODO: what if there are missing outputs?
          resolveWhenFinishedFn();
          // resolveWithAllOutputsFn(this.outputSoFar as SignalStructFn<Subobj<Globals, O>>);
          break;
        case 'setSignal':
          const outputName = messageFromWorker.signalId as O;
          this.outputResolvers[outputName](messageFromWorker.signalValue as Globals[O]);
          break;
        default:
          console.error('main thread go unknown worker message: ', data);
          break;
      }
    };

    // In addition, whenever any of the "uses" variables are updated, we send
    // the update to the worker.
    for (const key of Object.keys(uses)) {
      this.space.derived(() => {
        const value = uses[key as I]();
        const message: ToWorkerMessage = {
          kind: 'setSignal',
          signalId: key,
          signalValue: value,
        };
        console.log(`env sending: ${JSON.stringify(message)}`);
        this.worker.postMessage(message);
      });
    }
  }

  initOnceOutput<T>(name: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // TODO: consider allowing parent to send stuff before we ask for it..
      // this would just involved checking the inputResolvers here.
      this.outputResolvers[name] = resolve as (v: unknown) => void;
    });
  }

  // // TODO: maybe send all at once?
  // sendInputs() {
  //   for (const name of Object.keys(this.uses)) {
  //     const message: ToWorkerMessage = {
  //       kind: 'setSignal',
  //       signalId: name,
  //       signalValue: this.uses[name as I](),
  //     };
  //     console.log(`env sendInputs: ${JSON.stringify(message)}`);
  //     this.worker.postMessage(message);
  //   }
  // }

  public pipeInputSignal(signalId: string, port: MessagePort) {
    const message: ToWorkerMessage = {
      kind: 'pipeInputSignal',
      signalId,
      port,
    };
    this.worker.postMessage(message, [port]);
  }
  public pipeOutputSignal(
    signalId: string,
    port: MessagePort,
    options?: { keepSignalPushesHereToo: boolean }
  ) {
    const message: ToWorkerMessage = {
      kind: 'pipeOutputSignal',
      signalId,
      port,
      options,
    };
    this.worker.postMessage(message, [port]);
  }
}

type SomeCellStateSpec = CellStateSpec<ValueStruct, string, string>;
type SomeLabEnvCell = LabEnvCell<ValueStruct, string, string>;

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export class LabEnv {
  space = new SignalSpace();
  // inputFileHandles: Map<keyof Globals, FileSystemFileHandle> = new Map();
  // inputFiles: Map<keyof Globals, FileSystemFileHandle> = new Map();
  // stateVars: Partial<SignalsStructFn<Globals>> = {};
  metadata: Map<string, ItemMetaData> = new Map();
  runningCells: {
    [name: string]: SomeCellStateSpec;
  } = {};
  cellChannels: {
    [port1CellName: string]: {
      port2CellName: string;
      signalName: string;
    };
  } = {};

  // constructor(public workerState: LabState) {
  //   console.log('import.meta.url', import.meta.url.toString());
  // }

  start<
    CellVars extends ValueStruct,
    I extends keyof CellVars & string,
    O extends keyof CellVars & string
  >(
    spec: CellStateSpec<CellVars, I, O>,
    cellUses: SignalStructFn<{ [Key in I]: CellVars[Key] }>
  ): LabEnvCell<CellVars, I, O> {
    // TODO: CellVars !== Globals. Think about this.
    this.runningCells[spec.cellName] = spec as CellStateSpec<CellVars, I, O>;

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
    console.log('cellUses', cellUses);
    const envCell = new LabEnvCell(this.space, spec, cellUses);
    // envCell.sendInputs();
    envCell.onceFinished.then(() => delete this.runningCells[spec.cellName]);
    return envCell;
  }

  pipeSignal<
    SourceVars extends ValueStruct,
    SourceIn extends keyof SourceVars & string,
    SourceOut extends keyof SourceVars & string,
    TargetVars extends ValueStruct,
    TargetIn extends keyof TargetVars & string,
    TargetOut extends keyof TargetVars & string,
    SignalId extends SourceOut & TargetIn
  >(
    sourceCell: LabEnvCell<SourceVars, SourceIn, SourceOut>,
    targetCell: LabEnvCell<TargetVars, TargetIn, TargetOut>,
    signalId: SignalId,
    options?: { keepSignalPushesHereToo: boolean }
  ) {
    const channel = new MessageChannel();
    sourceCell.pipeOutputSignal(signalId, channel.port1, options);
    targetCell.pipeInputSignal(signalId, channel.port2);
  }
}
