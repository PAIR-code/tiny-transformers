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


import * as tf from '@tensorflow/tfjs'
import { contract, ContractSpec } from './contract';

describe('contract', () => {
  beforeEach(() => { });

  it('SimpleContractSpec', () => {
    const spec = new ContractSpec(
      ['batch', 'example', 'pointId'], ['batch', 'pointId', 'outRep'],
      ['pointId']);

    expect(spec.einsumContractStr()).toEqual('ABC,ACD->ABD');
    expect(spec.einsumCocontractStrs()).toEqual(['ACD,ABD->ABC', 'ABC,ABD->ACD']);
  });

  it('Simple contraction', () => {
    // {example: 4, pointId: 4}
    const a = tf.tensor(
      [[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]]);

    // {pointId: 4, outRep: 1}
    const b = tf.tensor([[0], [1], [1], [0]]);

    const spec = new ContractSpec(
      ['example', 'pointId'], ['pointId', 'outRep'],
      ['pointId']);

    const c = contract(a, b, spec);

    tf.test_util.expectArraysClose(
      c.arraySync(), [[0], [1], [1], [0]]);

    expect(c.shape).toEqual([4, 1]);
  });

  it('Simple contract gradient', () => {
    // {example: 4, pointId: 4}
    const a = tf.tensor(
      [[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]]);

    // {pointId: 4, outputRepSize: 1}
    const b = tf.tensor([[0], [1], [1], [0]]);

    const spec = new ContractSpec(
      ['example', 'pointId'], ['pointId', 'outRep'],
      ['pointId']);

    const dy = [[0], [2], [2], [-2]];

    const gradients = tf.grads((xa, xb) =>
      contract(xa, xb, spec))([a, b], dy);

    tf.test_util.expectArraysClose(
      gradients[0].arraySync(),
      [[0, 0, 0, 0], [0, 2, 2, 0], [0, 2, 2, 0], [0, -2, -2, 0]]
    );
    tf.test_util.expectArraysClose(
      gradients[1].arraySync(),
      [[0], [2], [2], [-2]]);

    expect(gradients.length).toBe(2);
  });

  it('Contraction with shared, uncontracted, batch dim', () => {
    // {batch: 1, example: 4, pointId: 4}
    const a = tf.tensor(
      [[[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]]]);

    // {batch: 1, pointId: 4, outRep: 1}
    const b = tf.tensor([[[0], [1], [1], [0]]]);

    const spec = new ContractSpec(
      ['batch', 'example', 'pointId'], ['batch', 'pointId', 'outRep'],
      ['pointId']);

    const c = contract(a, b, spec);

    tf.test_util.expectArraysClose(
      c.arraySync(), [[[0], [1], [1], [0]]]);

    expect(c.shape).toEqual([1, 4, 1]);
  });

  it('Contraction with on 2 dims', () => {
    // {batch: 1, example: 4, pointId: 4}
    const a = tf.tensor(
      [[[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]]]);

    // {batch: 1, pointId: 4, outRep: 1}
    const b = tf.tensor([[[0], [1], [1], [0]]]);

    const spec = new ContractSpec(
      ['batch', 'example', 'pointId'], ['batch', 'pointId', 'outRep'],
      ['batch', 'pointId']);

    const c = contract(a, b, spec);

    tf.test_util.expectArraysClose(
      c.arraySync(), [[0], [1], [1], [0]]);

    expect(c.shape).toEqual([4, 1]);
  });
});
