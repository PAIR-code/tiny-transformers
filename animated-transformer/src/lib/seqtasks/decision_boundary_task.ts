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

/* 1D decision boundary finding task.

Given a sequence of values with an ordering relation, identify where the
decision boundary is.
*/
// TODO support picking a fixed number of points left of D, and a fixed
// number right of D

// TODO number vocab forming a cyclic structure and have to measure is
// fastest route to D is left or right.

import * as tf from '@tensorflow/tfjs';
import { BasicLmTask, BasicRandSeededTaskConfig, Example } from './util';
import { StateIter } from '../state-iter/state-iter';
import { RandomStream, makeRandomStream } from '../state-iter/random';

export const numberVocab = ['1', '2', '3', '4', '5'];
// Given B = decision boundary:
// R = B < x (x is right of the decision boundary)
// L = x < B (x is left of the decision boundary)
export type RelPosDecision = 'R' | 'L';
export const relPosVocab: RelPosDecision[] = ['L', 'R'];
export const baseVocab = [...relPosVocab, ...numberVocab];

export type DecisionBoundaryTaskConfig = BasicRandSeededTaskConfig & {
  kind: 'DecisionBoundaryTask';
};

export const defaultDecisionBoundaryTaskConfig: DecisionBoundaryTaskConfig = {
  name: 'a DecisionBoundaryTask',
  kind: 'DecisionBoundaryTask',
  maxInputLen: 5,
  maxOutputLen: 1,
  seed: 0,
};

export class DecisionBoundaryTask implements BasicLmTask {
  public baseVocab = baseVocab;
  private exampleId: number;
  public exampleIter: StateIter<RandomStream, Example>;

  constructor(public config: DecisionBoundaryTaskConfig) {
    this.exampleId = 0;
    this.exampleIter = new StateIter(
      makeRandomStream(config.seed),
      (x) => x.copy(),
      (rng) => this.examplesGen(rng)
    );
  }

  genRandExample(rng: RandomStream): Example {
    // Boundary position is one of [-.05, 0.5, 1.5, ... (N+0.5)]
    const boundaryPos = Math.floor(rng.random() * (numberVocab.length + 1)) - 0.5;

    // Create number inputs such that we don't go over the max length:
    // Each input numberVocab will be followed by a L or R
    const inputIndexes = tf
      .randomUniform(
        [Math.floor((this.config.maxInputLen + 1) / 2)],
        0,
        numberVocab.length,
        'int32',
        rng.random()
      )
      .arraySync() as number[];

    const finalIndex = inputIndexes.pop();
    if (finalIndex === undefined) {
      throw new Error(`no input indexes. maxInputLen: ${this.config.maxInputLen}`);
    }

    const input = inputIndexes.map((i) => [numberVocab[i], i < boundaryPos ? 'L' : 'R']).flat();
    input.push(numberVocab[finalIndex]);

    const output = [finalIndex < boundaryPos ? 'L' : 'R'];

    return { id: this.exampleId++, input, output, secret: [`${boundaryPos}`] };
  }

  *examplesGen(rng: RandomStream): Generator<Example, undefined, undefined> {
    while (true) {
      yield this.genRandExample(rng);
    }
  }
}
