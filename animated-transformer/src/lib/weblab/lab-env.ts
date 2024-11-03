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
  CellSpec,
  PromiseStructFn,
  PromisedSignalsFn,
} from './cellspec';
import { FromWorkerMessage, ToWorkerMessage } from 'src/lib/weblab/messages';
import { SignalSpace } from '../signalspace/signalspace';

export type ItemMetaData = {
  timestamp: Date;
};

// Class wrapper to communicate with a cell in a webworker.
export class LabEnvCell<I extends ValueStruct, O extends ValueStruct> {
  // Resolved once the webworker says it has finished.
  public onceFinished: Promise<void>;
  public onceAllOutputs: Promise<SignalStructFn<O>>;
  public worker: Worker;
  public outputs: PromiseStructFn<SignalStructFn<O>>;
  public outputSoFar: Partial<SignalStructFn<O>>;
  public stillExpectedOutputs: Set<keyof O>;
  outputResolvers = {} as { [name: string]: (value: unknown) => void };

  constructor(
    public space: SignalSpace,
    public spec: CellSpec<I, O>,
    public uses: SignalStructFn<I>
  ) {
    let resolveWithAllOutputsFn: (output: SignalStructFn<O>) => void;
    this.onceAllOutputs = new Promise<SignalStructFn<O>>((resolve, reject) => {
      resolveWithAllOutputsFn = resolve;
    });
    let resolveWhenFinishedFn: () => void;
    this.onceFinished = new Promise<void>((resolve, reject) => {
      resolveWhenFinishedFn = resolve;
    });
    this.worker = spec.data.workerFn();
    this.outputs = {} as PromisedSignalsFn<O>;
    this.outputSoFar = {};
    this.stillExpectedOutputs = new Set(spec.outputNames);

    for (const outputName of spec.outputNames) {
      const promisedInput = this.initOnceOutput<O[typeof outputName]>(outputName as string);
      this.outputs[outputName] = promisedInput.then((inputValue) => {
        const signal = this.space.setable(inputValue);
        this.outputSoFar[outputName] = signal;
        this.stillExpectedOutputs.delete(outputName);
        if (this.stillExpectedOutputs.size === 0) {
          resolveWithAllOutputsFn(this.outputSoFar as SignalStructFn<O>);
        }
        // New inputs should now simply update the existing signal.
        this.outputResolvers[outputName as string] = (value) => {
          signal.set(value as O[typeof outputName]);
        };
        return signal;
      });
    }

    // Protocall of stuff a worker can send us, and we respond to...
    this.worker.onmessage = ({ data }) => {
      // console.log('main thread got worker.onmessage', data);
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
          this.worker.terminate();

          // resolveWithAllOutputsFn(this.outputSoFar as SignalStructFn<Subobj<Globals, O>>);
          break;
        case 'setSignal':
          const outputName = messageFromWorker.signalId as keyof O & string;
          this.outputResolvers[outputName](messageFromWorker.signalValue as O[keyof O]);
          break;
        default:
          console.error('main thread go unknown worker message: ', data);
          break;
      }
    };

    // In addition, whenever any of the "uses" variables are updated, we send
    // the update to the worker.
    for (const key of spec.inputNames) {
      this.space.derived(() => {
        const value = uses[key as keyof I]();
        const message: ToWorkerMessage = {
          kind: 'setSignal',
          signalId: key as keyof I & string,
          signalValue: value,
        };
        this.worker.postMessage(message);
      });
    }
  }

  requestStop() {
    const message: ToWorkerMessage = {
      kind: 'finishRequest',
    };
    this.worker.postMessage(message);
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

  // TODO: add some closing cleanup?
}

type SomeCellStateSpec = CellSpec<ValueStruct, ValueStruct>;
type SomeLabEnvCell = LabEnvCell<ValueStruct, ValueStruct>;

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export class LabEnv {
  space = new SignalSpace();
  // metadata: Map<string, ItemMetaData> = new Map();
  public runningCells: {
    [name: string]: SomeCellStateSpec;
  } = {};
  // cellChannels: {
  //   [port1CellName: string]: {
  //     port2CellName: string;
  //     signalName: string;
  //   };
  // } = {};

  start<I extends ValueStruct, O extends ValueStruct>(
    spec: CellSpec<I, O>,
    inputs: SignalStructFn<I>
  ): LabEnvCell<I, O> {
    this.runningCells[spec.data.cellName] = spec as SomeCellStateSpec;
    const envCell = new LabEnvCell(this.space, spec, inputs);
    envCell.onceFinished.then(() => delete this.runningCells[spec.data.cellName]);
    return envCell;
  }

  pipeSignal<
    SourceIn extends ValueStruct,
    SourceOut extends ValueStruct,
    TargetIn extends ValueStruct,
    TargetOut extends ValueStruct,
    SignalId extends keyof SourceOut & keyof TargetIn & string
  >(
    sourceCell: LabEnvCell<SourceIn, SourceOut>,
    targetCell: LabEnvCell<TargetIn, TargetOut>,
    signalId: SignalId,
    options?: { keepSignalPushesHereToo: boolean }
  ) {
    const channel = new MessageChannel();
    sourceCell.pipeOutputSignal(signalId, channel.port1, options);
    targetCell.pipeInputSignal(signalId, channel.port2);
    // TODO: keep track of channels between cells.
  }
}
