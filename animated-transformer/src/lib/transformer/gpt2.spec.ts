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
import * as gpt2 from './gpt2';
import { prepareBasicTaskTokenRep, BasicTaskTokenRep } from '../tokens/token_gemb';
import * as jstree from '../js_tree/js_tree';
import r50k_base from "gpt-tokenizer/esm/encoding/r50k_base";
import { makeRandomStream } from '../random/random';
import { generate } from 'rxjs';

function generateTestTask(): BasicTaskTokenRep {
  // The vocabulary size for GPT2 is 50257. However, the prepareBasicTaskToken adds four
  // additional tokens, so we need to set 50257 - 4 dummy tokens for reproducing the vocab
  // size of GPT2.
  const tokens = Array(50257 - 4).fill("test");
  // The BasicTaskTokenRep below is not valid but it's fine since we are just checking the
  // number of parameters.
  return prepareBasicTaskTokenRep(tokens);
}

function generateTestGPT2Config(): gpt2.Config {
  // Set dummy transformer for testing.
  const embeddingSize = 2;
  const posEmbeddings = 3;
  const nHeads = 1;
  const layerConfig: gpt2.TransformerParamLayerSpec = {
    nHeads: nHeads,
    layerNormPreAttention: false,
    layerNormHeadsProjection: false,
    addLayerNormBias: false,
    computeSpec: { residuals: true, dropoutRate: 0, layerNormEpsilon: 1e-5 },
  };
  const spec: gpt2.TransformerParamSpec = {
    inputRep: embeddingSize,
    kqvRep: embeddingSize / nHeads,
    layers: Array(nHeads).fill(layerConfig),
    computeSpec: {
      dropoutRate: 0.0,
      layerNormEpsilon: 1e-5
    },
    posEncodingSeqLength: posEmbeddings,
    layerNorm: false,
    addLayerNormBias: false,
    addPosEmbeddings: true,
  };
  const config: gpt2.Config = {
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

  return config;
}

describe('GTensor Transformers', () => {
  it('Check number of parameters on GPT2 head', () => {
    const gpt2Model: gpt2.Config = gpt2.defaultGPT2EvalConfig(generateTestTask(), false);
    const params = gpt2.initDecoderParams(gpt2Model);

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
    const gpt2Model: gpt2.Config = gpt2.defaultGPT2EvalConfig(generateTestTask(), false);
    const params = gpt2.initDecoderParams(gpt2Model);

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
    const config: gpt2.Config = generateTestGPT2Config();
    const params = gpt2.initDecoderParams(config);
    params.posEmbedding = new GTensor(
      tf.tensor([
        [1, 1],
        [0, 1],
        [1, 0],
      ]),
      ['posId', 'inputRep']
    );
    const model = { params, config }
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
    const result = gpt2.addPosEmbeddings(model, inputExample);
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

  it('GPT2 Tokenization', () => {
    const gpt2Model: gpt2.Config = generateTestGPT2Config();
    // TODO(@aliciafmachado): GPT2 is too big to fit memory locally. Debug where memory might be leaking.
    // const gpt2Model: gpt2.Config = gpt2.defaultGPT2EvalConfig(generateTestTask(), false);
    const params = gpt2.initDecoderParams(gpt2Model);
    const generator = makeRandomStream(0);
    const model: gpt2.TransformerModel = {
      config: gpt2Model,
      params: params,
    };

    const input = ["hello world!", "my name starts with "];
    const result = gpt2.computePredictionWithLoadedTokenizer(
      model, r50k_base.encode, r50k_base.decode, input, generator);

    expect(result.length).toEqual(2);
  });
});
