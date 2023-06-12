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


import * as grad from './grad';
import { GTensor, DName, makeTruncNormal, GVariable } from './gtensor';
import { Dims, gtensorOfDims } from './gtensor';
import * as tf from '@tensorflow/tfjs';
import { gtensorTrees } from './gtensor_tree';
import { gradsFunctor } from './grad';
import * as jstree from '../js_tree/js_tree';

type ParamShape = {
  a: GTensor<'rep'>,
  b: GTensor<'rep'>
}

describe('grad', () => {
  it('gradsFunctor', async () => {
    // const scalarLr = tf.scalar(0.5);
    const initParams: ParamShape = {
      a: new GTensor(tf.tensor1d([1, 1], 'float32'), ['rep']),
      b: new GTensor(tf.tensor1d([1, 1], 'float32'), ['rep']),
    };
    const paramVars =
      gtensorTrees.map(initParams, t => new GVariable(t)) as never as ParamShape;

    const batchInput = {
      inputs: new GTensor(
        tf.tensor2d(
          [[1, 2], [2, 1]], [2, 2], 'float32'),
        ['batchExample', 'rep']),
      targets: new GTensor(
        tf.tensor1d([2.5, 2], 'float32'), ['batchExample']),
    }

    const batchSizeScalar = tf.scalar(batchInput.targets.dim.batchExample.size);
    // The variables we want to quickly update in the training loop.
    const inputVars = new GVariable(batchInput.inputs, false);
    const targetVars = new GVariable(batchInput.targets, false);

    function tfLoss(): tf.Scalar {
      const aDot = inputVars.contract(paramVars.a, ['rep'])
      const bDot = inputVars.contract(paramVars.b, ['rep'])
      const delta = targetVars.pointwiseSub(aDot.pointwiseMul(bDot));
      const loss = delta.pointwiseMul(delta).sumOverDims(['batchExample']);
      loss.tensor.print();
      return loss.tensor as tf.Scalar;
    }
    const gradFn = gradsFunctor(paramVars,
      // {
      //   inputs: inputVars,
      //   targets: targetVars,
      //   params: paramVars
      // },
      tfLoss);

    // inputVars.assign(batch.inputs);
    // targetVars.assign(batch.targets);
    const gradAndLossValue = gradFn();
    const lastPerExampleLoss = tf.div(gradAndLossValue.loss, batchSizeScalar);
    // console.log(`per example loss: ${lastPerExampleLoss.dataSync()}`);

    expect(lastPerExampleLoss.dataSync()[0]).toEqual(45.625);
  });

});
