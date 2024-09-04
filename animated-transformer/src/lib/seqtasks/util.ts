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
 * Misc Utility functions...
 *
 * - Generative Sequence Exmaples (id, input, output, optional secret)
 * - Basic Language Model Task Configuration (name, max input len, max output len)
 * - String escaping to avoid given sequences.
 * -
 */

import { RandomState, RandomStream } from '../state-iter/random';
import { StateIter } from '../state-iter/state-iter';

export interface Example {
  id: number;
  input: string[];
  output: string[];
  // optional ([] if not defined) secret value that defines the output for the
  // input.
  secret?: string[];
}

// Something that iterates through a dataset.
// export type ExampleIter = ;
// Generator<Example, undefined, undefined>;

export type BasicLmTaskConfig<T> = {
  name: string;
  kind: string; // this part of a descriminated union.
  maxInputLen: number;
  maxOutputLen: number;
  // All determistically generated tasks must have some data that defines the
  // task. This lives in genStateConfig, should be directly serializable, and
  // uniquely defines how/what data examples get generated. This requirement
  // allows a config to be saved and loaded later, while keeping generation
  // deterministic, independently of when it is loaded/saved.
  genStateConfig: T;
};

// Many tasks depend solely on a random number.
export type RandLmTaskConfig = BasicLmTaskConfig<RandomState>;

export type GenStateOfTaskConfig<T> = T extends BasicLmTaskConfig<infer GenState>
  ? GenState
  : never;

type ShouldBeTrue = GenStateOfTaskConfig<RandLmTaskConfig> extends RandomState ? true : false;

/* Simple interface for classes that provide a task */
export interface BasicLmTask<Config extends BasicLmTaskConfig<{}>> {
  config: Config;
  baseVocab: string[];
  exampleIter: StateIter<GenStateOfTaskConfig<Config>, Example>;
}

// A way to get from a BasicLmTask back to a config that can be used to
// reconstruct the same task state.
export function configFromTaskIter<GenState extends {}, Config extends BasicLmTaskConfig<GenState>>(
  task: BasicLmTask<Config>
): Config {
  const config: Config = {
    ...structuredClone(task.config),
    genStateConfig: structuredClone(task.exampleIter.state),
  };
  return config;
}

export type BasicRandLmTask = BasicLmTask<BasicLmTaskConfig<RandomState>>;
export type SomeBasicLmTask = BasicLmTask<BasicLmTaskConfig<{}>>;
export type BasicExtendsSome_True = BasicRandLmTask extends SomeBasicLmTask ? true : false;

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------

// TODO: move this somewhere where it belongs, presumably in one of the angular compoentns.
//
// This simple object wrapper for task updates; it can be used to make sure
// that when we emit task changes, they always have a new top-level object so
// that change detection sees that it's something new.
export interface BasicLmTaskUpdate {
  task?: SomeBasicLmTask;
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
export function escapeString(token: string, escapeChar = '\\', sepChar = ' '): string {
  return token
    .replaceAll(escapeChar, `${escapeChar}${escapeChar}`)
    .replaceAll(sepChar, `${escapeChar}${sepChar}`);
}

export function escapeToken(token: string) {
  return escapeString(token);
}

export function indexExample(example: Example): string {
  return [...example.input.map(escapeToken), '\\-->', ...example.output.map(escapeToken)].join(' ');
}

export function generateBatch(exampleGen: Iterator<Example>, batchSize: number): Example[] {
  // return [...takeNextN(exampleGen, batchSize)];
  const examples: Example[] = [];
  for (let i = 0; i < batchSize; i++) {
    const maybeExample = exampleGen.next();
    if (maybeExample.done) {
      return examples;
    }
    examples.push(maybeExample.value);
  }
  return examples;
}

// TODO: consider more functional version that doesn't change the task..
//
// Split off a number of examples to form the test set, and make sure that is
// never in the set of examples generated after.
export function splitGenerativeTaskTestSet<S>(
  firstN: number,
  datasetExampleIter: StateIter<S, Example>
): {
  testSetExamples: Example[];
  testSetIndex: Set<string>;
  trainExamples: StateIter<S, Example>;
} {
  const examplesIter = datasetExampleIter.copy();
  const testSetExamples = examplesIter.takeOutN(firstN);
  const testSetIndex = new Set(testSetExamples.map(indexExample));

  const trainExamples = examplesIter.copy();
  trainExamples.filter((example) => !testSetIndex.has(indexExample(example)));

  return {
    testSetExamples,
    testSetIndex,
    trainExamples,
  };
}

export function addBetweenEvery<T>(arr: T[], newEntry: T): T[] {
  return arr.reduce((result, current, index) => {
    result.push(current);
    if (index < arr.length - 1) {
      // Avoid adding at the very end
      result.push(newEntry);
    }
    return result;
  }, [] as T[]);
}

export function filterSet<T>(keepItFn: (ty: T) => boolean, s: Set<T>): Set<T> {
  const filteredSet = new Set<T>();
  s.forEach((i) => {
    if (keepItFn(i)) {
      filteredSet.add(i);
    }
  });
  return filteredSet;
}
