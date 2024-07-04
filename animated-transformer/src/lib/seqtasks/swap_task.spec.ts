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

import * as swap_task from './swap_task';

describe('swap_task', () => {
  let swapTask: swap_task.SwapTask;

  beforeEach(() => {
    swapTask = new swap_task.SwapTask({
      name: 'SwapTask',
      maxInputLen: 10,
      maxOutputLen: 1,
      valuesLessThan: swap_task.baseVocab.length + 1,
      seed: 47,
    });
  });

  it('swappables', () => {
    const swaps = swap_task.swappables([1, 2, 5, 2]);
    expect(swaps).toEqual([
      {
        idx1: 2,
        value1: 5,
        idx2: 3,
        value: 2,
        delta: 3,
      },
    ]);
  });

  it('makeOutput-simple', () => {
    const output = swap_task.makeOutput([1, 2, 5, 2]);
    expect(output).toEqual(['i', 'i', 'l', 'r']);
  });

  it('makeOutput-none', () => {
    const output = swap_task.makeOutput([1, 2, 3, 4]);
    expect(output).toEqual(['i', 'i', 'i', 'i']);
  });

  it('makeOutput-rev', () => {
    const output = swap_task.makeOutput([5, 4, 3, 2, 1]);
    expect(output).toEqual(['l', 'i', 'i', 'i', 'r']);
  });

  it('genRandExample', () => {
    const example = swapTask.genRandExample();
    // Strange bug:
    //   example.input.map(x => parseInt(x)) !==
    //   example.input.map(parseInt)
    // strangely:
    //   example.input.map(parseInt)[1] === NaN
    const inputsAsNumbers = example.input.map((x) => parseInt(x));
    expect(example.input.length).toEqual(swapTask.config.maxInputLen);
    expect(Math.max(...inputsAsNumbers)).toBeLessThan(
      swapTask.config.valuesLessThan
    );
    expect(Math.min(...inputsAsNumbers)).toBeGreaterThan(-1);
  });

  it('genExamples', () => {
    const examplesGen = swapTask.examplesIter();
    const example = examplesGen.next();
    if (example.done) {
      throw new Error('No examples generated');
    }
    const inputsAsNumbers = example.value.input.map((x) => parseInt(x));
    expect(example.value.input.length).toEqual(swapTask.config.maxInputLen);
    expect(Math.max(...inputsAsNumbers)).toBeLessThan(
      swapTask.config.valuesLessThan
    );
    expect(Math.min(...inputsAsNumbers)).toBeGreaterThan(-1);
  });
});
