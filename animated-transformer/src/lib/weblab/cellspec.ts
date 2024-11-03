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
 * This file provides some simple meta types to define a Cell's behvaiour in a
 * way that can be pulled into a webworker, or the environment that runs the
 * webworker. Both can then share the same types that specify the Cell's (aka
 * worker's) behaviour.
 *
 * Runs in webworker AND in main browser or node context.
 */

import { AbstractSignal, DerivedSignal, SetableSignal } from '../signalspace/signalspace';

type KindHolder<T> = (value: T) => void;
export const Kind: <T>(value: T) => void = () => {};

export type Metrics<Name extends string> = {
  batchId: number;
  values: { [name in Name]: number };
};

// TODO: replace with an object that has a kind field in the domain of the map,
// e.g. kind: 'input' | 'output' | 'inStream' | 'outStream', and has an optional
// channel object port, for where to send stuff.
// ```
// const channel = new MessageChannel();
// receivingWorker.postMessage({port: channel.port1}, [channel.port1]);
// sendingWorker.postMessage({port: channel.port2}, [channel.port2]);
// ```
export type ValueStruct = {
  [key: string]: any;
};

export type ValueKindFnStruct = {
  [key: string]: KindHolder<any>;
};

export type ValueKindFnStructFn<S extends ValueStruct> = {
  [Key in keyof S]: KindHolder<S[Key]>;
};

// A cell specification is a very simply class that connects types to names for
// the values that are the WebWorker cell's inputs and outputs.
//
// Using a class instead of a type allows correct type inference to
// happen for the inputs and outputs params.
export class CellSpec<Inputs extends ValueStruct, Outputs extends ValueStruct> {
  readonly inputNames: (keyof Inputs)[];
  readonly outputNames: (keyof Outputs)[];
  constructor(
    public data: {
      cellName: string;
      workerFn: () => Worker;
      inputs: ValueKindFnStructFn<Inputs>;
      outputs: ValueKindFnStructFn<Outputs>;
    }
  ) {
    this.inputNames = Object.keys(this.data.inputs);
    this.outputNames = Object.keys(this.data.outputs);
  }
}

export type PromiseStructFn<S extends ValueStruct> = { [Key in keyof S]: Promise<S[Key]> };
export type WritableStructFn<S extends ValueStruct> = { [Key in keyof S]: SetableSignal<S[Key]> };
export type ComputedStructFn<S extends ValueStruct> = { [Key in keyof S]: DerivedSignal<S[Key]> };
export type SignalStructFn<S extends ValueStruct> = { [Key in keyof S]: AbstractSignal<S[Key]> };
export type PromisedSignalsFn<S extends ValueStruct> = {
  [Key in keyof S]: Promise<SetableSignal<S[Key]>>;
};
export type CallValueFn<S extends ValueStruct> = { [Key in keyof S]: (value: S[Key]) => void };
