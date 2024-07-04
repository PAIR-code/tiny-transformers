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

    const example2 = tinyWorld.genRandExample();
    expect(example2.id).toEqual(1);
    expect(example2.input.join('')).toEqual('is _a:flower, is _b:');
    expect(example2.output.join('')).toEqual(
      'animal, is _c:animal, jumps _b, jumps _b, is _d:'
    );
  });
});
