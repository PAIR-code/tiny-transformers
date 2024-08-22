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

import {
  TensorOrVarKind,
  TensorKind,
  GTensor,
  GTensorOrVar,
  makeScalar,
  VariableKind,
} from './gtensor';

export type LayerNormParams<T extends TensorOrVarKind> = {
  gain: GTensorOrVar<T, never>;
  bias?: GTensorOrVar<T, never>;
  epsilon: GTensorOrVar<T, never>;
} & {};
// & {} is workaround for https://github.com/microsoft/TypeScript/issues/48070
type WorkAroundMakesThisTrue = LayerNormParams<VariableKind> extends LayerNormParams<TensorKind>
  ? true
  : false;
// These are needed to get workaround to function accross files.
export type VarLayerNormParams = LayerNormParams<VariableKind>;
export type TensorLayerNormParams = LayerNormParams<TensorKind>;

export function initLayerNormParams(
  includeBias: boolean,
  epsilon = 1e5
): LayerNormParams<TensorKind> {
  const layerNormParams: LayerNormParams<TensorOrVarKind> = {
    gain: makeScalar(1.0, 'float32'),
    epsilon: makeScalar(epsilon, 'float32'),
  };
  if (includeBias) {
    layerNormParams.bias = makeScalar(0, 'float32');
  }
  return layerNormParams;
}

export function layerNorm<G extends string, D extends G>(
  layerNormParams: LayerNormParams<TensorOrVarKind>,
  g: GTensor<G>,
  dim: D
): GTensor<G> {
  const { gain, bias, epsilon } = layerNormParams;
  const repSizeScalar = makeScalar(g.dim[dim].size, 'float32');
  const mean = g.sumOverDims([dim]).scalarDiv(repSizeScalar);
  const varianceSquared = g
    .pointwiseSub(mean)
    .squared()
    .sumOverDims([dim])
    .scalarDiv(repSizeScalar);
  const meanAndVarNormalized = g
    .pointwiseSub(mean)
    .pointwiseDiv(varianceSquared.scalarAdd(epsilon).sqrt());
  const scaledNorm = meanAndVarNormalized.scalarMul(gain);
  if (!bias) {
    return scaledNorm;
  }
  return scaledNorm.scalarAdd(bias);
}
