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

import { DecisionBoundaryTask } from './decision_boundary_task';
import { Example } from './util';

describe('decision_boundary_task', () => {
  let task: DecisionBoundaryTask;

  beforeEach(() => {});

  it('genRandExample', () => {
    task = new DecisionBoundaryTask({
      name: 'a DecisionBoundaryTask',
      kind: 'DecisionBoundaryTask',
      maxInputLen: 5,
      maxOutputLen: 1,
      genStateConfig: { seed: 0 },
    });

    let example: Example;
    [example] = task.exampleIter.takeOutN(1);
    expect(example.input.length).toEqual(5);
    expect(example.output.length).toEqual(1);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.input.length).toEqual(5);
    expect(example.output.length).toEqual(1);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.input.length).toEqual(5);
    expect(example.output.length).toEqual(1);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.input.length).toEqual(5);
    expect(example.output.length).toEqual(1);

    [example] = task.exampleIter.takeOutN(1);
    expect(example.input.length).toEqual(5);
    expect(example.output.length).toEqual(1);
  });
});
