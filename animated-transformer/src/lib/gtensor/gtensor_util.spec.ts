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


import * as gtensor_util from './gtensor_util';
import * as tf from '@tensorflow/tfjs';

describe('gtensor_util', () => {
  beforeEach(() => {
  });

  it('range', () => {
    // Making a GTensor with an initializer:
    const r = gtensor_util.range(0, 6, 2);
    expect(r).toEqual([0, 2, 4]);
  });

  it('grid', () => {
    // Making a GTensor with an initializer:
    const grid = gtensor_util.grid([0, 0], [1, 1], [0.3, .5]);
    expect(() => tf.test_util.expectArraysClose(grid, [
      [0, 0], [0.3, 0], [0.6, 0], [0.9, 0],
      [0, 0.5], [0.3, 0.5], [0.6, 0.5], [0.9, 0.5],
      [0, 1], [0.3, 1], [0.6, 1], [0.9, 1],
    ])).not.toThrow();
  });

  it('grid unequal length creation throws exception', () => {
    expect(() => gtensor_util.grid([0, 0], [1, 1], [.5])).toThrow();
    expect(() => gtensor_util.grid([0, 0], [1], [0.3, .5])).toThrow();
    expect(() => gtensor_util.grid([0], [1, 1], [0.3, .5])).toThrow();
  });
});
