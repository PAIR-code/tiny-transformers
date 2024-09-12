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

import { WritableSignal } from './signalspace';

export type Metrics<Name extends string> = {
  batchId: number;
  values: { [name in Name]: number };
};

export type ValueStruct = {
  [key: string]: any;
};

// export type SignalStruct = {
//   [key: string]: WritableSignal<any>;
// };

export type SpecificValueStruct<Names extends string> = {
  [key in Names]: any;
};

export type PromiseStructFn<S extends ValueStruct> = { [Key in keyof S]: Promise<S[Key]> };
export type SignalsStructFn<S extends ValueStruct> = { [Key in keyof S]: WritableSignal<S[Key]> };
export type PromisedSignalsFn<S extends ValueStruct> = {
  [Key in keyof S]: Promise<WritableSignal<S[Key]>>;
};

// A cell specification is a very simply class that connects types to names for
// the values that are the WebWorker cell inputs and outputs.
//
// Using a class instead of a type allows correct type inference to
// happen for the inputs and outputs params; Maybe a constructor
// function for a type instance would work as well?

// export class CellFuncSpec<Inputs extends ValueStruct, Outputs extends ValueStruct> {
//   constructor(
//     public name: string,
//     public createWorker: () => Worker,
//     public inputs: (keyof Inputs)[],
//     public outputs: (keyof Outputs)[]
//   ) {}
// }

export class CellStateSpec<
  Globals extends ValueStruct,
  Uses extends keyof Globals,
  Updates extends keyof Globals
> {
  constructor(
    public name: string,
    public createWorker: () => Worker,
    public uses: Uses[],
    public updates: Updates[]
  ) {}
}

export function cellFactory<
  Globals extends ValueStruct,
  Uses extends keyof Globals,
  Updates extends keyof Globals
>(
  globals: Partial<Globals>,
  cellName: string,
  worker: () => Worker,
  uses: Uses[],
  updates: Updates[]
) {
  return new CellStateSpec<Globals, Uses, Updates>(cellName, worker, uses, updates);
}

// export type OpInputs<Op> = Op extends CellFuncSpec<infer I, any> ? I : never;
// export type OpOutputs<Op> = Op extends CellFuncSpec<any, infer O> ? O : never;
