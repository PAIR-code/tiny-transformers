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

import { List } from 'underscore';
import {
  TinyWorldTask,
  TinyWorldTaskConfig,
  bayesianV1TinyWorldTaskConfig,
  defaultTinyWorldTaskConfig,
} from './tiny_worlds';

describe('tiny_worlds', () => {
  beforeEach(() => {});

  it('test_bayesianV1TinyWorldTaskConfig', () => {
    const initConfig = { ...bayesianV1TinyWorldTaskConfig };
    console.log('config uses: bayesianE1TinyWorldTaskConfig');
    const len = 1500; // sample many for counting
    initConfig.maxInputLen = len;
    initConfig.maxOutputLen = 1;
    const tinyWorld = new TinyWorldTask(initConfig);
    const [example] = tinyWorld.exampleIter.takeOutN(1);

    function count(list: any[], elem: any) {
      return list.filter((x: any) => x === elem).length;
    }
    const input_count_i0 = count(example.input, 'i0');
    const input_count_11 = count(example.input, 'i1');
    const input_count_ratio = (input_count_i0 * 1.0) / input_count_11;
    const mean = 0.5,
      eps = 0.05; // eps is determined by len
    expect(input_count_ratio).toBeGreaterThanOrEqual(mean - eps);
    expect(input_count_ratio).toBeLessThanOrEqual(mean + eps);
  });

  fit('genRandExampleWithSameAndDifferentSeeds', () => {
    const commonConfig: TinyWorldTaskConfig = {
      ...defaultTinyWorldTaskConfig,
      maxInputLen: 100,
      maxOutputLen: 1,
    };
    const initConfig_1: TinyWorldTaskConfig = { ...commonConfig, seed: 0 };
    const initConfig_2: TinyWorldTaskConfig = { ...commonConfig, seed: 0 };
    const initConfig_3: TinyWorldTaskConfig = { ...commonConfig, seed: 1 };

    const tinyWorld_1 = new TinyWorldTask(initConfig_1);
    const tinyWorld_2 = new TinyWorldTask(initConfig_2);
    const tinyWorld_3 = new TinyWorldTask(initConfig_3);
    const [example_1] = tinyWorld_1.exampleIter.takeOutN(1);
    const [example_2] = tinyWorld_2.exampleIter.takeOutN(1);
    const [example_3] = tinyWorld_3.exampleIter.takeOutN(1);

    expect(example_1.input.join('')).toEqual(example_2.input.join(''));
    expect(example_1.input.join('')).not.toEqual(example_3.input.join(''));
  });

  it('genRandExample', () => {
    const initConfig: TinyWorldTaskConfig = { ...defaultTinyWorldTaskConfig };
    initConfig.maxOutputLen = 20;
    const tinyWorld = new TinyWorldTask(initConfig);
    const [example] = tinyWorld.exampleIter.takeOutN(1);
    expect(example.id).toEqual(0);
    expect(example.input.length).toEqual(initConfig.maxInputLen);
    console.log(JSON.stringify(example.input));
    expect(example.input).toEqual([
      'is',
      ' ',
      '_a',
      ':',
      'monkey',
      ', ',
      'is',
      ' ',
      '_b',
      ':',
    ]);
    expect(example.input.join('')).toEqual('is _a:monkey, is _b:');
    console.log(JSON.stringify(example.output));
    expect(example.output).toEqual([
      'cat',
      ', ',
      'is',
      ' ',
      '_c',
      ':',
      'tree',
      ', ',
      'is',
      ' ',
      '_d',
      ':',
      'elephant',
      ', ',
      'jumps',
      ' ',
      '_a',
      ', ',
      'squishes',
      ' ',
    ]);
    expect(example.output.join('')).toEqual(
      'cat, is _c:tree, is _d:elephant, jumps _a, squishes '
    );

    const [example2] = tinyWorld.exampleIter.takeOutN(1);
    expect(example2.id).toEqual(1);
    expect(example2.input.join('')).toEqual('is _a:flower, is _b:');
    expect(example2.output.join('')).toEqual(
      'animal, is _c:animal, jumps _b, jumps _b, is _d:'
    );
  });
});
