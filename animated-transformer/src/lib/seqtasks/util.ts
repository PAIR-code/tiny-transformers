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

import { embed } from '../tokens/token_gemb';
import * as tf from '@tensorflow/tfjs';

export interface Example {
  id: number;
  input: string[];
  output: string[];
  // optional ([] if not defined) secret value that defines the output for the
  // input.
  secret?: string[];
}

// Something that iterates through a dataset.
export type ExampleGenerator = Generator<Example, undefined, undefined>;

export type BasicLmTaskConfig = {
  name: string;
  maxInputLen: number;
  maxOutputLen: number;
};

export type BasicRandSeededTaskConfig = BasicLmTaskConfig & {
  seed: number;
};

/* Simple interface for classes that provide a task */
export interface BasicLmTask {
  name: string;
  baseVocab: string[];
  config: BasicLmTaskConfig;
  makeExamplesGenerator(): ExampleGenerator;
  // tokenRep: MaskedTaskTokenRep;
  // genRandExample(): Example;
  // Called after a config change to re-init.
  // reInitFromConfig(): void;
}

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------

// TODO: move this somewhere where it belongs, presumably in one of the angular compoentns.
//
// This simple object wrapper for task updates; it can be used to make sure
// that when we emit task changes, they always have a new top-level object so
// that change detection sees that it's something new.
export interface BasicLmTaskUpdate {
  task?: BasicLmTask;
}

// ----------------------------------------------------------------------------
// Escaping
// ----------------------------------------------------------------------------
// There are some important properties of escaping:
//    let s' = escapeToken(s, escapeChar, sepChar)
// In s', for every match of /[^{escapeChar}]{escapeChar}(${nextChar})/, the
// value of {nextChar} is either escapeChar or sepChar.
// This allows new escape sequences to be added that we know will never occur
// s', e.g. `${escapeChar}${safeSequence}`.
// This provides a simple string serialization format for compound objects.
export function escapeString(
  token: string,
  escapeChar = '\\',
  sepChar = ' '
): string {
  return token
    .replaceAll(escapeChar, `${escapeChar}${escapeChar}`)
    .replaceAll(sepChar, `${escapeChar}${sepChar}`);
}

export function escapeToken(token: string) {
  return escapeString(token);
}

export function indexExample(example: Example): string {
  return [
    ...example.input.map(escapeToken),
    '\\-->',
    ...example.output.map(escapeToken),
  ].join(' ');
}

// ----------------------------------------------------------------------------
// Randomness
// ----------------------------------------------------------------------------
// Random number streams; with fork abstraction.
// mulberry 32 bit implementation.
export class RandomStream implements Iterable<number> {
  private curSeedVal: number;

  constructor(seed: number) {
    this.curSeedVal = seed;
  }

  // Note: Number.MAX_VALUE / 0x6D2B79F5 === 9.815061637986119e+298
  // So, we have can generate up to 9.815061637986119e+298 numbers
  // before things go wrong. e.g. in JS:
  // Number.MAX_VALUE + 1 === Number.MAX_VALUE (tested 10 Mar 2023).
  random(): number {
    this.curSeedVal += 0x6d2b79f5; // === 1831565813
    let x = this.curSeedVal;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61); // 61 = prime number.
    return ((x ^ (x >>> 14)) >>> 0) / 0x100000000; // 2 ^^ 32 === 4294967296
  }

  fork(): RandomStream {
    return new RandomStream(this.random());
  }

  *[Symbol.iterator]() {
    while (true) {
      yield this.random();
    }
  }
}

// Random number generator Functor: a mulberry 32 bit implementation.
export function makeRandFnFromSeed(seed: number): () => number {
  return function () {
    let x = (seed += 0x6d2b79f5); // === 1831565813
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61); // 61 = prime number.
    return ((x ^ (x >>> 14)) >>> 0) / 0x100000000; // 2 ^^ 32 === 4294967296
  };
}

// TODO: provide seed for deterministic generation.
export function randOfList<T>(rand: RandomStream, l: Array<T>): T {
  return l[Math.floor(rand.random() * l.length)];
}

export function generateBatch(
  exampleGen: ExampleGenerator,
  batchSize: number
): Example[] {
  return [...takeNextN(exampleGen, batchSize)];
  // const examples: Example[] = [];
  // for (let i = 0; i < batchSize; i++) {
  //   const maybeExample = exampleGen.next();
  //   if (maybeExample.done) {
  //     return examples;
  //   }
  //   examples.push(maybeExample.value);
  // }
  // return examples;
}

// export function generateBatch<T>(
//   exampleGenFn: (
//     globalExampleId: number,
//     batchId: number,
//     localExampleId: number) => T,
//   config: {
//     batchSize: number,
//     globalExampleId: number,
//     batchId: number
//   }) {
//   const examples: T[] = [];
//   for (let localExampleId = 0; localExampleId < config.batchSize; localExampleId++) {
//     examples.push(
//       exampleGenFn(config.globalExampleId, config.batchId, localExampleId));
//   }
//   return examples;
// }

// export function* generateBatches<T>(
//   exampleGenFn: (
//     globalExampleId: number,
//     batchId: number,
//     localExampleId: number) => T,
//   config: {
//     batchSize: number,
//     nBatches?: number
//   }
// ): Generator<{ batchId: number, examples: T[] }, undefined, undefined> {
//   let globalExampleId = 0;
//   for (let batchId = 0; !config.nBatches || batchId < config.nBatches; batchId++) {
//     const examples = generateBatch(exampleGenFn,
//       { batchSize: config.batchSize, globalExampleId, batchId });
//     globalExampleId++;
//     yield { batchId, examples };
//   }
//   return;
// }

// export function* generateTaskData(
//   task: BasicLmTask,
//   tokenEmb: TokenEmb,
//   numElements?: number
// ): Iterator<tf.TensorContainerObject> {
//   let index = 0;
//   const examplesGen = task.makeExamplesGenerator();
//   while (numElements && index < numElements) {
//     index++;
//     const example = examplesGen.next();
//     if (example.done) {
//       return;
//     }
//     yield {
//       xs: embed(example.value.input).tensor, // inputs
//       ys: embed(example.value.output).tensor, // correct outputs
//     } as tf.TensorContainerObject;
//   }
// }

export function* listGen<T>(l: T[]): Generator<T, undefined, undefined> {
  for (const i of l) {
    yield i;
  }
  return;
}

export function* takeNextN<T, T2>(
  g: Generator<T, T2, undefined>,
  n: number
): Generator<T, T2 | undefined, undefined> {
  while (n-- > 0) {
    // argument to g.next is undefined (would be T3)
    const curVal: IteratorResult<T, T2> = g.next();
    if (curVal.done) {
      return curVal.value; // type is T2
    }
    yield curVal.value; // type is T1
  }
  return;
}

export function* filterGen<T, T2>(
  filterFn: (x: T) => boolean,
  g: Generator<T, T2, undefined>
): Generator<T, T2, undefined> {
  let curVal: IteratorResult<T, T2>;
  curVal = g.next();
  while (!curVal.done) {
    if (filterFn(curVal.value)) {
      yield curVal.value;
    }
    curVal = g.next();
  }
  return curVal.value;
}

// TODO: consider more functional version that doesn't change the task..
//
// Split off a number of examples to form the test set, and make sure that is
// never in the set of examples generated after.
export function splitGenerativeTaskTestSet(
  firstN: number,
  task: BasicLmTask
): {
  testSetExamples: Example[];
  testSetIndex: Set<string>;
  testFilteredExampleGenerator: ExampleGenerator;
} {
  const examplesGenerator = task.makeExamplesGenerator();
  const testSetGen = takeNextN(examplesGenerator, firstN);
  const testSetExamples = [...testSetGen];
  const testSetIndex = new Set(testSetExamples.map(indexExample));

  const testFilteredExampleGenerator = filterGen(
    (example) => !testSetIndex.has(indexExample(example)),
    examplesGenerator
  );

  return { testSetExamples, testSetIndex, testFilteredExampleGenerator };
}
