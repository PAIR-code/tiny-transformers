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

/// <reference lib="webworker" />

import {
  ConjestionFeedbackMessage,
  ConjestionFeedbackMessageKind,
  FromWorkerMessage,
  StreamValue,
  ToWorkerMessage,
} from './messages';
import { SetableSignal, SignalSpace } from '../signalspace/signalspace';
import {
  ValueStruct,
  CellSpec,
  WritableStructFn,
  PromisedSignalsFn,
  CallValueFn,
  SignalStructFn,
  AsyncCallValueFn,
} from './cellspec';
import { ExpandOnce } from '../ts-type-helpers';

// The value send over a streaming port.
export type InputConfig = {
  conjestionFeedback: boolean;
  // Consider if we want feedback every N to minimise communication flow costs.
};

export type ConjestionControlConfig = {
  // TODO: consider fancier conjestion control abstraction, e.g. function and
  // data on returned values.
  maxQueueSize: number;
  resumeAtQueueSize: number; // Expected to be smaller than maxQueueSize;
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
export class WorkerOutputStream<Name extends string, T> {
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

// ----------------------------------------------------------------------------
export class WorkerOutput<Name extends string, T> {
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
export class WorkerInputStream<Name extends string, T> {
  readyResolver!: (signal: SetableSignal<T>) => void;
  onceReady: Promise<SetableSignal<T>>;
  ports: MessagePort[] = [];
  onNextInput: (port: MessagePort | null, input: StreamValue<T>) => void;

  constructor(public space: SignalSpace, public id: Name, config: InputConfig) {
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
      if (config.conjestionFeedback) {
        this.postConjestionFeedback(port, firstInput.idx);
        this.onNextInput = (port: MessagePort | null, nextInput: StreamValue<T>) => {
          signal.set(nextInput!.value);
          this.postConjestionFeedback(port, nextInput!.idx);
        };
      } else {
        this.onNextInput = (port: MessagePort | null, nextInput: StreamValue<T>) => {
          signal.set(nextInput!.value);
        };
      }
    };
  }

  addPort(messagePort: MessagePort) {
    this.ports.push(messagePort);
    messagePort.onmessage = (event: MessageEvent) => {
      const workerMessage: ToWorkerMessage = event.data;
      if (workerMessage.kind !== 'setStream') {
        throw new Error(`inputStream port got unexpected messageKind: ${workerMessage.kind}`);
      }
      this.onNextInput(messagePort, workerMessage.value as StreamValue<T>);
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
      postMessage(message);
    }
  }
}

// ----------------------------------------------------------------------------
export class WorkerInput<Name extends string, T> {
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
export class StatefulCell<
  Inputs extends ValueStruct,
  InputStreams extends ValueStruct,
  Outputs extends ValueStruct,
  OutputStreams extends ValueStruct
> {
  inputPromises: PromisedSignalsFn<Inputs>;
  stillExpectedInputs: Set<keyof Inputs>;
  inputSoFar: Partial<WritableStructFn<Inputs>> = {};
  inputResolvers = {} as { [signalId: string]: (value: unknown) => void };
  onceFinishedResolver!: () => void;

  inputSet: Set<keyof Inputs>;
  outputSet: Set<keyof Outputs>;
  inputStreamSet: Set<keyof InputStreams>;
  outputStreamSet: Set<keyof OutputStreams>;

  inputs: Map<keyof Inputs, WorkerInput<keyof Inputs & string, Inputs[keyof Inputs]>> = new Map();
  inputStreams: Map<
    keyof InputStreams,
    WorkerInputStream<keyof InputStreams & string, InputStreams[keyof InputStreams]>
  > = new Map();

  outputStreams = {} as {
    [Key in keyof OutputStreams]: WorkerOutputStream<Key & string, OutputStreams[Key]>;
  };
  public streamOutput = {} as AsyncCallValueFn<OutputStreams>;

  outputs = {} as {
    [Key in keyof Outputs]: WorkerOutput<Key & string, Outputs[Key]>;
  };
  public output = {} as CallValueFn<Outputs>;

  public space = new SignalSpace();
  public onceAllInputs: Promise<SignalStructFn<Inputs>>;

  public finishRequested = false;
  public onceFinishRequested: Promise<void>;

  constructor(public spec: CellSpec<Inputs, InputStreams, Outputs, OutputStreams>) {
    type InputStreamKey = keyof InputStreams & string;
    type InputStreamValue = InputStreams[keyof InputStreams];
    type InputKey = keyof Inputs & string;
    type InputValue = Inputs[keyof Inputs];
    type OutputStreamKey = keyof OutputStreams & string;
    type OutputStreamValue = OutputStreams[keyof OutputStreams];
    type OutputKey = keyof Outputs & string;
    type OutputValue = Outputs[keyof Outputs];

    this.inputSet = new Set<InputKey>(Object.keys(this.spec.inputs));
    this.outputSet = new Set<OutputKey>(Object.keys(this.spec.outputs));
    this.inputStreamSet = new Set<InputStreamKey>(Object.keys(this.spec.inputStreams));
    this.outputStreamSet = new Set<OutputStreamKey>(Object.keys(this.spec.outputStreams));

    this.onceFinishRequested = new Promise<void>((resolve) => {
      this.onceFinishedResolver = resolve;
    });

    this.inputPromises = {} as PromisedSignalsFn<Inputs>;
    this.stillExpectedInputs = new Set(this.inputSet);

    let onceAllInputsResolver: (allInput: WritableStructFn<Inputs>) => void;
    this.onceAllInputs = new Promise<WritableStructFn<Inputs>>((resolve, reject) => {
      onceAllInputsResolver = resolve;
    });

    for (const inputName of this.inputSet) {
      const workerInput = new WorkerInput<InputKey, InputValue>(this.space, inputName as InputKey);
      this.inputs.set(inputName, workerInput);
      workerInput.onceReady.then(() => {
        this.stillExpectedInputs.delete(inputName);
        if (this.stillExpectedInputs.size === 0) {
          onceAllInputsResolver(this.inputSoFar as WritableStructFn<Inputs>);
        }
      });
    }

    for (const inputName of this.inputStreamSet) {
      const workerStreamInput = new WorkerInputStream<InputStreamKey, InputStreamValue>(
        this.space,
        inputName as InputStreamKey,
        { conjestionFeedback: true }
      );
      this.inputStreams.set(inputName, workerStreamInput);
    }

    for (const outputName of this.outputStreamSet) {
      const workerOutputStream = new WorkerOutputStream<OutputStreamKey, OutputStreamValue>(
        this.space,
        outputName as OutputStreamKey,
        { maxQueueSize: 20, resumeAtQueueSize: 10 }
      );
      this.outputStreams[outputName as OutputStreamKey] = workerOutputStream;
      this.streamOutput[outputName as OutputStreamKey] = (value: OutputStreamValue) =>
        workerOutputStream.send(value);
    }

    for (const outputName of this.outputSet) {
      const workerOutput = new WorkerOutput<OutputKey, OutputValue>(
        this.space,
        outputName as OutputKey
      );
      this.outputs[outputName as OutputKey] = workerOutput;
      this.output[outputName as OutputKey] = (value: OutputValue) => workerOutput.send(value);
    }

    addEventListener('message', (m) => this.onMessage(m));
  }

  onMessage(message: { data: ToWorkerMessage }) {
    const { data } = message;
    if (data.kind === 'finishRequest') {
      this.finishRequested = true;
      this.onceFinishedResolver();
    } else if (data.kind === 'pipeInputSignal') {
      const workerInputStream = this.inputStreams.get(data.signalId as keyof InputStreams);
      if (!workerInputStream) {
        throw new Error(`No input named ${data.signalId} to set pipeInputSignal.`);
      }
      workerInputStream.addPort(data.port);
    } else if (data.kind === 'pipeOutputSignal') {
      const outputStream = this.outputStreams[data.signalId];
      if (!outputStream) {
        throw new Error(`No outputStreams entry named ${data.signalId} to set pipeOutputSignal.`);
      }
      outputStream.addPort(data.port);
    } else if (data.kind === 'setSignal') {
      const workerInput = this.inputs.get(data.signalId as keyof Inputs);
      if (!workerInput) {
        throw new Error(`onMessage: setSignal(${data.signalId}): but there is no such input.`);
      }
      workerInput.onNextInput(data.signalValue as Inputs[keyof Inputs]);
    } else if (data.kind === 'setStream') {
      const workerInputStream = this.inputStreams.get(data.streamId as keyof InputStreams);
      if (!workerInputStream) {
        throw new Error(
          `onMessage: setStream(${data.streamId}): but there is no such inputStream.`
        );
      }
      workerInputStream.onNextInput(
        null,
        data.value as StreamValue<InputStreams[keyof InputStreams]>
      );
    } else {
      console.warn('unknown message from the main thread: ', data);
    }
  }

  // get all inputs, run the function on them, and then provide the outputs.
  // Basically an RPC.
  async runOnceHaveInputs(runFn: (input: ExpandOnce<WritableStructFn<Inputs>>) => Promise<void>) {
    const inputs = await this.onceAllInputs;
    await runFn(inputs as ExpandOnce<WritableStructFn<Inputs>>);
    this.finished();
  }

  async run(runFn: () => Promise<void>) {
    await runFn();
    this.finished();
  }

  finished() {
    const message: FromWorkerMessage = { kind: 'finished' };
    postMessage(message);
    close();
  }
}

// ============================================================================

// Note: this cannot be done async in a timeout, because if it happens within a
// minimise call of an optimise, the metrics values may have already been
// disposed. Also we can't use Promise.all because that would make this async,
// and tf.minimise requires a sync function.
// export function prepareMetrics<Names extends string>(
//   batchId: number,
//   tfScalarMetrics: { [name in Names]: tf.Scalar }
// ): Metrics<Names> {
//   const nextMetrics = { batchId, values: {} } as Metrics<Names>;
//   // const tfMetrics = Object.entries<tf.Scalar>(tfScalarMetrics);
//   // const metricValues = Promise.all(tfMetrics.map(([metricName, scalar]) => scalar.array()));
//   for (const [metricName, scalar] of Object.entries<tf.Scalar>(tfScalarMetrics)) {
//     nextMetrics.values[metricName as Names] = scalar.arraySync();
//   }
//   return nextMetrics;
// }

// type PromisedMetrics<Name extends string> = {
//   batchId: number;
//   values: { [metricName in Name]: Promise<number> };
// };

// export function makeMetricReporter<Name extends string>(
//   // space: SignalSpace,
//   // metrics: SetableSignal<Metrics<Name>>
// ): {
//   reportMetrics: (batchId: number, tfScalarMetrics: { [names in Name]: tf.Scalar }) => void;
// } {
//   // const promisedMetrics = space.setable({ batchId: -1, values: {} } as PromisedMetrics<Name>);

//   // Notes:
//   // - We keep all tfjs values local, so there is no memory leakage.
//   // - We avoid sync calls that slow down CPU/GPU communication.
//   // - Return a promise once the metric has been reported.
//   function reportMetrics(
//     batchId: number,
//     tfScalarMetrics: { [names in Name]: tf.Scalar }
//   ): Promise<Metrics<Name>> {
//     return new Promise<Metrics<Name>>((resolve, _) => {
//       setTimeout(async () => {
//         const nextMetrics = { batchId, values: {} } as Metrics<Name>;
//         for (const [metricName, scalar] of Object.entries<tf.Scalar>(tfScalarMetrics)) {
//           nextMetrics.values[metricName as Name] = await scalar.array();
//         }
//         // metrics.set(nextMetrics);
//         resolve(nextMetrics);
//       });
//     });
//     // const promised = { batchId, values: {} } as PromisedMetrics<Name>;
//     // for (const [metricName, scalar] of Object.entries<tf.Scalar>(tfScalarMetrics)) {
//     //   promised.values[metricName as Name] = scalar.array();
//     // }
//     // promisedMetrics.set(promised);
//   }

//   // // const lastMetrics = space.writable({ batchId: -1, values: {} } as Metrics<Name>);
//   // space.derived(async () => {
//   //   const promised = promisedMetrics();
//   //   const metric = { batchId: promised.batchId, values: {} } as Metrics<Name>;
//   //   console.log('promised', promised);
//   //   for (const [metricName, promise] of Object.entries<Promise<number>>(promised.values)) {
//   //     metric.values[metricName as Name] = await promise;
//   //   }
//   //   metrics.set(metric);
//   // });

//   return { reportMetrics };
// }
