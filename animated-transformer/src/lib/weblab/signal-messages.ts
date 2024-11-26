// // The value send over a streaming port.
// export type InputConfig = {
//   conjestionFeedback: boolean;
//   // Consider if we want feedback every N to minimise communication flow costs.
// };

import { SetableSignal, SignalSpace } from '../signalspace/signalspace';
import { OutStreamSendFn } from './cell-types';
import { AsyncIterOnEvents } from './conjestion-controlled-exec';
import {
  ConjestionFeedbackMessage,
  LabMessage,
  AddStreamValueMessage,
  StreamValue,
  LabMessageKind,
  EndStreamMessage,
} from './lab-message-types';

// ----------------------------------------------------------------------------
// Consider: we could take in a signal, and have a derived send functionality
export class SignalOutput<T> {
  ports: MessagePort[] = [];

  // TODO: have a default sendMessage...
  constructor(
    public space: SignalSpace,
    public id: string,
    public defaultPostMessageFn?: (m: LabMessage) => void
  ) {}

  addPort(messagePort: MessagePort) {
    this.ports.push(messagePort);
    messagePort.onmessage = (event: MessageEvent) => {
      console.warn(`unexpected message on output port ${this.id}`);
    };
  }

  set(value: T): void {
    const message: LabMessage = { kind: LabMessageKind.SetSignalValue, signalId: this.id, value };
    for (const port of this.ports) {
      port.postMessage(message);
    }
    if (this.defaultPostMessageFn) {
      this.defaultPostMessageFn(message);
    }
  }
}

// ----------------------------------------------------------------------------
export class SignalInput<T> {
  readyResolver!: (signal: SetableSignal<T>) => void;
  onceReady: Promise<SetableSignal<T>>;
  onSetInput: (input: T) => void;
  ports: MessagePort[] = [];

  constructor(
    public space: SignalSpace,
    public id: string,
    public defaultPostMessageFn: (v: LabMessage, ports: MessagePort[]) => void
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
        throw new Error(`addPort (${this.id}) onMessage: unknown kind: ${event.data.kind}.`);
      }
      this.onSetInput(message.value as T);
    };
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
export class SignalInputStream<T> implements AsyncIterable<T>, AsyncIterator<T> {
  // readyResolver!: (signal: SetableSignal<T>) => void;
  // cancelResolver!: () => void;
  // onceReady: Promise<SetableSignal<T>>;

  // The MessagePorts to report feedback to on how busy we are.
  ports: MessagePort[] = [];
  // The function that is to be called on every input.
  public onAddValue: (port: MessagePort | null, input: StreamValue<T>) => void;
  // The resulting iterator on inputs.
  public inputIter: AsyncIterOnEvents<T>;

  constructor(
    public space: SignalSpace,
    public id: string,
    // Used to post conjestion control feedback.
    public defaultPostMessageFn: (m: ConjestionFeedbackMessage) => void
  ) {
    this.inputIter = new AsyncIterOnEvents<T>();

    // First input creates the signal, resolves the promise, posts the first
    // conjestion control index, and then resets onNextInput for future cases to
    // just set the signal, and posts the next conjestion control index.
    this.onAddValue = (port: MessagePort | null, streamValue: StreamValue<T>) => {
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

  postConjestionFeedback(port: MessagePort | null, idx: number) {
    const message: LabMessage = {
      kind: LabMessageKind.ConjestionControl,
      streamId: this.id,
      idx,
    };
    if (port) {
      port.postMessage(message);
    } else {
      this.defaultPostMessageFn(message);
    }
  }

  public async next(): Promise<IteratorResult<T, null>> {
    return this.inputIter.next();
  }

  public [Symbol.asyncIterator]() {
    return this.inputIter;
  }
}

// ----------------------------------------------------------------------------
export class SignalOutputStream<T> {
  portConjestion: Map<MessagePort, ConjestionState> = new Map();
  public default?: {
    port: MessagePort;
    // CONSIDER: use; { postMessage: (v: AddStreamValueMessage) => void };
    state: ConjestionState;
  };
  lastMessageIdx: number = 0;

  // sendFn: OutStreamSendFn<T>;

  // Think about having a default output postMessage?
  constructor(
    public space: SignalSpace,
    public id: string,
    public config: {
      conjestionControl: ConjestionControlConfig;
      defaultPostMessageFn?: (m: AddStreamValueMessage) => void;
    }
  ) {
    if (this.config.defaultPostMessageFn) {
      const port = { postMessage: this.config.defaultPostMessageFn } as MessagePort;
      // Add a fake messagePort to default poster if one was provided.
      const state: ConjestionState = {
        lastReturnedId: 0,
        queueLength: 0,
        done: false,
      };
      // const state = this.portConjestion.get(port as MessagePort)!;
      this.default = { port, state };
    }
    // const sendFn = this.send;
    // function send(value: T) {
    //   return sendFn(value);
    // }
    // send.done = () => this.done();
    // this.sendFn = send;
  }

  addPort(messagePort: MessagePort) {
    const messagePortConjestionState: ConjestionState = {
      lastReturnedId: 0,
      queueLength: 0,
      done: false,
    };
    this.portConjestion.set(messagePort, messagePortConjestionState);
    messagePort.onmessage = (event: MessageEvent) => {
      this.conjestionFeedbackStateUpdate(event.data, messagePortConjestionState);
    };
  }

  conjestionFeedbackStateUpdate(
    conjestionFeedback: ConjestionFeedbackMessage,
    state?: ConjestionState
  ) {
    if (!state) {
      if (this.default) {
        state = this.default.state;
      } else {
        throw new Error('conjestionFeedbackStateUpdate: no state to update');
      }
    }
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
    if (this.default) {
      this.sendTo(value, this.default);
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
      streamId: this.id,
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
      streamId: this.id,
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
    if (this.default) {
      this.endPortStream(this.default.port, this.default.state);
    }
    // delete this.default;
    this.portConjestion = new Map();
  }
}
