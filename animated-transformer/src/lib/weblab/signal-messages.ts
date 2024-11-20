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
  ConjestionFeedbackMessageKind,
  FromWorkerMessage,
  StreamMessage,
  StreamValue,
  ToWorkerMessage,
} from './lab-message-types';

// ----------------------------------------------------------------------------
// Consider: we could take in a signal, and have a derived send functionality
export class SignalOutput<Name extends string, T> {
  ports: MessagePort[] = [];

  // TODO: have a default sendMessage...
  constructor(
    public space: SignalSpace,
    public id: Name,
    public defaultPostMessageFn?: (m: FromWorkerMessage) => void
  ) {}

  addPort(messagePort: MessagePort) {
    this.ports.push(messagePort);
    messagePort.onmessage = (event: MessageEvent) => {
      console.warn(`unexpected message on output port ${this.id}`);
    };
  }

  send(signalValue: T): void {
    const message: FromWorkerMessage = { kind: 'setSignal', signalId: this.id, signalValue };
    for (const port of this.ports) {
      port.postMessage(message);
    }
    if (this.defaultPostMessageFn) {
      this.defaultPostMessageFn(message);
    }
  }
}

// ----------------------------------------------------------------------------
export class SignalInput<Name extends string, T> {
  readyResolver!: (signal: SetableSignal<T>) => void;
  onceReady: Promise<SetableSignal<T>>;
  onNextInput: (input: T) => void;

  constructor(public space: SignalSpace, public id: Name) {
    this.onceReady = new Promise<SetableSignal<T>>((resolve) => {
      // TODO: consider allowing parent to send stuff before we ask for it..
      // this would just involved checking the inputResolvers here.
      this.readyResolver = resolve;
    });

    // First input creates the signal, resolves the promise, posts the first
    // conjestion control index, and then resets onNextInput for future cases to
    // just set the signal, and posts the next conjestion control index.
    this.onNextInput = (firstInput: T) => {
      const signal = this.space.setable(firstInput);
      this.readyResolver(signal);
      this.onNextInput = (nextInput: T) => {
        signal.set(nextInput);
      };
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
export class SignalInputStream<Name extends string, T> {
  // readyResolver!: (signal: SetableSignal<T>) => void;
  // cancelResolver!: () => void;
  // onceReady: Promise<SetableSignal<T>>;

  // The MessagePorts to report feedback to on how busy we are.
  ports: MessagePort[] = [];
  // The function that is to be called on every input.
  public onNextInput: (port: MessagePort | null, input: StreamValue<T>) => void;
  // The resulting iterator on inputs.
  public inputIter: AsyncIterOnEvents<T>;

  constructor(
    public space: SignalSpace,
    public id: Name,
    // Used to post conjestion control feedback.
    public defaultPostMessageFn: (m: ConjestionFeedbackMessage) => void
  ) {
    this.inputIter = new AsyncIterOnEvents<T>();

    // First input creates the signal, resolves the promise, posts the first
    // conjestion control index, and then resets onNextInput for future cases to
    // just set the signal, and posts the next conjestion control index.
    this.onNextInput = (port: MessagePort | null, firstInput: StreamValue<T>) => {
      // If stream was stopped.
      if (firstInput === null) {
        this.inputIter.done();
        return;
      }
      this.inputIter.nextEvent(firstInput.value);
      this.postConjestionFeedback(port, firstInput.idx);
    };
  }

  addPort(port: MessagePort) {
    this.ports.push(port);
    port.onmessage = (event: MessageEvent) => {
      const workerMessage: ToWorkerMessage = event.data;
      if (workerMessage.kind !== 'setStream') {
        throw new Error(`inputStream port got unexpected messageKind: ${workerMessage.kind}`);
      }
      this.onNextInput(port, workerMessage.value as StreamValue<T>);
    };
  }

  postConjestionFeedback(port: MessagePort | null, idx: number) {
    const message: ConjestionFeedbackMessage = {
      kind: ConjestionFeedbackMessageKind.ConjestionIndex,
      idx,
    };
    if (port) {
      port.postMessage(message);
    } else {
      this.defaultPostMessageFn(message);
    }
  }
}

// ----------------------------------------------------------------------------
export class SignalOutputStream<Name extends string, T> {
  portConjestion: Map<MessagePort, ConjestionState> = new Map();
  lastMessageIdx: number = 0;

  // sendFn: OutStreamSendFn<T>;

  // Think about having a default output postMessage?
  constructor(
    public space: SignalSpace,
    public id: Name,
    public config: {
      conjestionControl: ConjestionControlConfig;
      defaultPostMessageFn?: (m: StreamMessage) => void;
    }
  ) {
    if (this.config.defaultPostMessageFn) {
      // Add a fake messagePort to default poster if one was provided.
      this.addPort({ postMessage: this.config.defaultPostMessageFn } as MessagePort);
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
      const conjestionFeedback: ConjestionFeedbackMessage = event.data;
      messagePortConjestionState.lastReturnedId = conjestionFeedback.idx;
      messagePortConjestionState.queueLength--;
      if (
        messagePortConjestionState.queueLength <= this.config.conjestionControl.resumeAtQueueSize &&
        messagePortConjestionState.resumeResolver
      ) {
        messagePortConjestionState.resumeResolver();
      }
    };
  }

  // Note: there's a rather sensitive assumtion that once resumeResolver is
  // called, the very next tick, but be a thread that was stuck/awaiting on the
  // promise; otherwise in theory a new send call could get inserted, and we may
  // now send messages out of other. A rather sneaky race condition.
  //
  // TODO: verify the semantics, or rewrite the code to properly store
  // configuration of values to send and ports to send them on, so that order of
  // sends is always respected.
  async send(value: T): Promise<void> {
    this.lastMessageIdx++;
    for (const [port, state] of this.portConjestion.entries()) {
      if (state.done) {
        console.warn('Called send on a done stream.');
        break;
      }
      if (state.queueLength > this.config.conjestionControl.maxQueueSize) {
        let resumeResolver!: () => void;
        const onceResumed = new Promise<void>((resolve) => {
          resumeResolver = resolve as () => void;
        });
        state.resumeResolver = resumeResolver;
        await onceResumed;
        if (state.done) {
          break;
        }
      }
      const streamValue: StreamValue<T> = {
        idx: this.lastMessageIdx,
        value,
      };
      const message: StreamMessage = {
        kind: 'setStream',
        // The name of the signal stream having its next value set.
        streamId: this.id,
        // A unique incremental number indicating the sent-stream value.
        value: streamValue as StreamValue<unknown>,
      };
      state.queueLength++;
      port.postMessage(message);
    }
  }

  endPortStream(port: MessagePort, state: ConjestionState) {
    const streamValue: StreamValue<T> = null;
    port.postMessage(streamValue);
    state.done = true;
    if (state.resumeResolver) {
      state.resumeResolver();
    }
  }

  removePort(port: MessagePort, state: ConjestionState) {
    this.endPortStream(port, state);
    this.portConjestion.delete(port);
  }

  done() {
    for (const [port, state] of this.portConjestion.entries()) {
      this.endPortStream(port, state);
    }
    this.portConjestion = new Map();
  }
}
