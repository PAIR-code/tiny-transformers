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
  AbstractSignalStructFn,
  ValueStruct,
  CellKind,
  PromiseStructFn,
  PromisedSetableSignalsFn,
  SetableSignalStructFn,
  AsyncIterableFn,
  AsyncOutStreamFn,
} from './cell-types';
import {
  LabMessage,
  LabMessageKind,
  SetSignalValueMessage,
  StreamValue,
} from 'src/lib/distr-signal-exec/lab-message-types';
import { AbstractSignal, SignalSpace } from '../signalspace/signalspace';

export type ItemMetaData = {
  timestamp: Date;
};

import {
  SignalReceiveEnd,
  StreamReceiveEnd,
  SignalSendEnd,
  StreamSendEnd,
} from './signal-messages';

// Class wrapper to communicate with a cell in a webworker.
export type LabEnvCellConfig = {
  // For printing error/debug messages, when provided.
  logCellMessages: boolean;
  // When true, logs all messages to/from worker.
  // logMessagesToCell: boolean;
  // logMessagesFromCell: boolean;
};

interface BasicWorker {
  set onmessage(m: ((ev: MessageEvent) => any) | null);
  postMessage(message: any, transfer?: Transferable[]): void;
  terminate(): void;
}

class LoggingMessagesWorker implements BasicWorker {
  constructor(
    public worker: Worker,
    public id: string,
  ) {}

  set onmessage(m: ((ev: MessageEvent) => any) | null) {
    if (m === null) {
      this.worker.onmessage = null;
    } else {
      this.worker.onmessage = (ev: MessageEvent) => {
        console.log(`from ${this.id} to env: `, ev);
        m(ev);
      };
    }
  }

  postMessage(message: any, transfer?: Transferable[]) {
    console.log(`from env to ${this.id}: `, message);
    this.worker.postMessage(message, transfer || []);
  }

  terminate() {
    this.worker.terminate();
  }
}

export enum CellStatus {
  NotStarted = 'NotStarted',
  StartingWaitingForInputs = 'StartingWaitingForInputs',
  Running = 'RunningWithInputs',
  Stopping = 'Stopping',
  Stopped = 'Stopped',
}

export class LabEnvCell<
  I extends ValueStruct,
  IStreams extends ValueStruct,
  O extends ValueStruct,
  OStreams extends ValueStruct,
> {
  public status: CellStatus = CellStatus.NotStarted;
  // Resolved once the webworker says it has finished.
  public onceReceivedAllInputsAndStarting: Promise<void>;
  public onceAllOutputs: Promise<AbstractSignalStructFn<O>>;
  public onceFinished: Promise<void>;

  public worker: BasicWorker;

  // Inputs to the worker can either be signal values from the environment, or
  // they can be outputs from another cell (outputs from another cell as
  // "SignalInput"s to the environment).
  inputs = {} as { [Key in keyof I]: SignalReceiveEnd<I[Key]> };
  // Note: From the environment's view, streams being given in to the worker are
  // coming out of the environment.
  inStreams = {} as {
    [Key in keyof IStreams]: StreamSendEnd<IStreams[Key]>;
  };

  // Note: from the environmnts perspective, worker cell outputs, are inputs to
  // the environment.
  public outputs = {} as {
    [Key in keyof O]: SignalReceiveEnd<O[Key]>;
  };
  public outStreams = {} as {
    [Key in keyof OStreams]: StreamReceiveEnd<OStreams[Key]>;
  };

  public outputSoFar: Partial<AbstractSignalStructFn<O>>;
  public stillExpectedOutputs: Set<keyof O>;

  constructor(
    public id: string,
    public space: SignalSpace,
    public cellKind: CellKind<I, IStreams, O, OStreams>,
    public uses: {
      inputs?: { [Key in keyof I]: AbstractSignal<I[Key]> | SignalReceiveEnd<I[Key]> };
      // TODO: consider also allowing async iters from the env?
      inStreams?: { [Key in keyof IStreams]: StreamSendEnd<IStreams[Key]> };
    },
    config?: LabEnvCellConfig,
  ) {
    let resolveWithAllOutputsFn: (output: AbstractSignalStructFn<O>) => void;
    this.onceAllOutputs = new Promise<AbstractSignalStructFn<O>>((resolve, reject) => {
      resolveWithAllOutputsFn = resolve;
    });

    let resolveWhenFinishedFn: () => void;
    this.onceFinished = new Promise<void>((resolve, reject) => {
      resolveWhenFinishedFn = resolve;
      this.status = CellStatus.Stopped;
    });

    let resolveWhenReceivedAllInputsAndStartingFn: () => void;
    this.onceReceivedAllInputsAndStarting = new Promise<void>((resolve, reject) => {
      resolveWhenReceivedAllInputsAndStartingFn = resolve;
      this.status = CellStatus.Running;
    });

    if (config && config.logCellMessages) {
      this.worker = new LoggingMessagesWorker(cellKind.data.workerFn(), this.id);
    } else {
      this.worker = cellKind.data.workerFn();
    }

    this.outputSoFar = {};
    this.stillExpectedOutputs = new Set(cellKind.outputNames);

    for (const streamName of cellKind.inStreamNames) {
      const stream = new StreamSendEnd<IStreams[keyof IStreams]>(
        this.space,
        streamName as keyof O & string,
        (v, transerables) => this.worker.postMessage(v, transerables),
        {
          conjestionControl: {
            maxQueueSize: 20,
            resumeAtQueueSize: 10,
          },
        },
      );
      this.inStreams[streamName] = stream;
    }

    for (const oName of cellKind.outputNames) {
      const envInput = new SignalReceiveEnd<O[keyof O]>(
        this.space,
        oName as keyof O & string,
        (v, transerables) => this.worker.postMessage(v, transerables),
      );
      this.outputs[oName] = envInput;

      envInput.onceReady.then((signal) => {
        this.outputSoFar[oName] = signal;
        this.stillExpectedOutputs.delete(oName);
        if (this.stillExpectedOutputs.size === 0) {
          resolveWithAllOutputsFn(this.outputSoFar as SetableSignalStructFn<O>);
        }
      });
    }

    for (const oStreamName of cellKind.outStreamNames) {
      const envStreamInput = new StreamReceiveEnd<OStreams[keyof OStreams]>(
        this.space,
        oStreamName as keyof OStreams & string,
        (m) => this.worker.postMessage(m),
      );
      this.outStreams[oStreamName] = envStreamInput;
    }

    // Protocall of stuff a worker can send us, and we respond to...
    this.worker.onmessage = ({ data }) => {
      // console.log('main thread got worker.onmessage', data);
      const messageFromWorker: LabMessage = data;
      switch (messageFromWorker.kind) {
        case LabMessageKind.ReceivedAllInputsAndStarting:
          // TODO: what if there are missing outputs?
          resolveWhenReceivedAllInputsAndStartingFn();
          // resolveWithAllOutputsFn(this.outputSoFar as SignalStructFn<Subobj<Globals, O>>);
          break;
        case LabMessageKind.Finished:
          // TODO: what if there are missing outputs?
          resolveWhenFinishedFn();
          this.worker.terminate();
          // resolveWithAllOutputsFn(this.outputSoFar as SignalStructFn<Subobj<Globals, O>>);
          break;
        case LabMessageKind.SetSignalValue: {
          const oName = messageFromWorker.signalId as keyof O & string;
          this.outputs[oName].onSetInput(messageFromWorker.value as O[keyof O & string]);
          break;
        }
        case LabMessageKind.AddStreamValue: {
          const oStreamName = messageFromWorker.streamId as keyof OStreams & string;
          this.outStreams[oStreamName].onAddValue(
            null,
            messageFromWorker.value as StreamValue<OStreams[keyof OStreams & string]>,
          );
          break;
        }
        case LabMessageKind.EndStream: {
          const oStreamName = messageFromWorker.streamId as keyof OStreams & string;
          this.outStreams[oStreamName].onDone();
          break;
        }
        case LabMessageKind.ConjestionControl: {
          const id = messageFromWorker.streamId as keyof OStreams & string;
          this.inStreams[id].conjestionFeedbackStateUpdate(messageFromWorker);
          break;
        }
        default:
          console.error('main thread go unknown worker message: ', data);
          break;
      }
    };

    // Inputs either are pipes, or signal values... make sure to connect stuff.
    if (this.uses && this.uses.inputs) {
      for (const [k, input] of Object.entries(this.uses.inputs)) {
        if (input instanceof SignalReceiveEnd) {
          this.assignInputViaPiping(k, input);
        } else {
          this.assignInputFromSignal(k, input);
        }
      }
    }

    // Inputs either are pipes, or signal values... make sure to connect stuff.
    if (this.uses && this.uses.inStreams) {
      for (const [k, outStream] of Object.entries(this.uses.inStreams)) {
        this.assignInStreamViaPiping(k, outStream);
      }
    }
  }

  public assignInputViaPiping<K extends keyof I>(
    k: K,
    input: SignalReceiveEnd<I[K]>,
    options?: { keepHereToo: boolean },
  ) {
    const channel = new MessageChannel();
    // Note: ports are transferred to the worker.
    const message: LabMessage = {
      kind: LabMessageKind.PipeOutputSignal,
      signalId: k as string,
      ports: [channel.port2],
      options,
    };
    input.defaultPostMessageFn(message, message.ports);
    this.pipeInputSignal(k, [channel.port1]);
  }

  public assignInputFromSignal<K extends keyof I>(k: K, input: AbstractSignal<I[K]>) {
    // TODO: consider cleanup...?
    this.space.derived(() => {
      const value = input(); // Note signal dependency.
      const message: SetSignalValueMessage = {
        kind: LabMessageKind.SetSignalValue,
        signalId: k as string,
        value,
      };
      this.worker.postMessage(message);
    });
  }

  public assignInStreamViaPiping<K extends keyof IStreams>(
    k: K,
    recStream: StreamReceiveEnd<IStreams[K]>,
    options?: { keepHereToo: boolean },
  ) {
    const channel = new MessageChannel();
    const message: LabMessage = {
      kind: LabMessageKind.PipeOutputStream,
      streamId: k as string,
      ports: [channel.port2],
      options,
    };
    recStream.defaultPostMessageFn(message, message.ports);
    this.pipeInputStream(k, [channel.port1]);
  }

  // Invokes start in the signalcell.
  async start(): Promise<void> {
    const message: LabMessage = {
      kind: LabMessageKind.StartCellRun,
    };
    this.status = CellStatus.StartingWaitingForInputs;
    this.worker.postMessage(message);
  }

  async requestStop(): Promise<void> {
    const message: LabMessage = {
      kind: LabMessageKind.FinishRequest,
    };
    this.status = CellStatus.Stopping;
    this.worker.postMessage(message);
  }

  public pipeInputSignal(signalId: keyof I, ports: MessagePort[]) {
    const message: LabMessage = {
      kind: LabMessageKind.PipeInputSignal,
      signalId: signalId as string,
      ports,
    };
    // Note: ports are transferred to the worker.
    this.worker.postMessage(message, ports);
  }
  public pipeOutputSignal(
    signalId: keyof O,
    ports: MessagePort[],
    options?: { keepHereToo: boolean },
  ) {
    const message: LabMessage = {
      kind: LabMessageKind.PipeOutputSignal,
      signalId: signalId as string,
      ports,
      options,
    };
    // Note ports are transferred to the worker.
    this.worker.postMessage(message, ports);
  }

  public pipeInputStream(streamId: keyof IStreams, ports: MessagePort[]) {
    const message: LabMessage = {
      kind: LabMessageKind.PipeInputStream,
      streamId: streamId as string,
      ports,
    };
    // Note: ports are transferred to the worker.
    this.worker.postMessage(message, ports);
  }
  public pipeOutputStream(
    streamId: keyof OStreams,
    ports: MessagePort[],
    options?: { keepHereToo: boolean },
  ) {
    const message: LabMessage = {
      kind: LabMessageKind.PipeOutputStream,
      streamId: streamId as string,
      ports,
      options,
    };
    // Note ports are transferred to the worker.
    this.worker.postMessage(message, ports);
  }
  // TODO: add some closing cleanup?
}

export type SomeCellStateKind = CellKind<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;
export type SomeLabEnvCell = LabEnvCell<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;
