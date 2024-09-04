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
Problem Descriptions:

* What's the pair of number's with the biggest difference, that you can swap
to improve the ordering of the list.

* Of all pairs that you can swap to improve the ascending ordering of the list,
what pair have the biggest difference?

*/

import * as tf from '@tensorflow/tfjs';
import { BasicLmTask, RandLmTaskConfig, BasicRandLmTask, Example } from './util';
import { StateIter } from '../state-iter/state-iter';
import { RandomState, RandomStream, makeRandomStream } from '../state-iter/random';

export type SwapTaskConfig = RandLmTaskConfig & {
  kind: 'SwapTask';
  valuesLessThan: number;
};

export type Action = 'l' | 'r' | 'i';
// l = left swap.
// r = right swap.
// i = ignore.
export const actionsVocab = ['l', 'r', 'i'] as Action[];
export const inputVocab = ['1', '2', '3', '4', '5'];
export const baseVocab = [...actionsVocab, ...inputVocab];

export interface Swapable {
  idx1: number;
  value1: number;
  idx2: number;
  value: number;
  delta: number;
}

export function swappables(values: number[]): Swapable[] {
  const s: Swapable[] = [];
  values.forEach((x, i) => {
    values.forEach((x2, i2) => {
      if (!isNaN(x) && !isNaN(x2) && x2 < x && i2 > i) {
        s.push({
          idx1: i,
          value1: x,
          idx2: i2,
          value: x2,
          delta: x - x2,
        });
      }
    });
  });
  return s.sort((s1, s2) => s2.delta - s1.delta);
}

// Invaraint: returned list has same size as input.
export function makeOutput(input: number[]): Action[] {
  const swaps = swappables(input);
  const output: Action[] = input.map((_) => 'i');
  if (swaps.length > 0) {
    output[swaps[0].idx1] = 'l';
    output[swaps[0].idx2] = 'r';
  }
  return output;
}

export class SwapTask implements BasicRandLmTask {
  // TODO: consider doing programatically in the constructor?
  public name: string;
  private exampleId: number;
  public exampleIter: StateIter<RandomState, Example>;

  public baseVocab = baseVocab;
  // ! because initialied in reInitFromConfig.

  constructor(public config: SwapTaskConfig) {
    this.name = this.config.name;
    this.exampleId = 0;
    this.exampleIter = new StateIter(structuredClone(this.config.genStateConfig), (r) =>
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
    const input = tf
      .randomUniform(
        [this.config.maxInputLen],
        0,
        this.config.valuesLessThan,
        'int32',
        rng.random()
      )
      .arraySync() as number[];
    for (let i = 0; i < input.length; i++) {
      input[i] = Math.floor(rng.random() * this.config.valuesLessThan);
    }
    return {
      id: this.exampleId++,
      input: input.map((x) => String(x)),
      output: makeOutput(input),
    };
  }

  *examplesGen(r: RandomState): Generator<Example, undefined, undefined> {
    while (true) {
      yield this.genRandExample(r);
    }
  }
}
