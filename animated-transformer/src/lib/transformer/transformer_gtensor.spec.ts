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

import { GTensor } from '../gtensor/gtensor';
import * as transformer from './transformer_gtensor';
import * as tf from '@tensorflow/tfjs';
import { makeRandomStream } from '../random/random';

describe('GTensor Transformers', () => {
  it('basic transformer shapes', () => {
    const spec: transformer.AttnHeadComputeSpec = {
      residuals: true,
      dropoutRate: 0.0,
    };
    const paramSizes: transformer.AttnHeadParamSpec = {
      inputRep: 2,
      kq: 3,
      heads: 1,
      value: 4,
      layerNormHeadsProjection: true,
      layerNormFF: true,
      addLayerNormBias: false,
    };
    const params = transformer.initAttnHeadParams(paramSizes);
    const inputExample1 = new GTensor(
      tf.tensor([
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      ]),
      ['batch', 'pos', 'inputRep'],
    );
    const generator = makeRandomStream(0);
    const parts = transformer.computeAttnHead(spec, params, inputExample1, generator);
    expect(parts.attendedValues.dimNames).toEqual(
      jasmine.arrayContaining(['batch', 'heads', 'value', 'pos']),
    );
    expect(parts.attendedValues.gshape()).toEqual({
      batch: 1,
      heads: 1,
      value: 4,
      pos: 3,
    });
  });
});
