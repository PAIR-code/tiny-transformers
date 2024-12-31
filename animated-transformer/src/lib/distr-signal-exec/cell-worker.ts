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

import { LabMessage, LabMessageKind } from './lab-message-types';
import { SignalSpace } from '../signalspace/signalspace';
import {
  ValueStruct,
  CellKind,
  SetableSignalStructFn,
  PromisedSetableSignalsFn,
  CallValueFn,
  AbstractSignalStructFn,
} from './cell-kind';
import { ExpandOnce } from '../ts-type-helpers';
import { SignalReceiveEnd, StreamReceiveEnd, SignalSendEnd, StreamSendEnd } from './channel-ends';

// ----------------------------------------------------------------------------
export class CellWorker<
  Inputs extends ValueStruct,
  InputStreams extends ValueStruct,
  Outputs extends ValueStruct,
  OutputStreams extends ValueStruct,
> {
  // Mostly for logging/debugging purposes. Initially from the cell kind, then
  // but can be updated by creator, or by getting a start message.
  public id: string;

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
  public onceAllInputs!: Promise<AbstractSignalStructFn<Inputs>>;

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
    public defaultPostMessageFn: (value: LabMessage, ports?: MessagePort[]) => void,
  ) {
    this.id = `[kind:${JSON.stringify(this.kind.data.cellKindId)}]`;
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
  }

  onMessage(message: { data: LabMessage }) {
    const { data } = message;
    if (!data) {
      console.warn('unexpected null data', message);
      return;
    }
    switch (data.kind) {
      case LabMessageKind.StartCellRun: {
        this.id = data.id; //`${data.id}.${this.id}`;
        this.initInputsAndOutputs();
        this.onceStartedResolver();
        break;
      }
      case LabMessageKind.FinishRequest: {
        this.finishRequested = true;
        this.onceFinishedResolver();
        break;
      }
      case LabMessageKind.AddInputRemote: {
        const inputSignal = this.inputs[data.recipientSignalId];
        if (!inputSignal) {
          throw new Error(`${this.id}: No input to pipe named: ${data.recipientSignalId}.`);
        }
        inputSignal.addRemote(data.remoteSignal);
        break;
      }
      case LabMessageKind.AddOutputRemote: {
        const outputSignal = this.outputs[data.recipientSignalId];
        if (!outputSignal) {
          throw new Error(`${this.id}: No output to pipe entry named: ${data.recipientSignalId}.`);
        }
        outputSignal.addRemote(data.remoteSignal);
        break;
      }
      case LabMessageKind.AddInStreamRemote: {
        const inputStream = this.inStream[data.recipientStreamId];
        if (!inputStream) {
          throw new Error(`${this.id}: No input stream to pipe named ${data.recipientStreamId}.`);
        }
        inputStream.addRemote(data.remoteStream);
        break;
      }
      case LabMessageKind.AddOutStreamRemote: {
        const outputStream = this.outStream[data.recipientStreamId];
        if (!outputStream) {
          throw new Error(`${this.id}: No output streams to pipe named ${data.recipientStreamId}.`);
        }
        outputStream.addRemote(data.remoteStream);
        break;
      }
      default: {
        console.warn(`${this.id}: unknown message from the main thread: `, data);
        break;
      }
    }
  }

  initInputsAndOutputs() {
    type InputStreamKey = keyof InputStreams & string;
    type InputStreamValue = InputStreams[keyof InputStreams];
    type InputKey = keyof Inputs & string;
    type InputValue = Inputs[keyof Inputs];
    type OutputStreamKey = keyof OutputStreams & string;
    type OutputStreamValue = OutputStreams[keyof OutputStreams];
    type OutputKey = keyof Outputs;
    type OutputValue = Outputs[keyof Outputs];

    let onceAllInputsResolver: (allInput: SetableSignalStructFn<Inputs>) => void;
    this.onceAllInputs = new Promise<SetableSignalStructFn<Inputs>>((resolve, reject) => {
      onceAllInputsResolver = resolve;
    });

    for (const inputName of this.inputSet) {
      const signalRecEnd = new SignalReceiveEnd<InputValue>(
        this.id,
        this.space,
        inputName as InputKey,
      );

      this.inputs[inputName] = signalRecEnd;
      signalRecEnd.onceReady.then((signal) => {
        this.inputSoFar[inputName] = signal;
        this.stillExpectedInputs.delete(inputName);
        if (this.stillExpectedInputs.size === 0) {
          onceAllInputsResolver(this.inputSoFar as SetableSignalStructFn<Inputs>);
        }
      });
    }

    for (const inputName of this.inputStreamSet) {
      const streamRecEnd = new StreamReceiveEnd<InputStreamValue>(
        this.id,
        this.space,
        inputName as InputStreamKey,
      );
      this.inStream[inputName] = streamRecEnd;
    }

    for (const outputName of this.outputSet) {
      const signalSendEnd = new SignalSendEnd<OutputValue>(
        this.id,
        this.space,
        outputName as string,
      );
      this.outputs[outputName as OutputKey] = signalSendEnd;
      this.output[outputName as OutputKey] = (value: OutputValue) => signalSendEnd.set(value);
    }

    for (const outputName of this.outputStreamSet) {
      const streamSendEnd = new StreamSendEnd<OutputStreamValue>(
        this.id,
        this.space,
        outputName as OutputStreamKey,
      );

      this.outStream[outputName] = streamSendEnd;
    }
  }

  // get all inputs, run the function on them, and then provide the outputs.
  // Basically an RPC.
  async start(runFn: (input: ExpandOnce<SetableSignalStructFn<Inputs>>) => Promise<void>) {
    await this.onceStarted;
    const inputs = await this.onceAllInputs;
    this.defaultPostMessageFn({ kind: LabMessageKind.ReceivedAllInputsAndStarting });
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
