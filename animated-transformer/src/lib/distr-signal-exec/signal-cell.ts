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

import { LabMessage, LabMessageKind, StreamValue } from './lab-message-types';
import { SignalSpace } from '../signalspace/signalspace';
import {
  ValueStruct,
  CellKind,
  SetableSignalStructFn,
  PromisedSetableSignalsFn,
  CallValueFn,
  AbstractSignalStructFn,
} from './cell-types';
import { ExpandOnce } from '../ts-type-helpers';
import {
  SignalReceiveEnd,
  StreamReceiveEnd,
  SignalSendEnd,
  StreamSendEnd,
} from './signal-messages';

// ----------------------------------------------------------------------------
export class SignalCell<
  Inputs extends ValueStruct,
  InputStreams extends ValueStruct,
  Outputs extends ValueStruct,
  OutputStreams extends ValueStruct,
> {
  // Mostly for logging/debugging purposes.
  id: string;

  // Initialised by environment sending us the id.
  sentId?: string;

  // Promises of SetableSignal for each input. Promise is resolved when first
  // input is received.
  inputPromises: PromisedSetableSignalsFn<Inputs>;
  // Resolver functions for the inputPromises
  inputResolvers = {} as { [signalId: string]: (value: unknown) => void };
  // Set of inputs IDs still expected.
  stillExpectedInputs: Set<keyof Inputs>;
  // Inputs gotten so far.
  inputSoFar: Partial<SetableSignalStructFn<Inputs>> = {};

  // Set of IDs for various things.
  inputSet: Set<keyof Inputs>;
  outputSet: Set<keyof Outputs>;
  inputStreamSet: Set<keyof InputStreams>;
  outputStreamSet: Set<keyof OutputStreams>;

  // The RecieveEnd for the cell's inputs.
  inputs = {} as {
    [Key in keyof Inputs]: SignalReceiveEnd<Inputs[Key]>;
  };
  // A promise that resolves when all inputs are given.
  public onceAllInputs: Promise<AbstractSignalStructFn<Inputs>>;

  // The receive end of input streams.
  public inStream = {} as {
    [Key in keyof InputStreams]: StreamReceiveEnd<InputStreams[Key]>;
  };

  // The send end for the outputs.
  outputs = {} as {
    [Key in keyof Outputs]: SignalSendEnd<Outputs[Key]>;
  };
  public outStream = {} as {
    [Key in keyof OutputStreams]: StreamSendEnd<OutputStreams[Key]>;
  };

  // convenience function for outputting tuff.
  public output = {} as CallValueFn<Outputs>;

  public space = new SignalSpace();

  public finishRequested = false;
  onceFinishedResolver!: () => void;
  public onceFinishRequested: Promise<void>;
  onceStartedResolver!: () => void;
  public onceStarted: Promise<void>;

  constructor(
    public kind: CellKind<Inputs, InputStreams, Outputs, OutputStreams>,
    public defaultPostMessageFn: (value: LabMessage) => void,
  ) {
    this.id = `[kind:${this.kind.data.cellKindId}]`;
    type InputStreamKey = keyof InputStreams & string;
    type InputStreamValue = InputStreams[keyof InputStreams];
    type InputKey = keyof Inputs & string;
    type InputValue = Inputs[keyof Inputs];
    type OutputStreamKey = keyof OutputStreams & string;
    type OutputStreamValue = OutputStreams[keyof OutputStreams];
    type OutputKey = keyof Outputs;
    type OutputValue = Outputs[keyof Outputs];

    this.inputSet = new Set<InputKey>(Object.keys(this.kind.inputs));
    this.outputSet = new Set<OutputKey>(Object.keys(this.kind.outputs));
    this.inputStreamSet = new Set<InputStreamKey>(Object.keys(this.kind.inStreams));
    this.outputStreamSet = new Set<OutputStreamKey>(Object.keys(this.kind.outStreams));

    this.onceFinishRequested = new Promise<void>((resolve) => {
      this.onceFinishedResolver = resolve;
    });

    this.onceStarted = new Promise<void>((resolve) => {
      this.onceStartedResolver = resolve;
    });

    this.inputPromises = {} as PromisedSetableSignalsFn<Inputs>;
    this.stillExpectedInputs = new Set(this.inputSet);

    let onceAllInputsResolver: (allInput: SetableSignalStructFn<Inputs>) => void;
    this.onceAllInputs = new Promise<SetableSignalStructFn<Inputs>>((resolve, reject) => {
      onceAllInputsResolver = resolve;
    });

    for (const inputName of this.inputSet) {
      const workerInput = new SignalReceiveEnd<InputValue>(
        this.space,
        inputName as InputKey,
        defaultPostMessageFn,
      );
      this.inputs[inputName] = workerInput;
      workerInput.onceReady.then((signal) => {
        this.inputSoFar[inputName] = signal;
        this.stillExpectedInputs.delete(inputName);
        if (this.stillExpectedInputs.size === 0) {
          onceAllInputsResolver(this.inputSoFar as SetableSignalStructFn<Inputs>);
        }
      });
    }

    for (const inputName of this.inputStreamSet) {
      const workerStreamInput = new StreamReceiveEnd<InputStreamValue>(
        this.space,
        inputName as InputStreamKey,
        defaultPostMessageFn,
      );
      this.inStream[inputName] = workerStreamInput;
    }

    for (const outputName of this.outputStreamSet) {
      const workerOutputStream = new StreamSendEnd<OutputStreamValue>(
        this.space,
        outputName as OutputStreamKey,
        defaultPostMessageFn,
        { conjestionControl: { maxQueueSize: 20, resumeAtQueueSize: 10 } },
      );
      this.outStream[outputName] = workerOutputStream;
    }

    for (const outputName of this.outputSet) {
      const workerOutput = new SignalSendEnd<OutputValue>(
        this.space,
        outputName as string,
        defaultPostMessageFn,
      );
      this.outputs[outputName as OutputKey] = workerOutput;
      this.output[outputName as OutputKey] = (value: OutputValue) => workerOutput.set(value);
    }
  }

  onMessage(message: { data: LabMessage }) {
    const { data } = message;
    if (!data) {
      console.warn('unexpected null data', message);
      return;
    }
    // console.log('* Worker: got message: ', JSON.stringify(message));
    switch (data.kind) {
      case LabMessageKind.InitIdMessage: {
        this.id = data.id; //`${data.id}.${this.id}`;
        break;
      }
      case LabMessageKind.StartCellRun: {
        console.log('onceStartedResolver');
        this.onceStartedResolver();
        break;
      }
      case LabMessageKind.FinishRequest: {
        this.finishRequested = true;
        this.onceFinishedResolver();
        break;
      }
      case LabMessageKind.PipeInputSignal: {
        const inputSignal = this.inputs[data.signalId];
        if (!inputSignal) {
          throw new Error(`${this.id}: No input to pipe named: ${data.signalId}.`);
        }
        data.ports.forEach((port) => inputSignal.addPort(port));
        break;
      }
      case LabMessageKind.PipeOutputSignal: {
        console.log(
          `* Worker (${this.id}): LabMessageKind.PipeOutputSignal: `,
          JSON.stringify(data),
        );
        const outputSignal = this.outputs[data.signalId];
        if (!outputSignal) {
          throw new Error(`${this.id}: No output to pipe entry named: ${data.signalId}.`);
        }
        // For each port into this
        data.ports.forEach((port) => {
          outputSignal.addPort(port);
        });
        break;
      }
      case LabMessageKind.PipeInputStream: {
        const inputStream = this.inStream[data.streamId];
        if (!inputStream) {
          throw new Error(`${this.id}: No input stream to pipe named ${data.streamId}.`);
        }
        data.ports.forEach((port) => inputStream.addPort(port));
        break;
      }
      case LabMessageKind.PipeOutputStream: {
        const outputStream = this.outStream[data.streamId];
        if (!outputStream) {
          throw new Error(`${this.id}: No output streams to pipe named ${data.streamId}.`);
        }
        data.ports.forEach((port) => outputStream.addPort(port));
        break;
      }
      case LabMessageKind.SetSignalValue: {
        const input = this.inputs[data.signalId];
        if (!input) {
          throw new Error(
            `${this.id}: onMessage: setSignal(${data.signalId}): but there is no such input.`,
          );
        }
        input.onSetInput(data.value as Inputs[keyof Inputs & string]);
        break;
      }
      case LabMessageKind.ConjestionControl: {
        const outStream = this.outStream[data.streamId];
        outStream.conjestionFeedbackStateUpdate(data);
        break;
      }
      case LabMessageKind.EndStream: {
        const inputStream = this.inStream[data.streamId];
        if (!inputStream) {
          throw new Error(`${this.id}: onMessage: EndStream(${data.streamId}): no such inStream.`);
        }
        inputStream.onDone();
        break;
      }
      case LabMessageKind.AddStreamValue: {
        const inputStream = this.inStream[data.streamId];
        if (!inputStream) {
          throw new Error(
            `${this.id}: onMessage: AddStreamValue(${data.streamId}): no such inStream.`,
          );
        }
        inputStream.onAddValue(
          null,
          data.value as StreamValue<InputStreams[keyof InputStreams & string]>,
        );
        break;
      }
      default: {
        console.warn(`${this.id}: unknown message from the main thread: `, data);
        break;
      }
    }
  }

  // get all inputs, run the function on them, and then provide the outputs.
  // Basically an RPC.
  async start(runFn: (input: ExpandOnce<SetableSignalStructFn<Inputs>>) => Promise<void>) {
    await this.onceStarted;
    this.defaultPostMessageFn({ kind: LabMessageKind.ReceivedAllInputsAndStarting });
    const inputs = await this.onceAllInputs;
    await runFn(inputs as ExpandOnce<SetableSignalStructFn<Inputs>>);
    this.close();
  }

  async run(runFn: () => Promise<void>) {
    await this.onceStarted;
    this.defaultPostMessageFn({ kind: LabMessageKind.ReceivedAllInputsAndStarting });
    await runFn();
    this.close();
  }

  close() {
    const message: LabMessage = { kind: LabMessageKind.Finished };
    this.defaultPostMessageFn(message);
    close();
  }
}
