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


import { GTensorTree } from './gtensor_tree';
import { AttnHeadParamSpec, initAttnHeadParams } from '../transformer/transformer_gtensor';

describe('param_map', () => {
  beforeEach(() => {
  });

  it('paramTree x.copyFromFlattened(x.flatten) = x', () => {
    const paramSizes: AttnHeadParamSpec = {
      heads: 1,
      inputRep: 2,
      kq: 3,
      value: 4,
      layerNormFF: true,
      layerNormHeadsProjection: true,
      addLayerNormBias: false,
    };
    const params = initAttnHeadParams(paramSizes);

    const paramsTree = new GTensorTree(params);

    const tensors = paramsTree.flatten();
    const remapped = paramsTree.copyFromFlattened(tensors);

    expect(remapped.obj.ff.w.gshape()).toEqual(params.ff.w.gshape());
    expect(remapped.obj.ff.bIn.gshape()).toEqual(params.ff.bIn.gshape());
    expect(remapped.obj.ff.bOut.gshape()).toEqual(params.ff.bOut.gshape());
    expect(remapped.obj.headsToInputRepM.gshape()).toEqual(params.headsToInputRepM.gshape());
    expect(remapped.obj.queryM.gshape()).toEqual(params.queryM.gshape());
    expect(remapped.obj.keyM.gshape()).toEqual(params.keyM.gshape());
    expect(remapped.obj.valueM.gshape()).toEqual(params.valueM.gshape());
  });
});
