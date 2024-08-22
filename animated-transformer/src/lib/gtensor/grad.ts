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
import * as jstree from '../js_tree/js_tree';
import { DictArrTree } from '../js_tree/js_tree';
import * as tf from '@tensorflow/tfjs';

/**
 * Compute gradient w.r.t. params of a function on gtensors.
 */
export function gradsFunctor<Params extends DictArrTree<GTensor<any>>>(
  params: Params,
  loss: () => tf.Scalar
): () => { grads: Params; loss: tf.Scalar } {
  // The variables we want to quickly update in the training loop.
  // const curParams = params as DictArrTree<GTensor<any>>;
  const tfGradFn = tf.valueAndGrads(loss);
  const gtensorParams = jstree.flatten(params) as GTensor<any>[];
  const paramVarTensors = gtensorParams.map((g) => g.tensor);

  return () => {
    const gradAndValue = tfGradFn(paramVarTensors);
    const gradGTensors = gradAndValue.grads.map(
      (t, i) => new GTensor(t, gtensorParams[i].dimNames)
    );
    const grads = jstree.unflatten(params, gradGTensors as jstree.LeafOf<Params>[]) as Params;
    return { grads, loss: gradAndValue.value };
  };
}

/**
 * Compute gradient w.r.t. params of a function on gtensors.
 * Almost identical to above, but uses slightly more efficient copyFromFlattened.
 */
export function gradsVarTreeFunctor<Params extends DictArrTree<GTensor<any>>>(
  params: Params,
  loss: () => tf.Scalar
): () => { grads: Params; loss: tf.Scalar } {
  // The variables we want to quickly update in the training loop.
  const tfGradFn = tf.valueAndGrads(loss);
  const gtensorParams = jstree.flatten(params) as GTensor<any>[];
  const paramVarTensors = gtensorParams.map((g) => g.tensor);

  return () => {
    const gradAndValue = tfGradFn(paramVarTensors);
    const gradGTensors = gradAndValue.grads.map(
      (t, i) => new GTensor(t, gtensorParams[i].dimNames)
    );
    const grads = jstree.copyFromFlattened(params, gradGTensors) as Params;
    return { grads, loss: gradAndValue.value };
  };
}

/**
 * Compute gradient w.r.t. params of a function on gtensors.
 */
export function computeLossAndGrads<Params extends DictArrTree<GTensor<any>>>(
  params: Params,
  loss: (params: Params) => GTensor<never>
): { grads: Params; loss: tf.Scalar } {
  // The variables we want to quickly update in the training loop.
  const tfGradFn = tf.valueAndGrads(() => loss(params).tensor as tf.Scalar);
  const gtensorParams = jstree.flatten<GTensor<any>>(params);
  const paramVarTensors = gtensorParams.map((g) => g.tensor);
  const gradAndValue = tfGradFn(paramVarTensors);
  const gradGTensors = gradAndValue.grads.map((t, i) => new GTensor(t, gtensorParams[i].dimNames));
  const grads = jstree.copyFromFlattened(params, gradGTensors) as Params;
  return { grads, loss: gradAndValue.value };
}
