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

// gtensor.spec.ts
import { GTensor, makeScalar, makeConstant, makeRange } from './gtensor';
import { layerNorm } from './layer_norm';
import * as tf from '@tensorflow/tfjs';
import { computeLossAndGrads } from './grad';

describe('layer_norm', () => {
  beforeEach(() => {});

  it('Simple Layer Norm', () => {
    const epsilonNum = 1e3;
    const gain = makeScalar(1, 'float32');
    const bias = makeScalar(0, 'float32');
    const epsilon = makeScalar(epsilonNum, 'float32');
    const g = new GTensor(
      tf.tensor2d(
        [
          [1, 1, 1], // mean = 1, std = 0
          [1, 2, 3], // mean = 2, std = sqrt(2)
          [2, 4, 12], // mean = 18 / 3 = 6, std = Math.sqrt(4^2 + 2^2 + 6^2)
        ],
        [3, 3],
        'float32'
      ),
      ['pos', 'rep']
    );

    const varSqrd3 = ((2 - 6) ^ (2 + (4 - 6)) ^ (2 + (12 - 6)) ^ 2) / 3;
    const approxStdDev3 = Math.sqrt(varSqrd3 + epsilonNum);

    const gNormed = layerNorm({ gain, bias, epsilon }, g, 'rep');

    // console.log(gNormed.dimNames);
    tf.test_util.expectArraysClose(gNormed.transposeTo(['pos', 'rep']).tensor.dataSync(), [
      [0, 0, 0],
      [-1, 0, 1].map((x) => x / Math.sqrt(2 + 1e3)),
      [-4, -2, 6].map((x) => x / approxStdDev3),
    ]);

    expect(gNormed.gshape()).toEqual({ pos: 3, rep: 3 });
  });

  it('Multi-dimensional Layer Norm', () => {
    const layerNormDim = 3;
    const epsilonNum = 1e3;
    const gain = makeConstant({"pos": layerNormDim}, 1);
    const bias = makeRange("pos", 0, 3, 1);
    const epsilon = makeScalar(epsilonNum, 'float32');
    const g = new GTensor(
      tf.tensor2d(
        [
          [1, 1, 1], // mean = 1, std = 0
          [1, 2, 3], // mean = 2, std = sqrt(2)
          [2, 4, 12], // mean = 18 / 3 = 6, std = Math.sqrt(4^2 + 2^2 + 6^2)
        ],
        [3, 3],
        'float32'
      ),
      ['pos', 'rep']
    );

    const varSqrd3 = ((2 - 6) ^ (2 + (4 - 6)) ^ (2 + (12 - 6)) ^ 2) / 3;
    const approxStdDev3 = Math.sqrt(varSqrd3 + epsilonNum);

    const gNormed = layerNorm({ gain, bias, epsilon }, g, 'rep');

    tf.test_util.expectArraysClose(gNormed.transposeTo(['pos', 'rep']).tensor.dataSync(), [
      [0, 0, 0],
      [-1, 0, 1].map((x) => x / Math.sqrt(2 + 1e3)).map((x) => x + 1),
      [-4, -2, 6].map((x) => x / approxStdDev3).map((x) => x + 2),
    ]);

    expect(gNormed.gshape()).toEqual({ pos: 3, rep: 3 });
  });

  it('Layer Norm grad', () => {
    const epsilonNum = 1e3;
    const gain = makeScalar(1, 'float32');
    const bias = makeScalar(0, 'float32');
    const epsilon = makeScalar(epsilonNum, 'float32');
    const g = new GTensor(
      tf.tensor2d(
        [
          [1, 1, 1], // mean = 1, std = 0
          [1, 2, 3], // mean = 2, std = sqrt(2)
          [2, 4, 12], // mean = 18 / 3 = 6, std = Math.sqrt(4^2 + 2^2 + 6^2)
        ],
        [3, 3],
        'float32'
      ),
      ['pos', 'rep']
    );

    const gNormed = layerNorm({ gain, bias, epsilon }, g, 'rep');
    const gTarget = new GTensor(
      tf.tensor2d(
        [
          [1, 1, 1], // mean = 1, std = 0
          [1, 1, 1], // mean = 2, std = sqrt(2)
          [1, 1, 1], // mean = 18 / 3 = 6, std = Math.sqrt(4^2 + 2^2 + 6^2)
        ],
        [3, 3],
        'float32'
      ),
      ['pos', 'rep']
    );

    const lossAndGrads = computeLossAndGrads(
      { p: gNormed },
      (params: { p: GTensor<'pos' | 'rep'> }) => {
        return gTarget.squaredDifference(params.p).sumOverDims(['pos', 'rep']);
      }
    );

    // console.log(gNormed.dimNames);
    tf.test_util.expectArraysClose(lossAndGrads.grads.p.tensor.dataSync(), [
      [-2, -2.0632245540618896, -2.2506535053253174],
      [-2, -2, -2.1253268718719482],
      [-2, -1.9367755651474, -1.6240196228027344],
    ]);
  });

  // TODO: need to add test for gradients for this. Pretty sure then don't work.
});
