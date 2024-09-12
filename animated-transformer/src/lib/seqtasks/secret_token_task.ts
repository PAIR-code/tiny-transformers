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

/* The Family of Secret Token Tasks.

A next-token prediction task. This file defines the distribtion of sequences.

A "Secret Token" task is defined by a given two argument function, f(s,t), where
s and t are tokens, and the result is a boolean value. e.g. f(s,t) = s > t.

The vocab always consists of at least the tokens T (for True) and F (for False).

A secret (hidden) token, s, is chosen at the start of every sequence. Every
sequence then consists of a series of pairs of tokens: the first of every pair
is a unformly random chosen token, t, from a subset of the vocab, and the
following token is f(s,t).

Examples:

Boundary Decision Task: given f(s,t) = "return s > t", and "s = 3", a
valid sequence is: "7T2F".

Mod is Zero Task: given f(s,t) = "return (t % s) === 0", and "s = 4", a
valid sequence is: "7F6T".

Obvoiusly there are many further generalizations:
 - Separate the vocabs for s and t
 - Allow non-uniform token distributions for s and t
 - Allow f to depend on all previous tokens
*/

import * as tf from '@tensorflow/tfjs';
import { BasicLmTask, RandLmTaskConfig, Example, BasicRandLmTask } from './util';
import { StateIter } from '../state-iter/state-iter';
import { RandomState, RandomStream, makeRandomStream } from '../random/random';
import { taskRegistry } from './task_registry';

export type BoolToken = 'T' | 'F';
export const boolVocab: BoolToken[] = ['T', 'F'];

export type SecretTokenTaskConfig<Vocab extends string> = RandLmTaskConfig & {
  kind: 'SecretTokenTask';
  // Vocab for the random tokens, and also from which the secret value is
  // chosen.
  randomTokensVocab: Vocab[];
  // string that evals to a function of the form
  //   (s: Vocab, t: Vocab) => boolean
  //   e.g. 'return s > t'
  tokenToBoolFnStr: string;
};

export const defaultSecretTokenTaskConfig: SecretTokenTaskConfig<string> = {
  name: 'mod secret token === 0',
  kind: 'SecretTokenTask',
  maxInputLen: 5,
  maxOutputLen: 1,
  genStateConfig: { seed: 0 },
  randomTokensVocab: ['1', '2', '3', '4', '5'],
  tokenToBoolFnStr: 'return (parseInt(t) % parseInt(s) === 0)',
};

export class SecretTokenTask<Vocab extends string> implements BasicRandLmTask {
  // TODO: consider doing programatically in the constructor?
  public baseVocab: string[];
  private exampleId = 0;
  private tokenToBoolFn: (s: Vocab, t: Vocab) => BoolToken;
  public exampleIter: StateIter<RandomState, Example>;

  constructor(public config: SecretTokenTaskConfig<Vocab>) {
    this.baseVocab = [...boolVocab, ...config.randomTokensVocab];
    // TODO: sandbox.
    this.tokenToBoolFn = new Function('s', 't', config.tokenToBoolFnStr) as (
      s: Vocab,
      t: Vocab
    ) => BoolToken;
    this.exampleIter = new StateIter(structuredClone(config.genStateConfig), (r) =>
      this.examplesGen(r)
    );
  }

  genRandExample(r: RandomState): Example {
    const rng = new RandomStream(r);
    // The secret token
    const secretToken = rng.randomEntryFromList(this.config.randomTokensVocab);
    // console.log('secretToken:', secretToken);

    // Create random tokens such that we don't go over the max length:
    // Each random token, t, will be followed by tokenToBoolFn(secretToken, t)
    const numberOfRandomTokens = Math.floor((this.config.maxInputLen + 1) / 2);
    const randomTokenIds = tf
      .randomUniform(
        [numberOfRandomTokens],
        0,
        this.config.randomTokensVocab.length,
        'int32',
        rng.random()
      )
      .arraySync() as number[];

    const finalId = randomTokenIds.pop();
    if (finalId === undefined) {
      throw new Error(`no input Id. maxInputLen: ${this.config.maxInputLen}`);
    }

    const input = randomTokenIds
      .map((i) => {
        const thisToken = this.config.randomTokensVocab[i];
        return [thisToken, this.tokenToBoolFn(secretToken, thisToken) ? 'T' : 'F'];
      })
      .flat();
    const finalToken = this.config.randomTokensVocab[finalId];
    input.push(finalToken);

    const target = [this.tokenToBoolFn(secretToken, finalToken) ? 'T' : 'F'];

    return {
      id: this.exampleId++,
      input,
      output: target,
      secret: [secretToken],
    };
  }

  *examplesGen(r: RandomState): Generator<Example, undefined, undefined> {
    while (true) {
      yield this.genRandExample(r);
    }
  }
}

taskRegistry.register(defaultSecretTokenTaskConfig, (c) => new SecretTokenTask(c));
