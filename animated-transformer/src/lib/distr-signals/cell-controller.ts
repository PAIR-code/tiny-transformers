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
  SetableSignalStructFn,
  WorkerCellKind,
} from './cell-kind';
import { CellMessage, CellMessageKind } from 'src/lib/distr-signals/lab-message-types';
import { AbstractSignal, SetableSignal, SignalSpace } from '../signalspace/signalspace';

import { LabEnv } from './lab-env';
import {
  SignalReceiveChannel,
  SignalSendChannel,
  StreamReceiveChannel,
  StreamSendChannel,
} from './channels';

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
    public localCellId: string,
    public remoteCellId: string,
  ) {}

  set onmessage(m: ((ev: MessageEvent) => any) | null) {
    if (m === null) {
      this.worker.onmessage = null;
    } else {
      this.worker.onmessage = (ev: MessageEvent) => {
        console.log(`from ${this.remoteCellId} to ${this.localCellId}: `, ev);
        m(ev);
      };
    }
  }

  postMessage(message: any, transfer?: Transferable[]) {
    console.log(`from ${this.localCellId} to ${this.remoteCellId}: `, message);
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

// ----------------------------------------------------------------------------

export type InConnections<I, IStreams> = {
  // Uses AbstractSignal from env, or pipes from SignalReceiveEnd
  inputs?: { [Key in keyof Partial<I>]: AbstractSignal<I[Key]> | SignalReceiveChannel<I[Key]> };
  // TODO: consider also allowing async iters from the env?
  // Pipe from StreamReceiveEnd.
  inStreams?: { [Key in keyof Partial<IStreams>]: StreamReceiveChannel<IStreams[Key]> };
};

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
export class CellController<
  I extends ValueStruct,
  IStreams extends ValueStruct,
  O extends ValueStruct,
  OStreams extends ValueStruct,
> {
  space: SignalSpace;

  public status: SetableSignal<CellStatus>;

  public onceFinished!: Promise<void>;
  resolveWhenFinishedFn!: () => void;

  // Used to provide promise for when started has truly started.
  onceReceivedAllInputsAndStarting!: Promise<void>;
  resolveWhenReceivedAllInputsAndStartingFn!: () => void;

  // Used for the connectAllOutputs() return promise.
  onceAllOutputs!: Promise<AbstractSignalStructFn<O>>;
  resolveWithAllOutputsFn!: (outputs: AbstractSignalStructFn<O>) => void;

  // The Cell's webworker, where the work is happening.
  worker?: BasicWorker;

  // Inputs to the worker can either be signal values from the environment, or
  // they can be outputs from another cell (outputs from another cell as
  // "SignalInput"s to the environment).
  inputs = {} as { [Key in keyof I]: SignalSendChannel<I[Key]> };
  // Note: From the environment's view, streams being given in to the worker are
  // coming out of the environment.
  inStreams = {} as { [Key in keyof IStreams]: StreamSendChannel<IStreams[Key]> };

  // Note: from the environmnts perspective, worker cell outputs, are inputs to
  // the environment.
  outputs = {} as { [Key in keyof O]: SignalReceiveChannel<O[Key]> };
  outStreams = {} as { [Key in keyof OStreams]: StreamReceiveChannel<OStreams[Key]> };

  // public outputSoFar!: Partial<AbstractSignalStructFn<O>>;
  stillExpectedOutputs!: Set<keyof O>;
  stillExpectedInputs!: Set<keyof I>;

  postFn: (message: CellMessage, transerables?: Transferable[]) => void;
  postQueue: { message: CellMessage; transerables?: Transferable[] }[] = [];

  constructor(
    public env: LabEnv,
    public id: string,
    public cellKind: WorkerCellKind<I, IStreams, O, OStreams>,
    public uses?: InConnections<I, IStreams> & { config?: Partial<LabEnvCellConfig> },
  ) {
    this.space = env.space;
    this.status = this.space.setable<CellStatus>(CellStatus.NotStarted);

    this.postFn = (message: CellMessage, transerables?: Transferable[]) => {
      if (!this.worker) {
        this.postQueue.push({ message, transerables });
      } else {
        this.worker.postMessage(message, transerables);
      }
    };

    this.stillExpectedInputs = new Set(cellKind.inputNames);

    const remoteWorkerCellId = this.id + ':worker';
    const localCellId = this.id + ':controller';

    for (const inputSignalId of cellKind.inputNames) {
      this.inputs[inputSignalId] = new SignalSendChannel<I[keyof I]>(
        this.space,
        localCellId,
        remoteWorkerCellId,
        inputSignalId as string,
        this.postFn,
      );
    }

    for (const inStreamId of cellKind.inStreamNames) {
      this.inStreams[inStreamId] = new StreamSendChannel<IStreams[keyof IStreams]>(
        this.space,
        localCellId,
        remoteWorkerCellId,
        inStreamId as keyof OStreams & string,
        this.postFn,
      );
    }

    for (const outSignalId of cellKind.outputNames) {
      this.outputs[outSignalId] = new SignalReceiveChannel<O[keyof O]>(
        this.space,
        localCellId,
        remoteWorkerCellId,
        outSignalId as keyof O & string,
        this.postFn,
      );
    }

    for (const outStreamId of cellKind.outStreamNames) {
      this.outStreams[outStreamId] = new StreamReceiveChannel<OStreams[keyof OStreams]>(
        this.space,
        localCellId,
        remoteWorkerCellId,
        outStreamId as keyof OStreams & string,
        this.postFn,
      );
    }

    //
    this.initLifeCyclePromises();

    // Inputs either are pipes, or signal values... make sure to connect stuff.
    if (this.uses) {
      this.connect(this.uses);
    }
  }

  async connectAllOutputs(): Promise<AbstractSignalStructFn<O>> {
    const ids = [...this.cellKind.outputNames];
    const promises = ids.map((outSignalId) => this.outputs[outSignalId as keyof O].connect());
    const allOutputs = {} as AbstractSignalStructFn<O>;
    const allReady = await Promise.all(promises);
    allReady.forEach((value, i) => (allOutputs[ids[i]] = value));
    return allOutputs;
  }

  connect(connections: {
    inputs?: { [Key in keyof Partial<I>]: AbstractSignal<I[Key]> | SignalReceiveChannel<I[Key]> };
    inStreams?: { [Key in keyof Partial<IStreams>]: StreamReceiveChannel<IStreams[Key]> };
  }) {
    if (connections.inputs) {
      for (const [k, receiveThing] of Object.entries(connections.inputs)) {
        if (receiveThing instanceof SignalReceiveChannel) {
          const recChannel = receiveThing as SignalReceiveChannel<I[keyof I]>;
          recChannel.addPipeTo(this.inputs[k as keyof I]);
        } else {
          const sendToChannelInput = this.inputs[k].connect();
          // TODO: should we track and later delete the derived thing...?
          this.space.derived(() => {
            sendToChannelInput.set(receiveThing());
          });
        }
      }
    }

    if (connections.inStreams) {
      for (const [k, receiveThing] of Object.entries(connections.inStreams)) {
        const recChannel: StreamReceiveChannel<IStreams[keyof IStreams]> = receiveThing;
        recChannel.addPipeTo(this.inStreams[k as keyof IStreams]);
      }
    }
  }

  initLifeCyclePromises() {
    // this.outputSoFar = {};
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
      this.env.runningCells.delete(this as SomeCellController);
      this.status.set(CellStatus.Stopped);
    });
  }

  reInitRemotes() {
    for (const inputSignalId of this.cellKind.inputNames) {
      const channel = this.inputs[inputSignalId];
      if (channel.remoteConnection) {
        channel.disconnect();
        channel.connect();
      }
    }
    for (const inStreamId of this.cellKind.inStreamNames) {
      const channel = this.inStreams[inStreamId];
      if (channel.remoteConnection) {
        channel.disconnect();
        channel.connect();
      }
    }
    for (const outSignalId of this.cellKind.outputNames) {
      const channel = this.outputs[outSignalId];
      if (channel.remoteConnection) {
        channel.disconnect();
        channel.connect();
      }
      // channel.recEnd.onceReady.then((signal) => {
      //   this.outputSoFar[outSignalId] = signal;
      //   this.stillExpectedOutputs.delete(outSignalId);
      //   if (this.stillExpectedOutputs.size === 0) {
      //     this.resolveWithAllOutputsFn(this.outputSoFar as SetableSignalStructFn<O>);
      //   }
      // });
    }
    for (const outStreamId of this.cellKind.outStreamNames) {
      const channel = this.outStreams[outStreamId];
      if (channel.remoteConnection) {
        channel.disconnect();
        channel.connect();
      }
    }
  }

  // Invokes start in the signalcell.
  async start(): Promise<void> {
    if (this.uses && this.uses.config && this.uses.config.logCellMessages) {
      this.worker = new LoggingMessagesWorker(
        this.cellKind.startWorkerFn(),
        this.id + ':controller',
        this.id + ':worker',
      );
    } else {
      this.worker = this.cellKind.startWorkerFn();
    }
    // Protocall of stuff a worker can send us, and we respond to...
    this.worker.onmessage = ({ data }) => {
      const messageFromWorker: CellMessage = data;
      switch (messageFromWorker.kind) {
        case CellMessageKind.ReceivedAllInputsAndStarting:
          this.resolveWhenReceivedAllInputsAndStartingFn();
          break;
        case CellMessageKind.Finished:
          // CONSIDER: what if there are missing outputs?
          this.resolveWhenFinishedFn();
          break;
        default:
          console.error('main thread go unknown worker message: ', data);
          break;
      }
    };

    this.status.set(CellStatus.StartingWaitingForInputs);
    const message: CellMessage = {
      kind: CellMessageKind.StartCellRun,
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
      const message: CellMessage = {
        kind: CellMessageKind.FinishRequest,
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

export type SomeCellKind = CellKind<ValueStruct, ValueStruct, ValueStruct, ValueStruct>;
export type SomeCellController = CellController<any, any, any, any>;
