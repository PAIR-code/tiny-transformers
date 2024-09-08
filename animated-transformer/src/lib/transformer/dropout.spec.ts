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

/* Dropout */
import * as tf from '@tensorflow/tfjs';
import { gtensor } from '..';
import { dropout } from './dropout';

describe('dropout', () => {

  it('Basic dropout', () => {
    const beforeDropout =
      gtensor.makeRange('input', 1, 5, 1, 'float32');
    const afterDropout = dropout(0.5, beforeDropout, false, 0);
    afterDropout.tensor.print();

    tf.test_util.expectArraysClose(afterDropout.tensor.dataSync(),
      [2, 4, 0, 8]);
    expect(afterDropout.dimNames).toEqual(
      ['input']);
  });

  it('Deterministic output', () => {
    const beforeDropout =
      gtensor.makeRange('input', 1, 5, 1, 'float32');
    const afterDropout = dropout(0.5, beforeDropout, true, 0);
    afterDropout.tensor.print();

    tf.test_util.expectArraysClose(afterDropout.tensor.dataSync(),
      [1, 2, 3, 4]);
    expect(afterDropout.dimNames).toEqual(
      ['input']);
  });

  it('Dropout with noise shape ', () => {
    const beforeDropout = new gtensor.GTensor(
        tf.tensor([
          [
            [1, 2, 3, 4],
            [5, 6, 7, 8],
            [9, 10, 11, 12],
          ]
        ]),
        ['batch', 'pos', 'inputRep']
      );
    const afterDropout = dropout(0.5, beforeDropout, false, 1, ['pos']);
    afterDropout.tensor.print();

    tf.test_util.expectArraysClose(afterDropout.tensor.dataSync(),
    [
        [
          [2, 4, 6, 8],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]
      ]);
    expect(afterDropout.dimNames).toEqual(
      ['batch', 'pos', 'inputRep']);
  });

  // TODO(@aliciafmachado): Test that grads are not applied on de-activated neurons.
});