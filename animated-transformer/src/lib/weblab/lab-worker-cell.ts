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

import { FromWorkerMessage, StreamValue, ToWorkerMessage } from './messages';
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
import {
  SignalInput,
  SignalInputStream,
  SignalOutput,
  SignalOutputStream,
} from './signal-messages';

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

  inputs = {} as {
    [Key in keyof Inputs]: SignalInput<Key & string, Inputs[Key]>;
  };
  inputStreams = {} as {
    [Key in keyof InputStreams]: SignalInputStream<Key & string, InputStreams[Key]>;
  };

  outputs = {} as {
    [Key in keyof Outputs]: SignalOutput<Key & string, Outputs[Key]>;
  };
  outputStreams = {} as {
    [Key in keyof OutputStreams]: SignalOutputStream<Key & string, OutputStreams[Key]>;
  };

  public streamOutput = {} as AsyncCallValueFn<OutputStreams>;
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
      const workerInput = new SignalInput<InputKey, InputValue>(this.space, inputName as InputKey);
      this.inputs[inputName] = workerInput;
      workerInput.onceReady.then(() => {
        this.stillExpectedInputs.delete(inputName);
        if (this.stillExpectedInputs.size === 0) {
          onceAllInputsResolver(this.inputSoFar as WritableStructFn<Inputs>);
        }
      });
    }

    for (const inputName of this.inputStreamSet) {
      const workerStreamInput = new SignalInputStream<InputStreamKey, InputStreamValue>(
        this.space,
        inputName as InputStreamKey,
        postMessage
      );
      this.inputStreams[inputName] = workerStreamInput;
    }

    for (const outputName of this.outputStreamSet) {
      const workerOutputStream = new SignalOutputStream<OutputStreamKey, OutputStreamValue>(
        this.space,
        outputName as OutputStreamKey,
        { maxQueueSize: 20, resumeAtQueueSize: 10 }
      );
      this.outputStreams[outputName as OutputStreamKey] = workerOutputStream;
      this.streamOutput[outputName as OutputStreamKey] = (value: OutputStreamValue) =>
        workerOutputStream.send(value);
    }

    for (const outputName of this.outputSet) {
      const workerOutput = new SignalOutput<OutputKey, OutputValue>(
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
      const inputStream = this.inputStreams[data.signalId];
      if (!inputStream) {
        throw new Error(`No input named ${data.signalId} to set pipeInputSignal.`);
      }
      data.ports.forEach((port) => inputStream.addPort(port));
    } else if (data.kind === 'pipeOutputSignal') {
      const outputStream = this.outputStreams[data.signalId];
      if (!outputStream) {
        throw new Error(`No outputStreams entry named ${data.signalId} to set pipeOutputSignal.`);
      }
      data.ports.forEach((port) => outputStream.addPort(port));
    } else if (data.kind === 'setSignal') {
      const input = this.inputs[data.signalId];
      if (!input) {
        throw new Error(`onMessage: setSignal(${data.signalId}): but there is no such input.`);
      }
      input.onNextInput(data.signalValue as Inputs[keyof Inputs]);
    } else if (data.kind === 'setStream') {
      const inputStream = this.inputStreams[data.streamId];
      if (!inputStream) {
        throw new Error(
          `onMessage: setStream(${data.streamId}): but there is no such inputStream.`
        );
      }
      inputStream.onNextInput(
        null,
        data.value as StreamValue<InputStreams[keyof InputStreams & string]>
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
