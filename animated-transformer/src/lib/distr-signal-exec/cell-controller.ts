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
/**
 * Responsible for starting and communicating with a remote worker cell via a
 * webworker.
 *
 * By default establishes connections for each input/output.
 */

import {
  AbstractSignalStructFn,
  ValueStruct,
  CellKind,
  PromiseStructFn,
  PromisedSetableSignalsFn,
  SetableSignalStructFn,
  AsyncIterableFn,
  AsyncOutStreamFn,
} from './cell-kind';
import {
  LabMessage,
  LabMessageKind,
  Remote,
  RemoteKind,
  SetSignalValueMessage,
  StreamValue,
} from 'src/lib/distr-signal-exec/lab-message-types';
import { AbstractSignal, SetableSignal, SignalSpace } from '../signalspace/signalspace';

export type ItemMetaData = {
  timestamp: Date;
};

import { SignalReceiveEnd, StreamReceiveEnd, SignalSendEnd, StreamSendEnd } from './channel-ends';
import { op } from '@tensorflow/tfjs';
import { LabEnv } from './lab-env';

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

export class CellController<
  I extends ValueStruct,
  IStreams extends ValueStruct,
  O extends ValueStruct,
  OStreams extends ValueStruct,
> {
  public status: SetableSignal<CellStatus>;
  // Resolved once the webworker says it has finished.
  public onceReceivedAllInputsAndStarting!: Promise<void>;
  resolveWhenReceivedAllInputsAndStartingFn!: () => void;

  public onceAllOutputs!: Promise<AbstractSignalStructFn<O>>;
  resolveWithAllOutputsFn!: (outputs: AbstractSignalStructFn<O>) => void;

  public onceFinished!: Promise<void>;
  resolveWhenFinishedFn!: () => void;

  worker?: BasicWorker;

  // Inputs to the worker can either be signal values from the environment, or
  // they can be outputs from another cell (outputs from another cell as
  // "SignalInput"s to the environment).
  inputs = {} as { [Key in keyof I]: SignalSendEnd<I[Key]> };
  // Note: From the environment's view, streams being given in to the worker are
  // coming out of the environment.
  inStreams = {} as { [Key in keyof IStreams]: StreamSendEnd<IStreams[Key]> };

  // Remote points representing the environment's end of the input.
  inputEnvRemotes = {} as { [Key in keyof I]: Remote };
  // Remote points representing the environment's end of the inStream.
  inStreamEnvRemotes = {} as { [Key in keyof IStreams]: Remote };

  // Note: from the environmnts perspective, worker cell outputs, are inputs to
  // the environment.
  public outputs = {} as { [Key in keyof O]: SignalReceiveEnd<O[Key]> };
  public outStreams = {} as { [Key in keyof OStreams]: StreamReceiveEnd<OStreams[Key]> };

  // Remote points representing the environment's end of the input.
  outputEnvRemotes = {} as { [Key in keyof O]: Remote };
  // Remote points representing the environment's end of the inStream.
  outStreamEnvRemotes = {} as { [Key in keyof OStreams]: Remote };

  public outputSoFar!: Partial<AbstractSignalStructFn<O>>;
  public stillExpectedOutputs!: Set<keyof O>;
  public stillExpectedInputs!: Set<keyof I>;

  space: SignalSpace;
  postFn: (message: LabMessage, transerables?: Transferable[]) => void;
  postQueue: { message: LabMessage; transerables?: Transferable[] }[] = [];

  constructor(
    public env: LabEnv,
    public id: string,
    public cellKind: CellKind<I, IStreams, O, OStreams>,
    public uses: {
      // Uses AbstractSignal from env, or pipes from SignalReceiveEnd
      inputs?: { [Key in keyof Partial<I>]: AbstractSignal<I[Key]> | SignalReceiveEnd<I[Key]> };
      // TODO: consider also allowing async iters from the env?
      // Pipe from StreamReceiveEnd.
      inStreams?: { [Key in keyof Partial<IStreams>]: StreamReceiveEnd<IStreams[Key]> };
      config?: Partial<LabEnvCellConfig>;
    } = {},
  ) {
    this.space = env.space;
    this.status = this.space.setable<CellStatus>(CellStatus.NotStarted);

    this.postFn = (message: LabMessage, transerables?: Transferable[]) => {
      if (!this.worker) {
        this.postQueue.push({ message, transerables });
      } else {
        this.worker.postMessage(message, transerables);
      }
    };

    this.stillExpectedInputs = new Set(cellKind.inputNames);

    for (const inputSignalId of cellKind.inputNames) {
      const signalSendEnd = new SignalSendEnd<I[keyof I]>(
        this.id,
        this.space,
        inputSignalId as keyof O & string,
      );
      this.inputs[inputSignalId] = signalSendEnd;

      // CONSIDER: think about instructions being batched into lists of actions to
      // minimise sent messages.
      const channel = new MessageChannel();
      const message: LabMessage = {
        kind: LabMessageKind.AddInputRemote,
        recipientSignalId: inputSignalId as string,
        remoteSignal: {
          kind: RemoteKind.MessagePort,
          remoteCellId: this.id + ':controller',
          remoteChannelId: inputSignalId as string,
          messagePort: channel.port1,
        },
      };
      this.postFn(message, [channel.port1]);

      const recEndRemote = {
        kind: RemoteKind.MessagePort,
        remoteCellId: this.id + ':worker',
        remoteChannelId: inputSignalId as string,
        messagePort: channel.port2,
      };
      signalSendEnd.addRemote(recEndRemote);
    }

    for (const inStreamId of cellKind.inStreamNames) {
      const inStreamSendEnd = new StreamSendEnd<IStreams[keyof IStreams]>(
        this.id,
        this.space,
        inStreamId as keyof OStreams & string,
      );
      this.inStreams[inStreamId] = inStreamSendEnd;

      // CONSIDER: think about instructions being batched into lists of actions to
      // minimise sent messages.
      const channel = new MessageChannel();
      const message: LabMessage = {
        kind: LabMessageKind.AddInStreamRemote,
        recipientStreamId: inStreamId as string,
        remoteStream: {
          kind: RemoteKind.MessagePort,
          remoteCellId: this.id + ':controller',
          remoteChannelId: inStreamId as string,
          messagePort: channel.port1,
        },
      };
      this.postFn(message, [channel.port1]);

      const recEndRemote = {
        kind: RemoteKind.MessagePort,
        remoteCellId: this.id + ':worker',
        remoteChannelId: inStreamId as string,
        messagePort: channel.port2,
      };
      inStreamSendEnd.addRemote(recEndRemote);
    }

    for (const outSignalId of cellKind.outputNames) {
      const recEnd = new SignalReceiveEnd<O[keyof O]>(
        this.id,
        this.space,
        outSignalId as keyof O & string,
      );
      this.outputs[outSignalId] = recEnd;

      // TODO: remove dup code and consolidtate streams and inputs into one
      // thing that has addRemote.
      const channel = new MessageChannel();
      const message: LabMessage = {
        kind: LabMessageKind.AddOutputRemote,
        recipientSignalId: outSignalId as string,
        remoteSignal: {
          kind: RemoteKind.MessagePort,
          remoteCellId: this.id + ':controller',
          remoteChannelId: outSignalId as string,
          messagePort: channel.port1,
        },
      };
      this.postFn(message, [channel.port1]);

      const recEndRemote = {
        kind: RemoteKind.MessagePort,
        remoteCellId: this.id + ':worker',
        remoteChannelId: outSignalId as string,
        messagePort: channel.port2,
      };
      recEnd.addRemote(recEndRemote);
    }

    for (const outStreamId of cellKind.outStreamNames) {
      const outStreamRecEnd = new StreamReceiveEnd<OStreams[keyof OStreams]>(
        this.id,
        this.space,
        outStreamId as keyof OStreams & string,
      );
      this.outStreams[outStreamId] = outStreamRecEnd;

      // CONSIDER: think about instructions being batched into lists of actions to
      // minimise sent messages.
      const channel = new MessageChannel();
      const message: LabMessage = {
        kind: LabMessageKind.AddInStreamRemote,
        recipientStreamId: outStreamId as string,
        remoteStream: {
          kind: RemoteKind.MessagePort,
          remoteCellId: this.id + ':controller',
          remoteChannelId: outStreamId as string,
          messagePort: channel.port1,
        },
      };
      this.postFn(message, [channel.port1]);

      const recEndRemote = {
        kind: RemoteKind.MessagePort,
        remoteCellId: this.id + ':worker',
        remoteChannelId: outStreamId as string,
        messagePort: channel.port2,
      };
      outStreamRecEnd.addRemote(recEndRemote);
    }

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

  public assignInputViaPiping<K extends keyof I>(k: K, recEnd: SignalReceiveEnd<I[K]>) {
    this.stillExpectedInputs.delete(k);
    this.inputs[k].pipeFrom(recEnd);
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
  ) {
    this.inStreams[k].pipeFrom(recStream);
  }

  init() {
    this.outputSoFar = {};
    this.stillExpectedOutputs = new Set(this.cellKind.outputNames);
    this.status.set(CellStatus.NotStarted);

    this.onceReceivedAllInputsAndStarting = new Promise<void>((resolve, reject) => {
      this.resolveWhenReceivedAllInputsAndStartingFn = resolve;
    }).then(() => {
      this.status.set(CellStatus.Running);
    });

    this.onceAllOutputs = new Promise<AbstractSignalStructFn<O>>((resolve, reject) => {
      this.resolveWithAllOutputsFn = resolve;
    });

    this.onceFinished = new Promise<void>((resolve, reject) => {
      this.resolveWhenFinishedFn = resolve;
    }).then(() => {
      if (this.worker) {
        this.worker.terminate();
        delete this.worker;
      }
      this.env.runningCells.delete(this as SomeLabEnvCell);
      this.status.set(CellStatus.Stopped);
    });

    // configure the resolveWithAllOutputsFn so that onceAllOutputs gets resolved.
    for (const oName of this.cellKind.outputNames) {
      const recEnd = this.outputs[oName];
      recEnd.onceReady.then((signal) => {
        this.outputSoFar[oName] = signal;
        this.stillExpectedOutputs.delete(oName);
        if (this.stillExpectedOutputs.size === 0) {
          this.resolveWithAllOutputsFn(this.outputSoFar as SetableSignalStructFn<O>);
        }
      });
    }
  }

  // Invokes start in the signalcell.
  async start(): Promise<void> {
    if (this.uses.config && this.uses.config.logCellMessages) {
      this.worker = new LoggingMessagesWorker(this.cellKind.data.workerFn(), this.id);
    } else {
      this.worker = this.cellKind.data.workerFn();
    }
    // Protocall of stuff a worker can send us, and we respond to...
    this.worker.onmessage = ({ data }) => {
      const messageFromWorker: LabMessage = data;
      switch (messageFromWorker.kind) {
        case LabMessageKind.ReceivedAllInputsAndStarting:
          this.resolveWhenReceivedAllInputsAndStartingFn();
          break;
        case LabMessageKind.Finished:
          // CONSIDER: what if there are missing outputs?
          this.resolveWhenFinishedFn();
          break;
        default:
          console.error('main thread go unknown worker message: ', data);
          break;
      }
    };

    this.status.set(CellStatus.StartingWaitingForInputs);
    const message: LabMessage = {
      kind: LabMessageKind.StartCellRun,
      id: this.id,
    };
    this.postFn(message);

    for (const message of this.postQueue) {
      this.postFn(message.message, message.transerables);
    }
    this.postQueue = [];
    return this.onceReceivedAllInputsAndStarting;
  }

  async requestStop(): Promise<void> {
    if (this.status() !== CellStatus.Stopped) {
      const message: LabMessage = {
        kind: LabMessageKind.FinishRequest,
      };
      this.status.set(CellStatus.Stopping);
      this.postFn(message);
    } else {
      console.warn('#Env: requestStop: but already stopped');
    }
  }

  async forceStop(): Promise<void> {
    if (this.worker) {
      this.worker.terminate();
      delete this.worker;
    }
    this.status.set(CellStatus.Stopped);
  }
}

export type SomeCellStateKind = CellKind<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;
export type SomeLabEnvCell = CellController<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;
