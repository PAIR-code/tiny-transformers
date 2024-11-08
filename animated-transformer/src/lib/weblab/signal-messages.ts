// // The value send over a streaming port.
// export type InputConfig = {
//   conjestionFeedback: boolean;
//   // Consider if we want feedback every N to minimise communication flow costs.
// };

import { SetableSignal, SignalSpace } from '../signalspace/signalspace';
import {
  ConjestionFeedbackMessage,
  ConjestionFeedbackMessageKind,
  FromWorkerMessage,
  StreamValue,
  ToWorkerMessage,
} from './messages';

// ----------------------------------------------------------------------------
// Consider: we could take in a signal, and have a derived send functionality
export class SignalOutput<Name extends string, T> {
  ports: MessagePort[] = [];

  constructor(public space: SignalSpace, public id: Name) {}

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
  }
}

// ----------------------------------------------------------------------------
export class SignalInput<Name extends string, T> {
  readyResolver!: (signal: SetableSignal<T>) => void;
  onceReady: Promise<SetableSignal<T>>;
  onNextInput: (input: StreamValue<T>) => void;

  constructor(public space: SignalSpace, public id: Name) {
    this.onceReady = new Promise<SetableSignal<T>>((resolve, reject) => {
      // TODO: consider allowing parent to send stuff before we ask for it..
      // this would just involved checking the inputResolvers here.
      this.readyResolver = (_firstInput: SetableSignal<T>) => resolve;
    });

    // First input creates the signal, resolves the promise, posts the first
    // conjestion control index, and then resets onNextInput for future cases to
    // just set the signal, and posts the next conjestion control index.
    this.onNextInput = (firstInput: StreamValue<T>) => {
      const signal = this.space.setable(firstInput.value);
      this.readyResolver(signal);
      this.onNextInput = (nextInput: StreamValue<T>) => {
        signal.set(nextInput.value);
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
  // When paused, this allows triggering of resuming.
  resumeResolver: () => void;
  resumeCancel: () => void;
  onceResume: Promise<void>;
};

// ----------------------------------------------------------------------------
export class SignalInputStream<Name extends string, T> {
  readyResolver!: (signal: SetableSignal<T>) => void;
  onceReady: Promise<SetableSignal<T>>;
  ports: MessagePort[] = [];
  onNextInput: (port: MessagePort | null, input: StreamValue<T>) => void;

  constructor(
    public space: SignalSpace,
    public id: Name,
    public defaultPostMessageFn: (m: ConjestionFeedbackMessage) => void
  ) {
    this.onceReady = new Promise<SetableSignal<T>>((resolve, reject) => {
      // TODO: consider allowing parent to send stuff before we ask for it..
      // this would just involved checking the inputResolvers here.
      this.readyResolver = (_firstInput: SetableSignal<T>) => resolve;
    });

    // First input creates the signal, resolves the promise, posts the first
    // conjestion control index, and then resets onNextInput for future cases to
    // just set the signal, and posts the next conjestion control index.
    this.onNextInput = (port: MessagePort | null, firstInput: StreamValue<T>) => {
      const signal = this.space.setable(firstInput.value);
      this.readyResolver(signal);
      this.postConjestionFeedback(port, firstInput.idx);
      this.onNextInput = (port: MessagePort | null, nextInput: StreamValue<T>) => {
        signal.set(nextInput!.value);
        this.postConjestionFeedback(port, nextInput!.idx);
      };
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

  constructor(public space: SignalSpace, public id: Name, public config: ConjestionControlConfig) {}

  addPort(messagePort: MessagePort) {
    let resumeResolver!: () => void;
    let resumeCancel!: () => void;
    const onceResume = new Promise<void>((resolve, cancel) => {
      resumeResolver = resolve as () => void;
      resumeCancel = cancel;
    });
    const messagePortConjestionState: ConjestionState = {
      lastReturnedId: 0,
      queueLength: 0,
      resumeCancel,
      resumeResolver,
      onceResume,
    };
    this.portConjestion.set(messagePort, messagePortConjestionState);
    messagePort.onmessage = (event: MessageEvent) => {
      const conjestionFeedback: ConjestionFeedbackMessage = event.data;
      messagePortConjestionState.lastReturnedId = conjestionFeedback.idx;
      messagePortConjestionState.queueLength--;
      if (messagePortConjestionState.queueLength <= this.config.resumeAtQueueSize) {
        messagePortConjestionState.resumeResolver();
      }
    };
  }

  // Stop all waiting promising for resumption.
  cancel(): void {
    for (const conjestionState of this.portConjestion.values()) {
      conjestionState.resumeCancel();
    }
  }

  async send(value: T): Promise<void> {
    this.lastMessageIdx++;
    for (const [port, conjestionState] of this.portConjestion.entries()) {
      if (conjestionState.queueLength > this.config.maxQueueSize) {
        await conjestionState.onceResume;
      }
      const streamValue: StreamValue<T> = {
        idx: this.lastMessageIdx,
        value,
      };
      conjestionState.queueLength++;
      port.postMessage(streamValue);
    }
  }
}
