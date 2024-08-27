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

import { getUniGramTinyWorldConfig } from './ngram_tiny_worlds';
import { TinyWorldTask } from './tiny_worlds';

describe('ngram_tiny_worlds', () => {
  beforeEach(() => {});

  it('test_getUniGramTinyWorldConfig', () => {
    let seed = 0;
    let nIdentity = 10;
    let uniGramTinyWorldConfig = getUniGramTinyWorldConfig(nIdentity, seed);

    console.log(JSON.stringify(uniGramTinyWorldConfig));
    uniGramTinyWorldConfig.maxInputLen = 20;
    let tinyWorld = new TinyWorldTask(uniGramTinyWorldConfig);
    const [example] = tinyWorld.exampleIter.takeOutN(1);
    expect(example.input.join('')).toEqual('is _a:i7, is _b:i6, is _c:i9, is ');
  });
});
