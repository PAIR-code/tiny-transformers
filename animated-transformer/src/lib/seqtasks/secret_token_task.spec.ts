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

import { SecretTokenTask } from './secret_token_task';
import { Example } from './util';

type RandomVocab = '1' | '2' | '3' | '4' | '5';

describe('secret_token_task', () => {
  let task: SecretTokenTask<RandomVocab>;

  beforeEach(() => {});

  it('genRandExample: DecisionBoundaryTask', () => {
    task = new SecretTokenTask({
      name: 'DecisionBoundaryTask',
      maxInputLen: 5,
      maxOutputLen: 1,
      seed: 0,
      randomTokensVocab: ['1', '2', '3', '4', '5'],
      tokenToBoolFnStr: 'return s >= t',
    });

    let example: Example;
    [example] = task.exampleIter.takeOutN(1);
    expect(example.secret).toEqual(['2']);
    expect(example.input).toEqual(['5', 'F', '4', 'F', '3']);
    expect(example.output).toEqual(['F']);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.secret).toEqual(['2']);
    expect(example.input).toEqual(['3', 'F', '2', 'T', '1']);
    expect(example.output).toEqual(['T']);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.secret).toEqual(['3']);
    expect(example.input).toEqual(['3', 'T', '3', 'T', '4']);
    expect(example.output).toEqual(['F']);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.secret).toEqual(['4']);
    expect(example.input).toEqual(['1', 'T', '3', 'T', '4']);
    expect(example.output).toEqual(['T']);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.secret).toEqual(['3']);
    expect(example.input).toEqual(['1', 'T', '4', 'F', '5']);
    expect(example.output).toEqual(['F']);
  });

  it('genRandExample: ModIsZero', () => {
    task = new SecretTokenTask({
      name: 'ModIsZero',
      maxInputLen: 5,
      maxOutputLen: 1,
      seed: 0,
      randomTokensVocab: ['1', '2', '3', '4', '5'],
      tokenToBoolFnStr: 'return (parseInt(t) % parseInt(s) === 0)',
      // tokenToBoolFnStr: 'return String(parseInt(t) % parseInt(s))'
    });

    let example: Example;
    [example] = task.exampleIter.takeOutN(1);

    expect(example.secret).toEqual(['2']);
    expect(example.input).toEqual(['5', 'F', '4', 'T', '3']);
    expect(example.output).toEqual(['F']);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.secret).toEqual(['2']);
    expect(example.input).toEqual(['3', 'F', '2', 'T', '1']);
    expect(example.output).toEqual(['F']);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.secret).toEqual(['3']);
    expect(example.input).toEqual(['3', 'T', '3', 'T', '4']);
    expect(example.output).toEqual(['F']);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.secret).toEqual(['4']);
    expect(example.input).toEqual(['1', 'F', '3', 'F', '4']);
    expect(example.output).toEqual(['T']);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.secret).toEqual(['3']);
    expect(example.input).toEqual(['1', 'F', '4', 'F', '5']);
    expect(example.output).toEqual(['F']);
  });
});
