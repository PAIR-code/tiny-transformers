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
  PipeOutputStreamMessage,
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
  ports: MessagePort[] = [];

  constructor(
    // For debugging. Nice to know what cell this receieve end if associated with.
    public cellId: string,
    public space: SignalSpace,
    // Signal id.
    public signalId: string,
    public defaultPostMessageFn: (v: LabMessage, ports?: MessagePort[]) => void,
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

  addPort(messagePort: MessagePort) {
    this.ports.push(messagePort);
    messagePort.onmessage = (event: MessageEvent) => {
      const message = event.data as LabMessage;
      if (message.kind !== LabMessageKind.SetSignalValue) {
        throw new Error(`addPort (${this.signalId}) onMessage: unknown kind: ${event.data.kind}.`);
      }
      this.onSetInput(message.value as T);
    };
  }

  // Send a message to all senders who send stuff to this Receive End
  pipeSendersTo(newPort: MessagePort, options?: { keepHereToo: boolean }): void {
    const message: LabMessage = {
      kind: LabMessageKind.PipeOutputSignal,
      signalId: this.signalId,
      ports: [newPort],
      options,
    };

    for (const senderPort of this.ports) {
      senderPort.postMessage(message, message.ports);
    }
  }
}

// ----------------------------------------------------------------------------
// Consider: we could take in a signal, and have a derived send functionality
export class SignalSendEnd<T> implements AbstractSignalSendEnd<T> {
  ports: MessagePort[] = [];
  lastValue?: T;

  constructor(
    // For debugging. Nice to know what cell this receieve end if associated with.
    public cellId: string,
    public space: SignalSpace,
    public signalId: string,
    public defaultPostMessageFn?: (m: LabMessage, transerables?: Transferable[]) => void,
  ) {}

  addPort(messagePort: MessagePort) {
    this.ports.push(messagePort);
    console.log('addPort, lastvalue: ', this.lastValue);
    if (this.lastValue) {
      const message: LabMessage = {
        kind: LabMessageKind.SetSignalValue,
        signalId: this.signalId,
        value: this.lastValue,
      };
      messagePort.postMessage(message);
    }
    messagePort.onmessage = (event: MessageEvent) => {
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
    for (const port of this.ports) {
      port.postMessage(message);
    }
    if (this.defaultPostMessageFn) {
      this.defaultPostMessageFn(message);
    }
  }

  // Pipe everywhere that sends to recEnd, to now send to everywhere that this
  // send end sends to.
  pipeFrom(recEnd: SignalReceiveEnd<T>, options?: { keepHereToo: boolean }) {
    const channel = new MessageChannel();

    const message: LabMessage = {
      kind: LabMessageKind.PipeInputSignal,
      signalId: this.signalId as string,
      ports: [channel.port1],
    };

    for (const port of this.ports) {
      // Pipe the input stream at the far end of the SendEnd to start handling
      // inputs from the new port.
      port.postMessage(message, message.ports);

      recEnd.pipeSendersTo(channel.port2, options);
    }
    recEnd.onceReady.then((signal) => this.set(signal()));
  }
}

// ----------------------------------------------------------------------------
export type ConjestionControlConfig = {
  // TODO: consider fancier conjestion control abstraction, e.g. function and
  // data on returned values.
  maxQueueSize: number;
  resumeAtQueueSize: number; // Expected to be smaller than maxQueueSize;
  // Consider if we want to allow feedback every N to minimise communication
  // flow costs. That depends on the assumptions of the sender... they need to
  // agree on conjestion control protocol, and right now sender is counting, so
  // this wouldn't work.
};

type ConjestionState = {
  lastReturnedId: number;
  queueLength: number;
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
  ports: MessagePort[] = [];
  // Note: defaultPort is included in ports.
  defaultPort: MessagePort;
  // The function that is to be called on every input.
  public onAddValue: (port: MessagePort, input: StreamValue<T>) => void;
  // The resulting iterator on inputs.
  public inputIter: AsyncIterOnEvents<T>;

  constructor(
    // For debugging. Nice to know what cell this receieve end if associated with.
    public cellId: string,
    public space: SignalSpace,
    // The id of the inStream this is recieving into.
    public streamId: string,
    // Used to post conjestion control feedback, or to pipe output from the
    // worker to other locations.
    public defaultPostMessageFn: (
      m: ConjestionFeedbackMessage | PipeOutputStreamMessage,
      // Typically these are ports.
      transerables?: Transferable[],
    ) => void,
  ) {
    this.inputIter = new AsyncIterOnEvents<T>();

    this.defaultPort = { postMessage: this.defaultPostMessageFn } as MessagePort;
    this.addPort(this.defaultPort);

    // First input creates the signal, resolves the promise, posts the first
    // conjestion control index, and then resets onNextInput for future cases to
    // just set the signal, and posts the next conjestion control index.
    this.onAddValue = (port: MessagePort, streamValue: StreamValue<T>) => {
      // // If stream was stopped.
      // if (value === null) {
      //   this.inputIter.done();
      //   return;
      // }
      this.inputIter.nextEvent(streamValue.value);
      // TODO: smarter control for ConjestionFeedback is possible, e.g. report
      // every N to save communication bandwidth.
      this.postConjestionFeedback(port, streamValue.idx);
    };
  }

  onDone() {
    this.inputIter.done();
  }

  addPort(port: MessagePort) {
    this.ports.push(port);
    port.onmessage = (event: MessageEvent) => {
      const workerMessage: LabMessage = event.data;
      if (workerMessage.kind === LabMessageKind.AddStreamValue) {
        this.onAddValue(port, workerMessage.value as StreamValue<T>);
      } else if (workerMessage.kind === LabMessageKind.EndStream) {
        this.onDone();
      } else {
        throw new Error(`inputStream port got unexpected messageKind: ${workerMessage.kind}`);
      }
    };
  }

  postConjestionFeedback(port: MessagePort, idx: number) {
    const message: LabMessage = {
      kind: LabMessageKind.ConjestionControl,
      streamId: this.streamId,
      idx,
    };
    port.postMessage(message);
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
export class StreamSendEnd<T> implements AbstractStreamSendEnd<T> {
  portConjestion: Map<MessagePort, ConjestionState> = new Map();
  // default is included in the portConjestion map by default.
  public defaultPort: MessagePort;
  public defaultState: ConjestionState;
  lastMessageIdx: number = 0;

  // Think about having a default output postMessage?
  constructor(
    // For debugging. Nice to know what cell this receieve end if associated with.
    public cellId: string,
    public space: SignalSpace,
    public streamId: string,
    public defaultPostMessageFn: (m: AddStreamValueMessage, transerables?: Transferable[]) => void,
    public config: {
      conjestionControl: ConjestionControlConfig;
    },
  ) {
    // if (this.defaultPostMessageFn) {
    this.defaultPort = { postMessage: this.defaultPostMessageFn } as MessagePort;
    this.defaultState = this.addPort(this.defaultPort);
    // }
  }

  addPort(messagePort: MessagePort): ConjestionState {
    const messagePortConjestionState: ConjestionState = {
      lastReturnedId: 0,
      queueLength: 0,
      done: false,
    };
    this.portConjestion.set(messagePort, messagePortConjestionState);
    messagePort.onmessage = (event: MessageEvent) => {
      this.conjestionFeedbackStateUpdate(event.data, messagePortConjestionState);
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
    state.lastReturnedId = conjestionFeedback.idx;
    state.queueLength--;
    if (
      state.queueLength <= this.config.conjestionControl.resumeAtQueueSize &&
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
    for (const [port, state] of this.portConjestion.entries()) {
      const stop = await this.sendTo(value, { port, state });
      if (stop) {
        return;
      }
    }
  }

  // Pipe everywhere that sends to recEnd, to now send to everywhere that this
  // send end sends to.
  pipeFrom(recEnd: StreamReceiveEnd<T>, options?: { keepHereToo: boolean }) {
    for (const portInRecEnd of recEnd.ports) {
      for (const portInThisSendEnd of this.portConjestion.keys()) {
        const channel = new MessageChannel();
        // To all the places recEnd recieves from, which send to it.
        const senderToRecEndMessage: LabMessage = {
          kind: LabMessageKind.PipeOutputStream,
          streamId: recEnd.streamId,
          ports: [channel.port2],
          options,
        };
        // To all the places we send to, which recieve from us.
        const thisSendEndReceiverMessage: LabMessage = {
          kind: LabMessageKind.PipeInputStream,
          streamId: this.streamId as string,
          ports: [channel.port1],
        };
        portInRecEnd.postMessage(senderToRecEndMessage, senderToRecEndMessage.ports);
        portInThisSendEnd.postMessage(thisSendEndReceiverMessage, thisSendEndReceiverMessage.ports);
      }
    }
  }

  async sendTo(value: T, target: { port: MessagePort; state: ConjestionState }): Promise<boolean> {
    const { port, state } = target;
    if (state.done) {
      throw new Error('Called sendTo(...) on a done stream.');
    }
    if (state.queueLength > this.config.conjestionControl.maxQueueSize) {
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
    state.queueLength++;
    // console.log(
    //   `outStream(${this.id}@${state.queueLength}): value (${streamValue.idx}): ${streamValue.value}`
    // );
    port.postMessage(message);
    return false;
  }

  endPortStream(port: MessagePort, state: ConjestionState) {
    const message: EndStreamMessage = {
      kind: LabMessageKind.EndStream,
      // The name of the signal stream having its next value set.
      streamId: this.streamId,
    };
    port.postMessage(message);
    state.done = true;
    if (state.resumeResolver) {
      state.resumeResolver();
    }
  }

  removePort(port: MessagePort, state: ConjestionState) {
    this.endPortStream(port, state);
    // this.portConjestion.delete(port);
  }

  done() {
    for (const [port, state] of this.portConjestion.entries()) {
      this.endPortStream(port, state);
    }
    // delete this.default;
    this.portConjestion = new Map();
  }
}
