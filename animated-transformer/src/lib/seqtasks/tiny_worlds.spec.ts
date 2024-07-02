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
  TinyWorldTask,
  TinyWorldTaskConfig,
  defaultTinyWorldTaskConfig,
} from './tiny_worlds';

describe('tiny_worlds', () => {
  beforeEach(() => {});

  it('genRandExample', () => {
    const initConfig: TinyWorldTaskConfig = { ...defaultTinyWorldTaskConfig };
    initConfig.maxOutputLen = 20;
    const tinyWorld = new TinyWorldTask(initConfig);
    const example = tinyWorld.genRandExample();
    console.log(JSON.stringify(example.input));
    console.log(example.output);
    expect(example.id).toEqual(0);
    expect(example.input).toEqual([
      'is',
      '_a',
      ':',
      'cat',
      'is',
      '_b',
      ':',
      'cat',
      'jumps',
      '_a',
      ':',
      'cat',
      'jumps',
      '_a',
      ':',
      'cat',
      'jumps',
      '_b',
    ]);
    expect(example.output).toEqual([':']);

    const example2 = tinyWorld.genRandExample();
    console.log(JSON.stringify(example2.input));
    console.log(example2.output);
    expect(example2.id).toEqual(1);
    expect(example2.input).toEqual([
      'runs-away',
      '_a',
      ':',
      'animal',
      'runs-away',
      '_b',
      ':',
      'animal',
      'is',
      '_a',
      ':',
      'cat',
      'runs-away',
      '_c',
      ':',
      'cat',
      'runs-away',
      '_d',
    ]);
    expect(example2.output).toEqual([':']);
  });
});
