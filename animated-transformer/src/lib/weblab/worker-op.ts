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

// export type WorkerOp<Inputs, Outputs> = {
//   workerPath: string;
//   inputs: Inputs[];
//   outputs: Outputs[];
// };

// Using a class instead of a type allows correct type inference to
// happen for the inputs and outputs params; Maybe a constructor
// function for a type instance would work as well?
export class WorkerOp<Inputs extends string, Outputs extends string> {
  constructor(
    public workerPath: string,
    public api: {
      inputs: Inputs[];
      outputs: Outputs[];
    }
  ) {}
}

export type OpInputs<Op> = Op extends WorkerOp<infer I, any> ? I : never;
export type OpOutputs<Op> = Op extends WorkerOp<any, infer O> ? O : never;

// type ExampleInput = OpInputs<typeof exampleWorkerOp>;

// type ExampleInput2 = typeof exampleWorkerOp extends WorkerOp<infer I, any>
//   ? I
//   : never;

// type ObjMap<G> = {
//   [name in keyof G]: G[keyof G];
// };

// type ObjFileMap = { [name: string]: FileSystemFileHandle };

// type Foo<G extends { [key: string]: any }> = keyof ObjMap<G>;

// type Test = keyof { [key: string]: any };

// type Foo = keyof Globals;
// type Value = Globals[Foo];
// type Bar = { [key in Foo]: Globals[Foo]  }
