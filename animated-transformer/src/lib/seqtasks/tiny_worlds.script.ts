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

// Run with: ts-node src/lib/seqtasks/tiny_worlds.script.ts

import {
  TinyWorldTask,
  TinyWorldTaskConfig,
  defaultTinyWorldTaskConfig,
} from './tiny_worlds';

const initConfig: TinyWorldTaskConfig = { ...defaultTinyWorldTaskConfig };
initConfig.maxOutputLen = 20;
const tinyWorld = new TinyWorldTask(initConfig);
const [example] = tinyWorld.exampleIter.takeOutN(1);
console.log('Example 1');
console.log('input: ', JSON.stringify(example.input.join('')));
console.log('output: ', JSON.stringify(example.output.join('')));

const [example2] = tinyWorld.exampleIter.takeOutN(1);
console.log('Example 2');
console.log('input: ', JSON.stringify(example.input.join('')));
console.log('output: ', JSON.stringify(example.output.join('')));
