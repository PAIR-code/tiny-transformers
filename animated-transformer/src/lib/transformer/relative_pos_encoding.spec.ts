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


/* Relative Positional Encoding */
import * as tf from '@tensorflow/tfjs';
import { gtensor } from '..';

describe('relative_pos_encoding', () => {

  it('Basic Relative position encoding', () => {
    const seqLength = 4;

    const posEncoding =
      gtensor.makeRange('pos', -1 * (seqLength * 2 - 1), 0, 1, 'int32');
    // .scalarAdd(tf.scalar(6));

    // const initConfig = {};
    // const posEncoding = makeTruncNormal(
    //   { pos: seqLength * 2 - 1 },
    //   initConfig);

    const keyPos =
      gtensor.makeRange('keyPos', 0, seqLength, 1, 'int32');
    const queryPos =
      gtensor.makeRange('queryPos', 0, seqLength, 1, 'int32');
    const keyPosBCast = keyPos.broadcastToCombinedShape(queryPos);
    const queryPosBCast = queryPos.broadcastToCombinedShape(keyPos);
    const posIndexes = keyPosBCast.pointwiseAdd(queryPosBCast);
    // .mergeDims(['queryPosIdx', 'queryPosIdx'], 'indexes');
    const posMatrix = posEncoding.gather(posIndexes, 'pos');
    posMatrix.tensor.print();

    tf.test_util.expectArraysClose(posMatrix.tensor.dataSync(),
      [[-7, -6, -5, -4],
      [-6, -5, -4, -3],
      [-5, -4, -3, -2],
      [-4, -3, -2, -1]]);
    expect(posMatrix.dimNames).toEqual(
      ['keyPos', 'queryPos']);
  });
});
