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
 * A set of class wrappers for signal-based communication over a web-worker like
 * abstraction. This includes both signal values and streams of values.
 * Input/Output is relative to the environment it is being executed in.
 */
import { AbstractSignal, SetableSignal, SignalSpace } from '../signalspace/signalspace';
import { AsyncIterOnEvents } from './async-iter-on-events';
import {
  ConjestionFeedbackMessage,
  LabMessage,
  AddStreamValueMessage,
  StreamValue,
  LabMessageKind,
  EndStreamMessage,
  Remote,
  RemoteKind,
} from './lab-message-types';

// TODO: rename to sending / receiving to more directly represent the action,
// and avoid the confusion of an input being an output type.

// ----------------------------------------------------------------------------
export abstract class AbstractSignalReceiveEnd<T> {
  abstract onceReady: Promise<AbstractSignal<T>>;
}

export abstract class AbstractSignalSendEnd<T> {
  abstract set(x: T): void;
  abstract lastValue?: T;
}

export abstract class AbstractStreamSendEnd<T> {
  abstract send(x: T): Promise<void>;
  abstract done(): void;
}

export abstract class AbstractStreamReceiveEnd<T> implements AsyncIterable<T>, AsyncIterator<T> {
  abstract inputIter: AsyncIterOnEvents<T>;
  abstract next(): Promise<IteratorResult<T, null>>;
  abstract [Symbol.asyncIterator](): AsyncIterable<T> & AsyncIterator<T>;
}

// ----------------------------------------------------------------------------
export class SignalReceiveEnd<T> implements AbstractSignalReceiveEnd<T> {
  readyResolver!: (signal: SetableSignal<T>) => void;
  onceReady: Promise<SetableSignal<T>>;
  onSetInput: (input: T) => void;
  remotes: Remote[] = [];

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
    this.remotes.push(remoteSender);
    remoteSender.messagePort.onmessage = (event: MessageEvent) => {
      const message = event.data as LabMessage;
      if (message.kind !== LabMessageKind.SetSignalValue) {
        throw new Error(`Bad kind. ${this.cellId}:${this.signalId} got: ${event.data.kind}.`);
      }
      if (message.signalId !== this.signalId) {
        throw new Error(`Crossed Ids. ${this.cellId}:${this.signalId} got: ${message.signalId}`);
      }
      this.onSetInput(message.value as T);
    };
  }
}

// ----------------------------------------------------------------------------
// Consider: we could take in a signal, and have a derived send functionality
export class SignalSendEnd<T> implements AbstractSignalSendEnd<T> {
  // ports: MessagePort[] = [];
  remotes: Remote[] = [];

  lastValue?: T;

  constructor(
    // For debugging. Nice to know what the local cell this receieve end is
    // associated with.
    public cellId: string,
    public space: SignalSpace,
    public signalId: string,
  ) {}

  addRemote(remoteReceiver: Remote) {
    this.remotes.push(remoteReceiver);
    if (this.lastValue) {
      const message: LabMessage = {
        kind: LabMessageKind.SetSignalValue,
        signalId: this.signalId,
        value: this.lastValue,
      };
      remoteReceiver.messagePort.postMessage(message);
    }
    remoteReceiver.messagePort.onmessage = (event: MessageEvent) => {
      console.warn(`unexpected message on output port ${this.signalId}`);
    };
  }

  set(value: T): void {
    this.lastValue = value;
    const message: LabMessage = {
      kind: LabMessageKind.SetSignalValue,
      signalId: this.signalId,
      value,
    };
    for (const remoteReceiver of this.remotes) {
      remoteReceiver.messagePort.postMessage(message);
    }
  }

  // Pipe everywhere that sends to recEnd, to now send to everywhere that this
  // send end sends to.
  pipeFrom(recEnd: SignalReceiveEnd<T>) {
    for (const remoteSender of recEnd.remotes) {
      for (const remoteReceiver of this.remotes) {
        const channel = new MessageChannel();

        const remoteSenderMessage: LabMessage = {
          kind: LabMessageKind.AddOutputRemote,
          recipientSignalId: remoteSender.remoteChannelId,
          remoteSignal: {
            kind: RemoteKind.MessagePort,
            remoteCellId: remoteReceiver.remoteCellId,
            remoteChannelId: remoteReceiver.remoteChannelId,
            messagePort: channel.port1,
          },
        };
        remoteSender.messagePort.postMessage(remoteSenderMessage, [channel.port1]);

        const remoteReceiverMessage: LabMessage = {
          kind: LabMessageKind.AddInputRemote,
          recipientSignalId: remoteReceiver.remoteChannelId,
          remoteSignal: {
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
    recEnd.onceReady.then((signal) => this.set(signal()));
  }
}

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
export class StreamReceiveEnd<T> implements AbstractStreamReceiveEnd<T> {
  // The MessagePorts to report feedback to on how busy we are.
  remotes: Remote[] = [];

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
    this.remotes.push(remote);
    remote.messagePort.onmessage = (event: MessageEvent) => {
      const workerMessage: LabMessage = event.data;
      if (workerMessage.kind === LabMessageKind.AddStreamValue) {
        this.onAddValue(remote, workerMessage.value as StreamValue<T>);
      } else if (workerMessage.kind === LabMessageKind.EndStream) {
        this.onDone();
      } else {
        throw new Error(`inputStream port got unexpected messageKind: ${workerMessage.kind}`);
      }
    };
  }

  postConjestionFeedback(remote: Remote, idx: number) {
    const message: LabMessage = {
      kind: LabMessageKind.ConjestionControl,
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

export class StreamSendEnd<T> implements AbstractStreamSendEnd<T> {
  // CONSIDER: think about using a double map, remoteCellID --> RemoteSignalId
  // --> Remote+ConestionState. The issue with using Remote as is, is that one
  // might get duplicates in the map, which would be bad and hard/slow to spot
  // (have to enumerate all Remotes and check them all)
  remotes: Map<Remote, ConjestionState> = new Map();
  public lastMessageIdx: number = 0;
  public config: StreamSendEndConfig;

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
    for (const state of this.remotes.values()) {
      Object.assign(state, initConjectionState());
    }
    this.lastMessageIdx = 0;
  }

  addRemote(remote: Remote): ConjestionState {
    const messagePortConjestionState: ConjestionState = initConjectionState();
    this.remotes.set(remote, messagePortConjestionState);
    remote.messagePort.onmessage = (event: MessageEvent) => {
      const data: ConjestionFeedbackMessage = event.data;
      if (data.kind && data.kind === LabMessageKind.ConjestionControl) {
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
    for (const [remote, state] of this.remotes.entries()) {
      const stop = await this.sendTo(value, { remote, state });
      if (stop) {
        return;
      }
    }
  }

  // Pipe everywhere that sends to recEnd, to now send to everywhere that this
  // send end sends to.
  pipeFrom(recEnd: StreamReceiveEnd<T>) {
    for (const remoteSender of recEnd.remotes) {
      for (const remoteReceiver of this.remotes.keys()) {
        const channel = new MessageChannel();

        const remoteSenderMessage: LabMessage = {
          kind: LabMessageKind.AddOutStreamRemote,
          recipientStreamId: remoteSender.remoteChannelId,
          remoteStream: {
            kind: RemoteKind.MessagePort,
            remoteCellId: remoteReceiver.remoteCellId,
            remoteChannelId: remoteReceiver.remoteChannelId,
            messagePort: channel.port1,
          },
        };
        remoteSender.messagePort.postMessage(remoteSenderMessage, [channel.port1]);

        const remoteReceiverMessage: LabMessage = {
          kind: LabMessageKind.AddInStreamRemote,
          recipientStreamId: remoteReceiver.remoteChannelId,
          remoteStream: {
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
      kind: LabMessageKind.AddStreamValue,
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

  endRemoteStream(remote: Remote, state: ConjestionState) {
    const message: EndStreamMessage = {
      kind: LabMessageKind.EndStream,
      // The name of the signal stream having its next value set.
      streamId: this.streamId,
    };
    remote.messagePort.postMessage(message);
    state.done = true;
    if (state.resumeResolver) {
      state.resumeResolver();
    }
  }

  removeRemote(remote: Remote, state: ConjestionState) {
    this.endRemoteStream(remote, state);
  }

  done() {
    for (const [port, state] of this.remotes.entries()) {
      this.endRemoteStream(port, state);
    }
    this.remotes = new Map();
  }
}
