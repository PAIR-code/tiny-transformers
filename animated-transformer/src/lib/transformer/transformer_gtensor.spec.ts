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
import { AttnHeadParamSpec, AttnHeadComputeSpec } from './transformer_gtensor';
// import * as attention_head from './attention_head';
// import { TokenEmbConfig } from '../tokens/token_emb';
import * as tf from '@tensorflow/tfjs';
// import * as swap_task from '../seqtasks/swap_task';
// import * as json5 from 'json5';
// import { TrainingConfig } from '../../app/config-store.service';
// import { nextFrame } from '@tensorflow/tfjs';
import { Observable, generate, EMPTY } from 'rxjs';
import { map } from 'rxjs/operators';

import { Example } from '../seqtasks/util';
import * as abtask from '../seqtasks/ab_task';
import { TokenEmb, prepareBasicTaskTokenRep } from '../tokens/token_gemb';
import * as param_map from '../gtensor/gtensor_tree';
import { gtensorTrees } from '../gtensor/gtensor_tree';

describe('GTensor Transformers', () => {

  it('basic transformer shapes', () => {
    const spec: AttnHeadComputeSpec = {
      residuals: true,
    }
    const paramSizes: AttnHeadParamSpec = {
      inputRep: 2,
      kq: 3,
      heads: 1,
      value: 4,
      layerNormHeadsProjection: true,
      layerNormFF: true,
      addLayerNormBias: false
    };
    const params = transformer.initAttnHeadParams(paramSizes);
    const inputExample1 = new GTensor(tf.tensor(
      [[[1, 2], [3, 4], [5, 6]]]
    ), ['batch', 'pos', 'inputRep']);
    const parts = transformer.computeAttnHead(spec, params, inputExample1);
    expect(parts.attendedValues.dimNames).toEqual(jasmine.arrayContaining(
      ['batch', 'heads', 'value', 'pos']));
    expect(parts.attendedValues.gshape()).toEqual(
      { batch: 1, heads: 1, value: 4, pos: 3 });
  });


  it('AB task data prep', async () => {
    const inputRep = 2;
    const batchSize = 4;
    const task = new abtask.AorBisMaxTask({
      name: 'AorBisMaxTask',
      maxInputLen: 2,
      maxOutputLen: 2,
      seed: 0,
      // Create a tokenEmbedding that also has [MASC] token & [PAD] token.
      // inputRepSize: inputRep,
    });
    const tokenRep = prepareBasicTaskTokenRep(task.baseVocab, inputRep);

    const tokenEmb = tokenRep.tokenEmb;
    const padTokenId = tokenEmb.tokenToIdx[tokenRep.padToken];

    // len = taskConfig.batchSize
    const examples = [
      task.genRandExample(),
      task.genRandExample(),
      task.genRandExample(),
      task.genRandExample()];

    const batchedInputEmb = tokenEmb.embedBatch(
      examples.map(example => example.input.concat(tokenRep.maskToken)),
      { paddingId: padTokenId, padAt: 'start', dtype: 'int32' });

    expect(batchedInputEmb.gshape()).toEqual({
      batch: batchSize,
      // +1 for the appended [MASK] token to be predicted.
      pos: task.config.maxInputLen + 1,
      inputRep,
    });
  });

});

