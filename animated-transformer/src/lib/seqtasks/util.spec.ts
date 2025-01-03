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

// import { makeClonableIter, StateIter } from '../state-iter/state-iter';
import { StateIter } from '../state-iter/state-iter';
import {
  Example,
  generateBatch,
  escapeToken,
  BasicLmTask,
  splitGenerativeTaskTestSet,
  indexExample,
  BasicLmTaskConfig,
} from './util';

describe('seqtasks/util', () => {
  beforeEach(() => {});

  it('escaping', () => {
    const t = escapeToken('foo bar \\ ugg');
    expect(t).toEqual('foo\\ bar\\ \\\\\\ ugg');
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
    const exampleGen: Iterator<Example> = exampleGenFactory();
    const batch = generateBatch(exampleGen, 8);
    expect(batch.length).toEqual(8);
    expect(batch[0].id).toEqual(0);
    expect(batch[0].input).toEqual(['in0']);
    expect(batch[0].output).toEqual(['out0']);
    expect(batch[7].id).toEqual(7);
    expect(batch[7].input).toEqual(['in7']);
    expect(batch[7].output).toEqual(['out7']);
  });

  it('takeFirstN of makeExampleGenerator', () => {
    function* iterFn(state: { idx: number }): Iterator<Example> {
      while (true) {
        const i = state.idx;
        yield {
          id: i,
          input: [`${i % 4}`, `${i % 3}`],
          output: [`${((i % 4) + (i % 3)) % 4}`],
        };
        state.idx++;
      }
    }
    /* Simple interface for classes that provide a task */
    const exampleIter = new StateIter({ idx: 0 }, iterFn);
    const task: BasicLmTask<BasicLmTaskConfig<{ idx: number }>> = {
      baseVocab: ['0', '1', '2', '3', '4'], //'5', '6', '7', '8', '9',
      config: {
        id: 'fooTask',
        kind: 'foo',
        maxInputLen: 2,
        maxOutputLen: 1,
        genStateConfig: { idx: 0 },
      },
      exampleIter: exampleIter,
    };
    expect(task.exampleIter.copy().takeOutN(13).map(indexExample)).toEqual([
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
    function* iterFn(state: { idx: number }): Iterator<Example> {
      while (true) {
        const i = state.idx;
        yield {
          id: i,
          input: [`${i % 4}`, `${i % 3}`],
          output: [`${((i % 4) + (i % 3)) % 4}`],
        };
        state.idx++;
      }
    }
    /* Simple interface for classes that provide a task */
    const exampleIter = new StateIter({ idx: 0 }, iterFn);
    const task: BasicLmTask<BasicLmTaskConfig<{ idx: number }>> = {
      baseVocab: ['0', '1', '2', '3', '4'], //'5', '6', '7', '8', '9',
      config: {
        id: 'fooTask',
        kind: 'foo',
        maxInputLen: 2,
        maxOutputLen: 1,
        genStateConfig: { idx: 0 },
      },
      exampleIter: exampleIter,
    };
    expect(task.exampleIter.copy().takeOutN(13).map(indexExample)).toEqual([
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
    const split = splitGenerativeTaskTestSet(7, task.exampleIter);
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

    const nextExamples1 = split.trainExamples.takeOutN(6).map(indexExample);
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
    const nextExamples2 = split.trainExamples.takeOutN(6).map(indexExample);
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
