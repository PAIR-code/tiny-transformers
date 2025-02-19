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

import { GTensor, makeConstant, makeScalar, DName } from './gtensor';

export type LayerNormParams<D extends DName = never> = {
  gain: GTensor<D>;
  bias?: GTensor<D>;
};

export function initLayerNormParams(
  includeBias: boolean
): LayerNormParams {
  const layerNormParams: LayerNormParams = {
    gain: makeScalar(1.0, 'float32'),
  };
  if (includeBias) {
    layerNormParams.bias = makeScalar(0, 'float32');
  }
  return layerNormParams;
}

export function initLayerNormParamsWithDims<T extends string>(
  includeBias: boolean,
  dims: { [key in T]: number }
): LayerNormParams<T> {
  const layerNormParams: LayerNormParams<T> = {
    gain: makeConstant(dims, 1.0, 'float32'),
  }

  if (includeBias) {
    layerNormParams.bias = makeConstant(dims, 0, 'float32');
  }
  return layerNormParams;
}

export function layerNorm<G extends string, D extends G, T extends G = never>(
  layerNormParams: LayerNormParams<T>,
  g: GTensor<G>,
  dim: D,
  eps?: GTensor<never>
): GTensor<G> {
  if (!eps) {
    eps = makeScalar(1e-5, 'float32');
  }
  const { gain, bias } = layerNormParams;
  const repSizeScalar = makeScalar(g.dim[dim].size, 'float32');
  const mean = g.sumOverDims([dim]).scalarDiv(repSizeScalar);
  const varianceSquared = g
    .pointwiseSub(mean)
    .squared()
    .sumOverDims([dim])
    .scalarDiv(repSizeScalar);
  const meanAndVarNormalized = g
    .pointwiseSub(mean)
    .pointwiseDiv(varianceSquared.scalarAdd(eps).sqrt());
  const scaledNorm = meanAndVarNormalized.pointwiseMul(gain);
  if (!bias) {
    return scaledNorm;
  }
  return scaledNorm.pointwiseAdd(bias);
}
