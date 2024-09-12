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

import { RandLmTaskConfig, Example, BasicRandLmTask } from './util';

import { RandomState, RandomStream } from '../random/random';
import { StateIter } from '../state-iter/state-iter';

export const baseVocab = ['a', 'b'];

export type OnlyATaskConfig = RandLmTaskConfig & {
  kind: 'OnlyATask';
};

export class OnlyATask implements BasicRandLmTask {
  public name = 'onlyATask';
  public baseVocab = baseVocab;
  private exampleId = 0;
  public exampleIter: StateIter<RandomState, Example>;

  constructor(public config: OnlyATaskConfig) {
    this.exampleIter = new StateIter(structuredClone(this.config.genStateConfig), (r) =>
      this.examplesGen(r)
    );
  }

  // Problem Descriptions:
  // * Return 'a'
  genRandExample(r: RandomState): Example {
    const rng = new RandomStream(r);
    const input = new Array<string>(this.config.maxInputLen);
    const output = new Array<string>(1);

    for (let i = 0; i < input.length; i++) {
      input[i] = rng.randomEntryFromList(['a', 'b']);
    }

    output[0] = 'a';

    return { id: this.exampleId++, input, output };
  }

  *examplesGen(r: RandomState): Generator<Example, undefined, undefined> {
    while (true) {
      yield this.genRandExample(r);
    }
  }
}
