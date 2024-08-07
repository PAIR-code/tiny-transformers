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

import { SerializedGTensor } from 'src/lib/gtensor/gtensor';
import * as json5 from 'json5';

// export type WorkerOp<Inputs, Outputs> = {
//   workerPath: string;
//   inputs: Inputs[];
//   outputs: Outputs[];
// };

// Using a class allows correct type inference to happen for the inputs and outputs params;
export class WorkerOp<Inputs extends string, Outputs extends string> {
  constructor(
    public workerPath: string,
    public api: {
      inputs: Inputs[];
      outputs: Outputs[];
    }
  ) {}

  onceGetInputs() {}
}

// type ObjMap<G> = {
//   [name in keyof G]: G[keyof G];
// };

// type ObjFileMap = { [name: string]: FileSystemFileHandle };

// type Foo<G extends { [key: string]: any }> = keyof ObjMap<G>;

// type Test = keyof { [key: string]: any };

// type Foo = keyof Globals;
// type Value = Globals[Foo];
// type Bar = { [key in Foo]: Globals[Foo]  }
