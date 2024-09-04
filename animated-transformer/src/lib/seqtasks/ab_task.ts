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
Simple generative task where input is a string of 'a's and 'b's, and output
should be whichever is most frequent in the input.

Intended to illustrate that a position-less transformer can still learn some
things.

This can also be used to study probability of outputs from transformers. e.g. by
making the output probabilistic based on ratio.

Another variant: have to output number of a's and b's to make the count equal.
*/

// import * as tf from '@tensorflow/tfjs';
// import { TokenEmb } from '../tokens/token_emb';
import { RandomState, RandomStream, makeRandomStream } from '../state-iter/random';
import { StateIter } from '../state-iter/state-iter';
import { BasicLmTask, RandLmTaskConfig, Example, BasicRandLmTask } from './util';

export const baseVocab = ['a', 'b'];

export type AorBisMaxTaskConfig = RandLmTaskConfig & {
  kind: 'AorBisMaxTask';
};

export class AorBisMaxTask implements BasicRandLmTask {
  public baseVocab = ['a', 'b'];
  private exampleId = 0;
  public exampleIter: StateIter<RandomState, Example>;

  constructor(public config: AorBisMaxTaskConfig) {
    this.exampleIter = new StateIter(structuredClone(config.genStateConfig), (r) =>
      this.examplesGen(r)
    );
  }

  // Problem Descriptions:
  // * What's the pair of number's with the biggest difference, that you can swap
  // to improve the ordering of the list.
  // * Of all pairs that you can swap to improve the ascending ordering of the list,
  // what pair have the biggest difference?
  genRandExample(r: RandomState): Example {
    const rng = new RandomStream(r);
    const input = new Array<string>(this.config.maxInputLen);
    const output = new Array<string>(1);
    let aCount = 0;
    let bCount = 0;

    for (let i = 0; i < input.length; i++) {
      const thisChar = rng.randomEntryFromList(['a', 'b']);
      if (thisChar === 'a') {
        aCount++;
      } else {
        bCount++;
      }
      input[i] = thisChar;
    }

    if (aCount === bCount) {
      output[0] = rng.randomEntryFromList(['a', 'b']);
    } else if (aCount > bCount) {
      output[0] = 'a';
    } else {
      output[0] = 'b';
    }

    return { id: this.exampleId++, input, output };
  }

  *examplesGen(r: RandomState): Generator<Example, undefined, undefined> {
    while (true) {
      yield this.genRandExample(r);
    }
  }
}
