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
import { op } from '@tensorflow/tfjs';

// Class wrapper to communicate with a cell in a webworker.
export type LabEnvCellConfig = {
  // For printing error/debug messages, when provided.
  logCellMessages?: boolean;
  id: string; // Use this ID for the cell.
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
  Running = 'Running',
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
  inputs = {} as { [Key in keyof I]: SignalSendEnd<I[Key]> };
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
  public stillExpectedInputs: Set<keyof I>;

  constructor(
    public id: string,
    public space: SignalSpace,
    public cellKind: CellKind<I, IStreams, O, OStreams>,
    public uses: {
      // Uses AbstractSignal from env, or pipes from SignalReceiveEnd
      inputs?: { [Key in keyof Partial<I>]: AbstractSignal<I[Key]> | SignalReceiveEnd<I[Key]> };
      // TODO: consider also allowing async iters from the env?
      // Pipe from StreamReceiveEnd.
      inStreams?: { [Key in keyof Partial<IStreams>]: StreamReceiveEnd<IStreams[Key]> };
      config?: LabEnvCellConfig;
    } = {},
  ) {
    let resolveWhenReceivedAllInputsAndStartingFn: () => void;
    this.onceReceivedAllInputsAndStarting = new Promise<void>((resolve, reject) => {
      resolveWhenReceivedAllInputsAndStartingFn = resolve;
    }).then(() => {
      this.status = CellStatus.Running;
    });

    let resolveWithAllOutputsFn: (output: AbstractSignalStructFn<O>) => void;
    this.onceAllOutputs = new Promise<AbstractSignalStructFn<O>>((resolve, reject) => {
      resolveWithAllOutputsFn = resolve;
    });

    let resolveWhenFinishedFn: () => void;
    this.onceFinished = new Promise<void>((resolve, reject) => {
      resolveWhenFinishedFn = resolve;
    }).then(() => {
      this.status = CellStatus.Stopped;
    });

    if (uses.config && uses.config.logCellMessages) {
      this.worker = new LoggingMessagesWorker(cellKind.data.workerFn(), this.id);
    } else {
      this.worker = cellKind.data.workerFn();
    }

    const postFn = (v: LabMessage, transerables?: Transferable[]) =>
      this.worker.postMessage(v, transerables);

    postFn({ kind: LabMessageKind.InitIdMessage, id: this.id });

    this.outputSoFar = {};
    this.stillExpectedOutputs = new Set(cellKind.outputNames);
    this.stillExpectedInputs = new Set(cellKind.inputNames);

    for (const inputSignalId of cellKind.inputNames) {
      const signalSendEnd = new SignalSendEnd<I[keyof I]>(
        this.id,
        this.space,
        inputSignalId as keyof O & string,
        postFn,
      );
      this.inputs[inputSignalId] = signalSendEnd;
    }

    for (const inStreamId of cellKind.inStreamNames) {
      const inStreamSendEnd = new StreamSendEnd<IStreams[keyof IStreams]>(
        this.id,
        this.space,
        inStreamId as keyof OStreams & string,
        postFn,
        {
          conjestionControl: {
            maxQueueSize: 20,
            resumeAtQueueSize: 10,
          },
        },
      );
      this.inStreams[inStreamId] = inStreamSendEnd;
    }

    for (const oName of cellKind.outputNames) {
      const envInput = new SignalReceiveEnd<O[keyof O]>(
        this.id,
        this.space,
        oName as keyof O & string,
        postFn,
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
        this.id,
        this.space,
        oStreamName as keyof OStreams & string,
        postFn,
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
          const recieveEnd = this.outStreams[oStreamName];
          recieveEnd.onAddValue(
            recieveEnd.defaultPort,
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
          const sendStreamEnd = this.inStreams[id];
          sendStreamEnd.conjestionFeedbackStateUpdate(
            messageFromWorker,
            sendStreamEnd.defaultState,
          );
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
    recEnd: SignalReceiveEnd<I[K]>,
    options?: { keepHereToo: boolean },
  ) {
    this.stillExpectedInputs.delete(k);
    this.inputs[k].pipeFrom(recEnd, options);
  }

  public assignInputFromSignal<K extends keyof I>(k: K, input: AbstractSignal<I[K]>) {
    this.stillExpectedInputs.delete(k);
    this.space.derived(() => {
      this.inputs[k].set(input());
    });
  }

  public assignInStreamViaPiping<K extends keyof IStreams>(
    k: K,
    recStream: StreamReceiveEnd<IStreams[K]>,
    options?: { keepHereToo: boolean },
  ) {
    this.inStreams[k].pipeFrom(recStream, options);
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
    if (this.status !== CellStatus.Stopped) {
      const message: LabMessage = {
        kind: LabMessageKind.FinishRequest,
      };
      this.status = CellStatus.Stopping;
      this.worker.postMessage(message);
    } else {
      console.warn('#Env: requestStop: but already stopped');
    }
  }

  // public pipeInputSignal(signalId: keyof I, ports: MessagePort[]) {
  //   const message: LabMessage = {
  //     kind: LabMessageKind.PipeInputSignal,
  //     signalId: signalId as string,
  //     ports,
  //   };
  //   // Note: ports are transferred to the worker.
  //   this.worker.postMessage(message, ports);
  // }

  // public pipeOutputSignal(
  //   signalId: keyof O,
  //   ports: MessagePort[],
  //   options?: { keepHereToo: boolean },
  // ) {
  //   const message: LabMessage = {
  //     kind: LabMessageKind.PipeOutputSignal,
  //     signalId: signalId as string,
  //     ports,
  //     options,
  //   };
  //   // Note ports are transferred to the worker.
  //   this.worker.postMessage(message, ports);
  // }

  // public pipeInputStream(streamId: keyof IStreams, ports: MessagePort[]) {
  //   const message: LabMessage = {
  //     kind: LabMessageKind.PipeInputStream,
  //     streamId: streamId as string,
  //     ports,
  //   };
  //   // Note: ports are transferred to the worker.
  //   this.worker.postMessage(message, ports);
  // }
  // public pipeOutputStream(
  //   streamId: keyof OStreams,
  //   ports: MessagePort[],
  //   options?: { keepHereToo: boolean },
  // ) {
  //   const message: LabMessage = {
  //     kind: LabMessageKind.PipeOutputStream,
  //     streamId: streamId as string,
  //     ports,
  //     options,
  //   };
  //   // Note ports are transferred to the worker.
  //   this.worker.postMessage(message, ports);
  // }
  // TODO: add some closing cleanup?
}

export type SomeCellStateKind = CellKind<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;
export type SomeLabEnvCell = LabEnvCell<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;
