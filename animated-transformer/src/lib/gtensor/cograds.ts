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


import * as tf from '@tensorflow/tfjs';
import {Prod, ProdAttrs} from '@tensorflow/tfjs';
import {GradConfig, NamedAttrMap} from '@tensorflow/tfjs';
import {Tensor} from '@tensorflow/tfjs';

export const prodGradConfig: GradConfig = {
  kernelName: Prod,
  inputsToSave: ["x"],
  outputsToSave: [true],
  gradFunc: (dy: Tensor | Tensor[], saved: Tensor[], attrs: NamedAttrMap) => {
    const [x, y] = saved;
    const expandedYShape = x.shape.slice();
    const { axis } = (attrs as {}) as ProdAttrs;
    const axes = tf.util.parseAxisParam(axis, x.shape);
    axes.forEach((axis) => {
      expandedYShape[axis] = 1;
    });
    const expandedY = tf.reshape(y, expandedYShape);
    const expandedDy = tf.reshape(dy as Tensor, expandedYShape);
    const xFrac = tf.mul(
      expandedDy,
      tf.div(tf.ones(x.shape, "float32"), expandedY)
    );
    return { x: () => tf.mul(x, xFrac) };
  }
};

tf.registerGradient(prodGradConfig);
