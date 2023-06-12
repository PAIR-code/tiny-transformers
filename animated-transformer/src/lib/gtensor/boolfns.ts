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
import { Dims, gtensorOfDims } from './gtensor';
import * as tf from '@tensorflow/tfjs';
// import { xorGTensorDataset, TwoVarGTensorDataset } from './the_16_two_var_bool_fns';

//
const NUM_INPUT_DIMS = 2;
// One point for every corner of the input dim space. i.e. 2^NUM_INPUT_DIMS
// corner points.
const NUM_POINTS = 2 ** NUM_INPUT_DIMS;

// One floating point per point ID. One point ID for each cardinal position.
export const params = gtensor.makeTruncNormal(
  { pointId: NUM_POINTS, outputRepSize: 1 });

// export const paramPositions: gtensor.GTensor<'pointId' | 'inputRepSize'> =
//   new gtensor.GTensor(
//     tf.tensor([[0, 0], [0, 1], [1, 0], [1, 1]]),
//     ['pointId', 'inputRepSize']);

// Output values for each example are a mixture of pointId values,
// proportional to inv squared distance to each pointId's value.
//
// This creates the Voronoi-like diagram.
export function pointWiseEval(
  paramValues: gtensor.GTensor<'pointId' | 'outputRepSize'>,
  paramPositions: gtensor.GTensor<'pointId' | 'inputRepSize'>,
  inputs: gtensor.GTensor<'example' | 'inputRepSize'>
): gtensor.GTensor<'example' | 'outputRepSize'> {
  // console.log('paramPositions', paramPositions.tensor.toString());
  // console.log('inputs', inputs.tensor.toString());
  const pointwiseDifferences = inputs.squaredDifference(paramPositions);
  // console.log('pointwiseDifferences', pointwiseDifferences.tensor.toString());
  const invPointwiseDifferences = pointwiseDifferences._tfScalarSubFrom(tf.scalar(1));
  // console.log('invPointwiseDifferences', invPointwiseDifferences.tensor.toString());
  const prodOfInvDifferences = invPointwiseDifferences.prodOverDims(['inputRepSize']);
  // console.log('prodDistances', prodOfInvDifferences.tensor.toString());
  const UnnormedFinalValues = prodOfInvDifferences.contract(paramValues, ['pointId']);
  // console.log('UnnormedFinalValues', prodOfInvDifferences.tensor.toString());
  const perExampleProdNorm = prodOfInvDifferences.sumOverDims(['pointId']);
  // console.log('perExampleProdNorm', perExampleProdNorm.tensor.toString());
  return UnnormedFinalValues.pointwiseDiv(perExampleProdNorm);
}

export function pointwiseGrad(
  paramValues: gtensor.GTensor<'pointId' | 'outputRepSize'>,
  paramPositions: gtensor.GTensor<'pointId' | 'inputRepSize'>,
  inputs: gtensor.GTensor<'example' | 'inputRepSize'>,
  outputs: gtensor.GTensor<'example' | 'outputRepSize'>
): gtensor.GTensor<'pointId' | 'outputRepSize'> {

  function tfloss(t: tf.Tensor): tf.Tensor {
    const evalOutputs = pointWiseEval(
      new gtensor.GTensor(t, paramValues.dimNames), paramPositions, inputs);
    const diff = evalOutputs.squaredDifference(outputs).sumOverDims(
      ['outputRepSize', 'example']);
    return diff.tensor;
  }
  const gradFn = tf.grad(tfloss);
  const gradTensor = gradFn(paramValues.tensor);
  return new gtensor.GTensor(gradTensor, ['pointId', 'outputRepSize']);
}

// export function softVoronoiEval(
//   paramValues: gtensor.GTensor<'pointId' | 'outputRepSize'>,
//   paramPositions: gtensor.GTensor<'pointId' | 'inputRepSize'>,
//   inputs: gtensor.GTensor<'example' | 'inputRepSize'>
// ): gtensor.GTensor<'example' | 'outputRepSize'> {
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

//   // const scaledValues = paramValues.dot(valMult, 'pointId');
//   // console.log('scaledValues', scaledValues.tensor.toString());
//   // const norms = invIdParams.dot(sqrdDistance, 'pointId');
//   // console.log('norms', norms.tensor.toString());
//   // const norm = norms.sumOverDims(['pointId2']);
//   // console.log('norm', norm.tensor.toString());
//   // const value = scaledValues.pointwiseDiv(norm);
//   // console.log('value', value.tensor.toString());
//   // return value;
// }
