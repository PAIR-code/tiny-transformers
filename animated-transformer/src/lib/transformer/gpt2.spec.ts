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
import * as tf from '@tensorflow/tfjs';
import * as transformer from './gpt2';
import { BasicTaskTokenRep } from '../tokens/token_gemb';
import * as jstree from '../js_tree/js_tree';

function generateTestTask(): BasicTaskTokenRep {
  const tokens = Array(50257).fill("test");
    // The BasicTaskTokenRep below is not valid but it's fine since we are just checking the
    // number of parameters.
    const tokenRep: BasicTaskTokenRep = {
        maskToken: "test", 
        padToken: "test", 
        eosToken: "test", 
        tokens: tokens, 
        tokenToIdx: {},
    };
    return tokenRep;
}

describe('GTensor Transformers', () => {
  it('Check number of parameters on GPT2 head', () => {
    const gpt2: transformer.TransformerConfig = transformer.defaultGPT2EvalConfig(generateTestTask());
    const params = transformer.initDecoderParams(gpt2);
  
    // Compute number of parameters in the head.
    const paramCount = jstree.reduce<GTensor<any>, number>(
      (count, paramObj) => count + paramObj.tensor.size,
      0,
      params.layers[0]
    );

    // Check head size.
    expect(paramCount).toEqual(7087872);
  });

  it('Check number of parameters on GPT2', async () => {
    const gpt2: transformer.TransformerConfig = transformer.defaultGPT2EvalConfig(generateTestTask());
    const params = transformer.initDecoderParams(gpt2);

    // Compute number of parameters in GPT2.
    const paramCountGPT2 = jstree.reduce<GTensor<any>, number>(
      (count, paramObj) => count + paramObj.tensor.size,
      0,
      params
    );

    // Check full GPT2 size.
    expect(paramCountGPT2).toEqual(124439808);
  });

  it('Test positional embeddings.', async () => {
    // Set dummy transformer for testing.
    const embedding_size = 2;
    const pos_embeddings = 3;
    const n_heads = 1;
    const layer_config: transformer.TransformerParamLayerSpec = {
      nHeads: n_heads,
      layerNormPreAttention: false,
      layerNormHeadsProjection: false,
      addLayerNormBias: false,
      computeSpec: { residuals: true, dropoutRate: 0, layerNormEpsilon: 1e-5 },
    };
    const spec: transformer.TransformerParamSpec = {
      inputRep: embedding_size,
      kqvRep: embedding_size / n_heads,
      layers: Array(n_heads).fill(layer_config),
      computeSpec: {
          dropoutRate: 0.0,
          layerNormEpsilon: 1e-5
      },
      posEncodingSeqLength: pos_embeddings,
      layerNorm: false,
      addLayerNormBias: false,
      addPosEmbeddings: true,
    };
    const config: transformer.TransformerConfig = {
      id: 'GPT2Eval',
      kind: 'Transformer',
      spec: spec,
      tokenRep: generateTestTask(),
      init: {
        stddev: 0.05, // default
        mean: 0,
        seed: 42,
      },
    };
    const params = transformer.initDecoderParams(config);
    params.posEmbedding = new GTensor(
      tf.tensor([
          [1, 1],
          [0, 1],
          [1, 0],
      ]),
      ['posId', 'inputRep']
    );
    const model = {params, config}
    const inputExample = new GTensor(
          tf.tensor([
            [
              [1, 2],
              [3, 4],
              [5, 6],
            ],
            [
              [1, 2],
              [3, 4],
              [5, 6],
            ],
          ]),
          ['batch', 'pos', 'inputRep']
        );
    const result = transformer.addPosEmbeddings(model, inputExample);
    tf.test_util.expectArraysClose(result.tensor.dataSync(), [
        [
          [2, 3],
          [3, 5],
          [6, 6],
        ],
        [
          [2, 3],
          [3, 5],
          [6, 6],
        ],
      ])
  });
});
