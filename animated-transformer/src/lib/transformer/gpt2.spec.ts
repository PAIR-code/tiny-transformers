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

import { GTensor, makeTruncNormal } from '../gtensor/gtensor';
import * as transformer from './gpt2';
import { AttnHeadParamSpec, AttnHeadComputeSpec } from './gpt2';
import * as tf from '@tensorflow/tfjs';
import * as abtask from '../seqtasks/ab_task';
import { BasicTaskTokenRep, embedBatch, prepareBasicTaskTokenRep } from '../tokens/token_gemb';
import { makeRandomStream } from '../random/random';
import* as jstree from '../js_tree/js_tree';

describe('GTensor Transformers', () => {
  it('basic transformer shapes', () => {
    // const paramSizes: AttnHeadParamSpec = {
    //     inputRep: 1024,
    //     hiddenRep: 784,
    //     kq: 784, // same nb as value i think
    //     heads: 12,
    //     value: 784,
    //     layerNormHeadsProjection: true, // need to change this to follow the implementation
    //     layerNormFF: true,
    //     addLayerNormBias: true,
    // };
    
    // 12 Heads.
    const n_heads = 12;
    const embedding_size = 768;
    const transformer_param_layer_spec: transformer.TransformerParamLayerSpec = {
        nHeads: n_heads,
        computeSpec: { residuals: true, dropoutRate: 0.0, layerNormEpsilon: 1e-5 },
        layerNormFF: true,
        layerNormHeadsProjection: true,
        addLayerNormBias: true
      };

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

    // To be checked if this is right
    // 12 Layers.
    const gpt2: transformer.TransformerConfig = {
        id: 'GPT2',
        kind: 'Transformer',
        tokenRep: tokenRep,
        spec: {
          inputRep: embedding_size,
          kqvRep: embedding_size / n_heads,
          layers: Array(12).fill(transformer_param_layer_spec),
          computeSpec: {
            dropoutRate: 0.0,
            layerNormEpsilon: 1e-5
          },
          // This below is not doing anything: need to check what's happening.
          posEncodingSeqLength: 1024,
          layerNorm: true,
          addLayerNormBias: true,
          addPosEmbeddings: true,

        },
        init: {
          stddev: 0.5,
          mean: 0,
          seed: 96,
        },
    };
    
    const params = transformer.initDecoderParams(
        gpt2);
    // const params = transformer.initAttnHeadParams(paramSizes);
    // Check head size.
    const paramCount = jstree.reduce<GTensor<any>, number>(
      (count, paramObj) => count + paramObj.tensor.size,
      0,
      // params.layers[0].queryM
      params.layers[0]
    );

    // Check head size.
    expect(paramCount).toEqual(7087872);

    const paramCountGPT2 = jstree.reduce<GTensor<any>, number>(
      (count, paramObj) => count + paramObj.tensor.size,
      0,
      // params.layers[0].queryM
      params
    );

    console.log(paramCountGPT2);

    // Check full GPT2 size.
    expect(paramCountGPT2).toEqual(124439808);
      // console.log(params.layers[0].queryM.dimNames);
      // console.log(params.layers[0].queryM.dim);
      // total count: 124439808
      // posEmbedding: 786432 - ok
      // tokenEmbeddings: 38597376 - ok
      // one head: 7087872 - 
      // Test 2: Check number of parameters in GPT2.
      
      // Check if the output matches the one from the implementation in python.
      // TODO (@aliciafmachado)
    // const inputExample1 = new GTensor(
    //   tf.tensor([
    //     [
    //       [1, 2],
    //       [3, 4],
    //       [5, 6],
    //     ],
    //   ]),
    //   ['batch', 'pos', 'inputRep']
    // );
    // const generator = makeRandomStream(0);
    // const parts = transformer.computeAttnHead(spec, params, inputExample1, generator);
    // expect(parts.attendedValues.dimNames).toEqual(
    //   jasmine.arrayContaining(['batch', 'heads', 'value', 'pos'])
    // );
    // expect(parts.attendedValues.gshape()).toEqual({
    //   batch: 1,
    //   heads: 1,
    //   value: 4,
    //   pos: 3,
    // });
  });

//   it('AB task data prep', async () => {
//     const inputRep = 2;
//     const batchSize = 4;
//     const task = new abtask.AorBisMaxTask({
//       name: 'AorBisMaxTask',
//       maxInputLen: 2,
//       maxOutputLen: 2,
//       seed: 0,
//       // Create a tokenEmbedding that also has [MASC] token & [PAD] token.
//       // inputRepSize: inputRep,
//     });
//     const tokenRep = prepareBasicTaskTokenRep(task.baseVocab);
//     const padTokenId = tokenRep.tokenToIdx[tokenRep.padToken];
//     const embeddings = makeTruncNormal({
//       tokenId: tokenRep.tokens.length,
//       inputRep,
//     });

//     // len = taskConfig.batchSize
//     const examples = task.exampleIter.takeOutN(4);

//     const batchedInputEmb = embedBatch(
//       tokenRep.tokenToIdx,
//       embeddings,
//       examples.map((example) => example.input.concat(tokenRep.maskToken)),
//       { paddingId: padTokenId, padAt: 'start', dtype: 'int32' }
//     );

//     expect(batchedInputEmb.gshape()).toEqual({
//       batch: batchSize,
//       // +1 for the appended [MASK] token to be predicted.
//       pos: task.config.maxInputLen + 1,
//       inputRep,
//     });
//   });
});
