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

import {
  Example,
  generateBatch,
  makeRandFnFromSeed,
  escapeToken,
  randOfList,
  BasicLmTask,
  splitGenerativeTaskTestSet,
  indexExample,
  takeNextN,
  listGen,
  filterGen,
} from './util';

describe('seqtasks/util', () => {
  beforeEach(() => {});

  it('escaping', () => {
    const t = escapeToken('foo bar \\ ugg');
    expect(t).toEqual('foo\\ bar\\ \\\\\\ ugg');
  });

  it('randFn', () => {
    const rand = makeRandFnFromSeed(1);
    expect(rand()).toEqual(0.6270739405881613);
  });

  it('generateBatch', () => {
    function* exampleGenFactory(): Generator<Example, undefined, undefined> {
      let i = 0;
      while (true) {
        yield {
          id: i,
          input: [`in${i}`],
          output: [`out${i}`],
        };
        i++;
      }
    }
    const exampleGen: Iterable<Example> = exampleGenFactory();
    const batch = generateBatch(exampleGen, 8);
    expect(batch.length).toEqual(8);
    expect(batch[0].id).toEqual(0);
    expect(batch[0].input).toEqual(['in0']);
    expect(batch[0].output).toEqual(['out0']);
    expect(batch[7].id).toEqual(7);
    expect(batch[7].input).toEqual(['in7']);
    expect(batch[7].output).toEqual(['out7']);
  });

  it('takeNextN', () => {
    const g = listGen([1, 2, 3, 4, 5]);
    expect([...takeNextN(g, 2)]).toEqual([1, 2]);
    expect(g.next().value).toEqual(3);
    expect([...takeNextN(g, 2)]).toEqual([4, 5]);
  });

  it('filterGen', () => {
    const takenNums = filterGen((n) => n % 2 !== 0, listGen([1, 2, 3, 4, 5]));
    expect([...takenNums]).toEqual([1, 3, 5]);
  });

  it('takeFirstN of makeExampleGenerator', () => {
    function* exampleIterFactory(): Iterable<Example> {
      let i = 0;
      while (true) {
        yield {
          id: i,
          input: [`${i % 4}`, `${i % 3}`],
          output: [`${((i % 4) + (i % 3)) % 4}`],
        };
        i++;
      }
    }
    /* Simple interface for classes that provide a task */
    const task: BasicLmTask = {
      baseVocab: ['0', '1', '2', '3', '4'], //'5', '6', '7', '8', '9',
      config: { name: 'fooTask', maxInputLen: 2, maxOutputLen: 1 },
      exampleIter: exampleIterFactory(),
    };
    expect([...takeNextN(task.exampleIter, 13)].map(indexExample)).toEqual([
      '0 0 \\--> 0',
      '1 1 \\--> 2',
      '2 2 \\--> 0',
      '3 0 \\--> 3',
      '0 1 \\--> 1',
      '1 2 \\--> 3',
      '2 0 \\--> 2',
      '3 1 \\--> 0',
      '0 2 \\--> 2',
      '1 0 \\--> 1',
      '2 1 \\--> 3',
      '3 2 \\--> 1',
      '0 0 \\--> 0',
    ]);
  });

  it('splitGenerativeTaskTestSet', () => {
    function* exampleIterFactory(): Iterable<Example> {
      let i = 0;
      while (true) {
        yield {
          id: i,
          input: [`${i % 4}`, `${i % 3}`],
          output: [`${((i % 4) + (i % 3)) % 4}`],
        };
        i++;
      }
    }
    /* Simple interface for classes that provide a task */
    const task: BasicLmTask = {
      baseVocab: ['0', '1', '2', '3', '4'], //'5', '6', '7', '8', '9',
      config: { name: 'fooTask', maxInputLen: 2, maxOutputLen: 1 },
      exampleIter: exampleIterFactory(),
    };
    expect([...takeNextN(task.exampleIter, 13)].map(indexExample)).toEqual([
      // Test set = first 7
      '0 0 \\--> 0',
      '1 1 \\--> 2',
      '2 2 \\--> 0',
      '3 0 \\--> 3',
      '0 1 \\--> 1',
      '1 2 \\--> 3',
      '2 0 \\--> 2',
      // Train set = next 5
      '3 1 \\--> 0',
      '0 2 \\--> 2',
      '1 0 \\--> 1',
      '2 1 \\--> 3',
      '3 2 \\--> 1',
      // Back to Test set...
      '0 0 \\--> 0',
    ]);

    const split = splitGenerativeTaskTestSet(7, task);
    const testValuesIndex = [...split.testSetIndex.values()];
    expect(testValuesIndex).toEqual([
      '0 0 \\--> 0',
      '1 1 \\--> 2',
      '2 2 \\--> 0',
      '3 0 \\--> 3',
      '0 1 \\--> 1',
      '1 2 \\--> 3',
      '2 0 \\--> 2',
    ]);
    const generator = split.testFilteredExampleGenerator;
    const nextExamples1 = generateBatch(generator, 6).map(indexExample);
    expect(nextExamples1).toEqual([
      '3 1 \\--> 0',
      '0 2 \\--> 2',
      '1 0 \\--> 1',
      '2 1 \\--> 3',
      '3 2 \\--> 1',
      // Note: the next example is not: '0 0 \\--> 0', because that's in the
      // test set, so we loop back onto the start of the training set now.
      '3 1 \\--> 0',
    ]);
    const nextExamples2 = generateBatch(generator, 6).map(indexExample);
    expect(nextExamples2).toEqual([
      '0 2 \\--> 2',
      '1 0 \\--> 1',
      '2 1 \\--> 3',
      '3 2 \\--> 1',
      '3 1 \\--> 0',
      '0 2 \\--> 2',
    ]);
  });
});
