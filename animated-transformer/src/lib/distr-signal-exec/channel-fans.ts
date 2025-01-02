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
 * A set of class wrappers for fan-in and fan-out for communication over a
 * web-worker like abstraction. This includes both values, and streams of
 * values, and streams have conjestion control (so the sender can stop sending
 * if/when the receiver is being too slow to act on the received items)
 */
import { SetableSignal, SignalSpace } from '../signalspace/signalspace';
import { AsyncIterOnEvents } from './async-iter-on-events';
import { CellMessage, CellMessageKind, Remote, RemoteKind } from './lab-message-types';

// TODO: rename to sending / receiving to more directly represent the action,
// and avoid the confusion of an input being an output type.

// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Messages between send/receive channel ends.
export enum RemoteMessageKind {
  // From env or cell to env to cell, when adding a value to a stream send end.
  AddStreamValue = 'AddStreamValue',
  // From env or cell to env to cell, when ending a stream.
  EndStream = 'EndStream',
  // From env or cell to env to cell, when setting a value via a signal send
  // end.
  SetSignalValue = 'SetSignalValue',
  // From a receive end of a stream to tell the sender it has received stuff.
  ConjestionControl = 'ConjestionControl',
  // Remote has closed the channel. We need to stop sending messages, and remove
  // it.
  Closed = 'Closed',
}

// Used to send feedback to a port that is sending stuff on which example was
// last processed, so that internal queues don't explode.
export type ConjestionFeedbackMessage = {
  kind: RemoteMessageKind.ConjestionControl;
  idx: number;
  streamId: string;
};

// null Indicates the end of the stream;
// TODO: consider a "pause value".
export type StreamValue<T> = { idx: number; value: T };

export type AddStreamValueMessage = {
  kind: RemoteMessageKind.AddStreamValue;
  // The name of the signal stream having its next value set.
  streamId: string;
  // A unique incremental number indicating the sent-stream value.
  value: StreamValue<unknown>;
};

export type EndStreamMessage = {
  kind: RemoteMessageKind.EndStream;
  // The name of the signal stream having its next value set.
  streamId: string;
};

export type SetSignalValueMessage = {
  kind: RemoteMessageKind.SetSignalValue;
  // The name of the signal stream having its next value set.
  signalId: string;
  // A unique incremental number indicating the sent-stream value.
  value: unknown;
};

export type RemoteClosedMessage = {
  kind: RemoteMessageKind.Closed;
};

export type RemoteMessage =
  | SetSignalValueMessage
  | AddStreamValueMessage
  | ConjestionFeedbackMessage
  | EndStreamMessage
  | RemoteClosedMessage;

// ----------------------------------------------------------------------------
export abstract class FanRemotes {
  abstract remotes: Iterable<Remote>;
  abstract addRemote(remote: Remote): void;
  abstract removeRemote(remote: Remote): void;
}

// TODO: consider falling these Fan instead of End, since the key thing these do
// is fan-out or fan-in for a channel.

// ----------------------------------------------------------------------------
// # SIGNALS
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// implements AbstractSignalReceiveEnd<T>
export class SignalReceiverFanIn<T> implements FanRemotes {
  readyResolver!: (signal: SetableSignal<T>) => void;
  onceReady: Promise<SetableSignal<T>>;
  onSetInput: (input: T) => void;
  remotes: Set<Remote> = new Set();

  constructor(
    // For debugging. Nice to know what the local cell this receieve end is
    // associated with.
    public cellId: string,
    public space: SignalSpace,
    // The local Channel ID.
    public signalId: string,
    // public defaultPostMessageFn: (v: LabMessage, ports?: MessagePort[]) => void,
  ) {
    this.onceReady = new Promise<SetableSignal<T>>((resolve) => {
      // TODO: consider allowing parent to send stuff before we ask for it..
      // this would just involved checking the inputResolvers here.
      this.readyResolver = resolve;
    });

    // First input creates the signal, resolves the promise, posts the first
    // conjestion control index, and then resets onNextInput for future cases to
    // just set the signal, and posts the next conjestion control index.
    this.onSetInput = (firstInput: T) => {
      const signal = this.space.setable(firstInput);
      this.readyResolver(signal);
      this.onSetInput = (nextInput: T) => {
        signal.set(nextInput);
      };
    };
  }

  addRemote(remoteSender: Remote) {
    this.remotes.add(remoteSender);
    remoteSender.messagePort.onmessage = (event: MessageEvent) => {
      const message = event.data as RemoteMessage;
      if (message.kind !== RemoteMessageKind.SetSignalValue) {
        throw new Error(`Bad kind. ${this.cellId}:${this.signalId} got: ${event.data.kind}.`);
      }
      if (message.signalId !== this.signalId) {
        throw new Error(`Crossed Ids. ${this.cellId}:${this.signalId} got: ${message.signalId}`);
      }
      this.onSetInput(message.value as T);
    };
  }

  removeRemote(remote: Remote) {
    const message: RemoteMessage = { kind: RemoteMessageKind.Closed };
    remote.messagePort.postMessage(message);
    remote.messagePort.close();
    this.remotes.delete(remote);
  }
}

// ----------------------------------------------------------------------------
// Consider: we could take in a signal, and have a derived send functionality
export class SignalSenderFanOut<T> implements FanRemotes {
  // ports: MessagePort[] = [];
  remotes: Set<Remote> = new Set();

  lastValue?: T;

  constructor(
    // For debugging. Nice to know what the local cell this receieve end is
    // associated with.
    public cellId: string,
    public space: SignalSpace,
    public signalId: string,
  ) {}

  addRemote(remoteReceiver: Remote) {
    this.remotes.add(remoteReceiver);
    if (this.lastValue) {
      const message: RemoteMessage = {
        kind: RemoteMessageKind.SetSignalValue,
        signalId: this.signalId,
        value: this.lastValue,
      };
      remoteReceiver.messagePort.postMessage(message);
    }
    remoteReceiver.messagePort.onmessage = (event: MessageEvent) => {
      console.warn(`unexpected message on output port ${this.signalId}`);
    };
  }

  removeRemote(remote: Remote) {
    const message: RemoteMessage = { kind: RemoteMessageKind.Closed };
    remote.messagePort.postMessage(message);
    remote.messagePort.close();
    this.remotes.delete(remote);
  }

  set(value: T): void {
    this.lastValue = value;
    const message: RemoteMessage = {
      kind: RemoteMessageKind.SetSignalValue,
      signalId: this.signalId,
      value,
    };
    for (const remoteReceiver of this.remotes) {
      remoteReceiver.messagePort.postMessage(message);
    }
  }
}

// ----------------------------------------------------------------------------
// # STREAMS
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
export type ConjestionControlConfig = {
  // TODO: consider fancier conjestion control abstraction, e.g. function and
  // data on returned values.

  // UnrespondCount is the amount of messages we believe are queued on transit
  // and being processed by the remote system.
  pauseFromUnrespondCount: number;
  resumeAtUnrespondCount: number; // Expected to be smaller than maxQueueSize;
  // Consider if we want to allow feedback every N to minimise communication
  // flow costs. That depends on the assumptions of the sender... they need to
  // agree on conjestion control protocol, and right now sender is counting, so
  // this wouldn't work.
};

type ConjestionState = {
  lastResponceId: number;
  // If unrespondCount is set to -1, then no conjestion control will happen, and
  // unrespondCount will not be updated.
  unrespondCount: number;
  // When paused, this is set, and allows triggering of resuming.
  resumeResolver?: () => void;
  onceResume?: Promise<void>;
  // True when completed.
  done: boolean;
};

// ----------------------------------------------------------------------------
// The key concept of an input stream is that it recieves events and posts
// feedback on the last input recieved. It provides an inputIter (CONSIDER: we
// could just set a signal too...? But then we wouldn't have information on when
// the stream ends...?). If the worker/event system is very busy, then it will
// report feedback less often, and this is how the sender knows to reduce/pause
// the output flow. This conjestion control avoids inter-process/worker message
// overflows.
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Receive End of Streams listen to messages on many ports, and handle messages
// from each port, pulling them all into the iterator.
// ----------------------------------------------------------------------------
export class StreamReceiverFanIn<T> implements FanRemotes {
  // The MessagePorts to report feedback to on how busy we are.
  remotes: Set<Remote> = new Set();

  // The resulting iterator on inputs.
  public inputIter: AsyncIterOnEvents<T>;

  constructor(
    // For debugging. Nice to know what the local cell this receieve end is
    // associated with.
    public cellId: string,
    public space: SignalSpace,
    public streamId: string,
  ) {
    this.inputIter = new AsyncIterOnEvents<T>();
  }

  onAddValue(remote: Remote, streamValue: StreamValue<T>) {
    this.inputIter.nextEvent(streamValue.value);
    // TODO: smarter control for ConjestionFeedback is possible, e.g. report
    // every N to save communication bandwidth.
    this.postConjestionFeedback(remote, streamValue.idx);
  }

  init() {
    this.inputIter = new AsyncIterOnEvents<T>();
  }

  onDone() {
    this.inputIter.done();
  }

  addRemote(remote: Remote) {
    this.remotes.add(remote);
    remote.messagePort.onmessage = (event: MessageEvent) => {
      const workerMessage: RemoteMessage = event.data;
      switch (workerMessage.kind) {
        case RemoteMessageKind.AddStreamValue:
          this.onAddValue(remote, workerMessage.value as StreamValue<T>);
          break;
        case RemoteMessageKind.EndStream:
          this.onDone();
          break;
        case RemoteMessageKind.Closed:
          this.remotes.delete(remote);
          break;
        default:
          throw new Error(`inputStream port got unexpected messageKind: ${workerMessage.kind}`);
      }
    };
  }

  removeRemote(remote: Remote) {
    const message: RemoteMessage = { kind: RemoteMessageKind.Closed };
    remote.messagePort.postMessage(message);
    remote.messagePort.close();
    this.remotes.delete(remote);
  }

  postConjestionFeedback(remote: Remote, idx: number) {
    const message: RemoteMessage = {
      kind: RemoteMessageKind.ConjestionControl,
      streamId: this.streamId,
      idx,
    };
    remote.messagePort.postMessage(message);
  }

  public async next(): Promise<IteratorResult<T, null>> {
    return this.inputIter.next();
  }

  public [Symbol.asyncIterator]() {
    return this.inputIter;
  }
}

// ----------------------------------------------------------------------------
// SendEnd of streams have a set of destinations where things get sent to. The
// send end also has a ConjestionState, so that if the send end doesn't hear
// from a receieve end for too long, then it stops sending to avoid
// over-conjesting communication flows.
// ----------------------------------------------------------------------------
export type StreamSendEndConfig = {
  conjestionControl: ConjestionControlConfig;
};

export function defaultStreamSendEndConfig(): StreamSendEndConfig {
  return {
    conjestionControl: {
      pauseFromUnrespondCount: 20,
      resumeAtUnrespondCount: 10,
    },
  };
}

export function initConjectionState(): ConjestionState {
  return {
    lastResponceId: 0,
    unrespondCount: 0,
    done: false,
  };
}

export class StreamSenderFanOut<T> implements FanRemotes {
  // CONSIDER: think about using a double map, remoteCellID --> RemoteSignalId
  // --> Remote+ConestionState. The issue with using Remote as is, is that one
  // might get duplicates in the map, which would be bad and hard/slow to spot
  // (have to enumerate all Remotes and check them all)

  remotesMap: Map<Remote, ConjestionState> = new Map();
  public lastMessageIdx: number = 0;
  public config: StreamSendEndConfig;

  get remotes(): Iterable<Remote> {
    return this.remotesMap.keys();
  }

  constructor(
    // For debugging. Nice to know what the local cell this receieve end is
    // associated with.
    public cellId: string,
    public space: SignalSpace,
    public streamId: string,
    config?: Partial<StreamSendEndConfig>,
  ) {
    this.config = { ...defaultStreamSendEndConfig(), ...config };
  }

  init() {
    // CONSIDER: do we need to worry about the resume state pomises, or do they
    // get garbage collected?
    for (const state of this.remotesMap.values()) {
      Object.assign(state, initConjectionState());
    }
    this.lastMessageIdx = 0;
  }

  addRemote(remote: Remote): ConjestionState {
    const messagePortConjestionState: ConjestionState = initConjectionState();
    this.remotesMap.set(remote, messagePortConjestionState);
    remote.messagePort.onmessage = (event: MessageEvent) => {
      const data: ConjestionFeedbackMessage = event.data;
      if (data.kind && data.kind === RemoteMessageKind.ConjestionControl) {
        this.conjestionFeedbackStateUpdate(data, messagePortConjestionState);
      } else {
        throw new Error(`Unknown message from remote: ${JSON.stringify(data)}`);
      }
    };
    return messagePortConjestionState;
  }

  conjestionFeedbackStateUpdate(
    conjestionFeedback: ConjestionFeedbackMessage,
    state: ConjestionState,
  ) {
    if (state.done) {
      return;
    }
    state.lastResponceId = conjestionFeedback.idx;
    state.unrespondCount--;
    if (
      state.unrespondCount <= this.config.conjestionControl.resumeAtUnrespondCount &&
      state.resumeResolver
    ) {
      state.resumeResolver();
    }
  }

  async asyncIterSend(iter: AsyncIterable<T>) {
    for await (const i of iter) {
      this.send(i);
    }
  }

  // Note: there's a rather sensitive assumtion that once resumeResolver is
  // called, the very next tick, but be a thread that was stuck/awaiting on the
  // promise; otherwise in theory a new send call could get inserted, and we may
  // now send messages out of other. A rather sneaky potential race condition.
  //
  // TODO: verify the semantics, or rewrite the code to properly store
  // configuration of values to send and ports to send them on, so that order of
  // sends is always respected.
  async send(value: T): Promise<void> {
    this.lastMessageIdx++;
    for (const [remote, state] of this.remotesMap.entries()) {
      const stop = await this.sendTo(value, { remote, state });
      if (stop) {
        return;
      }
    }
  }

  // Pipe everywhere that sends to recEnd, to now send to everywhere that this
  // send end sends to.
  pipeFrom(recEnd: StreamReceiverFanIn<T>) {
    for (const remoteSender of recEnd.remotes) {
      for (const remoteReceiver of this.remotesMap.keys()) {
        const channel = new MessageChannel();

        const remoteSenderMessage: CellMessage = {
          kind: CellMessageKind.AddOutStreamRemote,
          recipientChannelId: remoteSender.remoteChannelId,
          remote: {
            kind: RemoteKind.MessagePort,
            remoteCellId: remoteReceiver.remoteCellId,
            remoteChannelId: remoteReceiver.remoteChannelId,
            messagePort: channel.port1,
          },
        };
        remoteSender.messagePort.postMessage(remoteSenderMessage, [channel.port1]);

        const remoteReceiverMessage: CellMessage = {
          kind: CellMessageKind.AddInStreamRemote,
          recipientChannelId: remoteReceiver.remoteChannelId,
          remote: {
            kind: RemoteKind.MessagePort,
            remoteCellId: remoteSender.remoteCellId,
            remoteChannelId: remoteSender.remoteChannelId,
            messagePort: channel.port2,
          },
        };

        // Pipe the input stream at the far end of the SendEnd to start handling
        // inputs from the new port.
        remoteReceiver.messagePort.postMessage(remoteReceiverMessage, [channel.port2]);
      }
    }
  }

  async sendTo(value: T, target: { remote: Remote; state: ConjestionState }): Promise<boolean> {
    const { remote, state } = target;
    if (state.done) {
      throw new Error('Called sendTo(...) on a done stream.');
    }
    if (state.unrespondCount > this.config.conjestionControl.pauseFromUnrespondCount) {
      let resumeResolver!: () => void;
      const onceResumed = new Promise<void>((resolve) => {
        resumeResolver = resolve as () => void;
      });
      state.resumeResolver = resumeResolver;
      await onceResumed;
      if (state.done) {
        return true;
      }
    }
    const streamValue: StreamValue<T> = {
      idx: this.lastMessageIdx,
      value,
    };
    const message: AddStreamValueMessage = {
      kind: RemoteMessageKind.AddStreamValue,
      // The name of the signal stream having its next value set.
      streamId: this.streamId,
      // A unique incremental number indicating the sent-stream value.
      value: streamValue as StreamValue<unknown>,
    };
    if (state.unrespondCount >= 0) {
      state.unrespondCount++;
    }
    remote.messagePort.postMessage(message);
    return false;
  }

  sendAndUpdateToDone(remote: Remote, state: ConjestionState) {
    const message: EndStreamMessage = {
      kind: RemoteMessageKind.EndStream,
      // The name of the signal stream having its next value set.
      streamId: this.streamId,
    };
    remote.messagePort.postMessage(message);
    state.done = true;
    if (state.resumeResolver) {
      state.resumeResolver();
    }
  }

  removeRemote(remote: Remote) {
    this.sendAndUpdateToDone(remote, this.remotesMap.get(remote)!);
    const message: RemoteMessage = { kind: RemoteMessageKind.Closed };
    remote.messagePort.postMessage(message);
    remote.messagePort.close();
    this.remotesMap.delete(remote);
  }

  done() {
    for (const [port, state] of this.remotesMap.entries()) {
      this.sendAndUpdateToDone(port, state);
    }
    this.remotesMap = new Map();
  }
}
