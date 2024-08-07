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

/*
Extremely simple generative task where input is a string of 'a's and 'b's,
and output should be 'a'.

Can we get the loss to 0?
*/

import { BasicLmTask, BasicRandSeededTaskConfig, Example } from './util';

import { RandomStream, makeRandomStream } from '../state-iter/random';
import { StateIter } from '../state-iter/state-iter';

export const baseVocab = ['a', 'b'];

export class OnlyATask implements BasicLmTask {
  public name = 'onlyATask';
  public baseVocab = baseVocab;
  private exampleId = 0;
  public exampleIter: StateIter<RandomStream, Example>;

  constructor(public config: BasicRandSeededTaskConfig) {
    this.exampleIter = new StateIter(makeRandomStream(config.seed), (rng) =>
      this.examplesGen(rng)
    );
  }

  // Problem Descriptions:
  // * Return 'a'
  genRandExample(rng: RandomStream): Example {
    const input = new Array<string>(this.config.maxInputLen);
    const output = new Array<string>(1);

    for (let i = 0; i < input.length; i++) {
      input[i] = rng.randomEntryFromList(['a', 'b']);
    }

    output[0] = 'a';

    return { id: this.exampleId++, input, output };
  }

  *examplesGen(rng: RandomStream): Generator<Example, undefined, undefined> {
    while (true) {
      yield this.genRandExample(rng);
    }
  }
}
