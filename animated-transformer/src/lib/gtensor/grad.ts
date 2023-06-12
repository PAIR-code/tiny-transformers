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


import { GTensor, DName, makeTruncNormal, GVariable } from './gtensor';
import { DictArrTree } from '../js_tree/js_tree';
import { GTensorTree, gtensorTrees, GVariableTree } from './gtensor_tree';
import * as tf from '@tensorflow/tfjs';

/**
 * Compute gradient w.r.t. params of a function on gtensors.
 */
export function gradsFunctor<P extends DictArrTree<GTensor<any>>>(
  params: P, loss: () => tf.Scalar
): () => { grads: P, loss: tf.Scalar } {
  // The variables we want to quickly update in the training loop.
  const curParams = params as DictArrTree<GTensor<any>>;
  const tfGradFn = tf.valueAndGrads(loss);
  const gtensorParams = gtensorTrees.flatten(params);
  const paramVarTensors = gtensorParams.map(g => g.tensor);

  return () => {
    const gradAndValue = tfGradFn(paramVarTensors);
    const gradTensors = gradAndValue.grads;
    const gradGTensors = gradTensors.map((t, i) =>
      new GTensor(t, gtensorParams[i].dimNames));
    const grads = gtensorTrees.unflatten(curParams, gradGTensors) as P;
    return { grads, loss: gradAndValue.value };
  };
}

/**
 * Compute gradient w.r.t. params of a function on gtensors.
 */
export function gradsVarTreeFunctor<T>(
  params: GTensorTree<T>,
  loss: () => tf.Scalar
): () => { grads: GTensorTree<T>, loss: tf.Scalar } {
  // The variables we want to quickly update in the training loop.
  const tfGradFn = tf.valueAndGrads(loss);
  const gtensorParams = params.flatten();
  const paramVarTensors = gtensorParams.map(g => g.tensor);

  return () => {
    const gradAndValue = tfGradFn(paramVarTensors);
    const gradGTensors = gradAndValue.grads.map((t, i) =>
      new GTensor(t, gtensorParams[i].dimNames));
    const grads = params.copyFromFlattened(gradGTensors);
    return { grads, loss: gradAndValue.value };
  };
}

/**
 * Compute gradient w.r.t. params of a function on gtensors.
 */
export function computeLossAndGrads<T>(
  params: GTensorTree<T>,
  loss: (params: T) => GTensor<never>
): { grads: GTensorTree<T>, loss: tf.Scalar } {
  // The variables we want to quickly update in the training loop.
  const tfGradFn = tf.valueAndGrads(
    () => loss(params.obj).tensor as tf.Scalar);

  const gtensorParams = params.flatten();
  const paramVarTensors = gtensorParams.map(g => g.tensor);
  const gradAndValue = tfGradFn(paramVarTensors);
  const gradGTensors = gradAndValue.grads.map((t, i) =>
    new GTensor(t, gtensorParams[i].dimNames));
  const grads = params.copyFromFlattened(gradGTensors);
  return { grads, loss: gradAndValue.value };
}
