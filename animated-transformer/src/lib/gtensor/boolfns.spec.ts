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


import * as gtensor from './gtensor';
import * as tf from '@tensorflow/tfjs'
import { pointWiseEval } from './boolfns';
import * as gtensor_util from './gtensor_util';
import { xorGTensorDataset, TwoVarGTensorDataset } from './the_16_two_var_bool_fns';

describe('boolfns', () => {
  let paramPositions: gtensor.GTensor<'pointId' | 'inputRepSize'>;

  beforeEach(() => {
    paramPositions = new gtensor.GTensor(
      tf.tensor([[0, 0], [0, 1], [1, 0], [1, 1]]),
      ['pointId', 'inputRepSize']);
  });

  it('pointWiseEval on grid', () => {
    // Making a GTensor with an initializer:
    const grid = new gtensor.GTensor(
      tf.tensor(gtensor_util.grid([0, 0], [1, 1], [0.5, .5])),
      ['example', 'inputRepSize']);

    const xorParams = new gtensor.GTensor(
      tf.tensor([[0], [1], [1], [0]]), ['pointId', 'outputRepSize']);

    const outputPoints = pointWiseEval(xorParams, paramPositions, grid);

    expect(() => tf.test_util.expectArraysClose(
      outputPoints.tensor.dataSync(),
      [
        [0], [0.5], [1],
        [0.5], [0.5], [0.5],
        [1], [0.5], [0],
      ])).not.toThrow();
  });

  it('pointWiseEval xor on xorDataset', () => {
    // Making a GTensor with an initializer:
    const xorParams = new gtensor.GTensor(
      tf.tensor([[0], [1], [1], [0]]), ['pointId', 'outputRepSize']);

    const outputPoints = pointWiseEval(xorParams, paramPositions, xorGTensorDataset.inputs);

    expect(() => tf.test_util.expectArraysClose(
      outputPoints.tensor.dataSync(),
      xorGTensorDataset.outputs.tensor.dataSync())).not.toThrow();
  });

  // it('pointWiseEval xor on xorDataset', () => {
  //   // Making a GTensor with an initializer:
  //   const xorParams = new gtensor.GTensor(
  //     tf.tensor([[0], [1], [1], [0]]), ['pointId', 'outputRepSize']);

  //   const outputPoints = pointWiseEval(xorParams, paramPositions, xorGTensorDataset.inputs);

  //   expect(() => tf.test_util.expectArraysClose(
  //     outputPoints.tensor.dataSync(),
  //     xorGTensorDataset.outputs.tensor.dataSync())).toThrow();
  // });

  // it('pointWiseEval xor on xorDataset', () => {
  //   // Note: not really editable; pointWise eval assumes these are at corner
  //   // points of the space's dimensions.
  //   const paramPositions = [[0, 0], [1, 0], [0, 1], [1, 1]];
  //   //
  //   const resolution = 2;

  //   const inputs = new gtensor.GTensor(
  //     tf.tensor(gtensor_util.grid(
  //       [0, 0], [1, 1], [1 / resolution, 1 / resolution])),
  //     ['example', 'inputRepSize']);
  //   const paramValues = new gtensor.GTensor(
  //     tf.tensor([ [0], [1], [1], [0] ]), ['pointId', 'outputRepSize']);

  //   const outValues = softVoronoiEval(params, positions,
  //     examplesGrid);


  //   console.log('inputs', inputs.tensor.toString());
  //   console.log('paramPositions', paramPositions.tensor.toString());

  //   const invId = new gtensor.GTensor(
  //     tf.eye(paramValues.dim.pointId.size, paramValues.dim.pointId.size),
  //     ['pointId', 'pointId2']).scalarSubFrom(tf.scalar(1));
  //   console.log('invId', invId.tensor.toString());
  //   const invIdParams = paramValues.pointwiseMul(invId);
  //   console.log('invIdParams', invIdParams.tensor.toString());
  //   const pointwiseSqrdDifference = inputs.squaredDifference(paramPositions);
  //   console.log('pointwiseSqrdDifference', pointwiseSqrdDifference.tensor.toString());
  //   const sqrdDistance = pointwiseSqrdDifference.sumOverDims(['inputRepSize']);
  //   console.log('sqrdDistance', sqrdDistance.tensor.toString());
  //   const valMult = sqrdDistance.pointwiseMul(invIdParams);
  //   console.log('valMult', valMult.tensor.toString());
  // });

});
