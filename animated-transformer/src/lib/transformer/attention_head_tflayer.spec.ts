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


import * as attention_head from './attention_head_tflayer';
import { TokenEmbConfig } from '../tokens/token_emb';
import * as tf from '@tensorflow/tfjs';

describe('attention_head', () => {
  const config: attention_head.AttentionHeadConfig = {
    // inputRepSize: 2,
    kqRepSize: 3,
    valueRepSize: 4
  };

  beforeEach(() => {

  });

  // it('AttentionHead.attendSeq has the right output shapes', () => {
  //   const attn = new attention_head.AttentionHead(config);

  //   const inputExample = [ [1, 2], [3, 4], [5, 6] ];
  //   const inputBatch = [inputExample];
  //   const inputTensor = tf.tensor3d(inputBatch);
  //   const batchSize = inputBatch.length;
  //   const output = attn.attendSeq(inputTensor);

  //   expect(output.attendedValues.shape).toEqual(
  //     [batchSize, inputExample.length, config.valueRepSize]);
  //   expect(output.attention.shape).toEqual(
  //     [batchSize, inputExample.length, inputExample.length]);
  //   expect(output.values.shape).toEqual(
  //     [batchSize, inputExample.length, config.valueRepSize]);
  //   expect(output.keys.shape).toEqual(
  //     [batchSize, inputExample.length, config.kqRepSize]);
  //   expect(output.queries.shape).toEqual(
  //     [batchSize, inputExample.length, config.kqRepSize]);
  // });

  it('new attention_head.AttentionHead', () => {
    const attn = new attention_head.AttentionHead(config);

    const inputExample = [[1, 2], [3, 4], [5, 6]];
    const inputBatch = [inputExample];
    const inputTensor = tf.tensor3d(inputBatch);
    const batchSize = inputBatch.length;
    const outputs = attn.apply(inputTensor) as tf.Tensor[];

    expect(outputs[attention_head.ATTENDED_VALUES_PART_IDX].shape).toEqual(
      [batchSize, inputExample.length, config.valueRepSize]);
    expect(outputs[attention_head.ATTENTION_PART_IDX].shape).toEqual(
      [batchSize, inputExample.length, inputExample.length]);
    expect(outputs[attention_head.VALUES_PART_IDX].shape).toEqual(
      [batchSize, inputExample.length, config.valueRepSize]);
    expect(outputs[attention_head.KEYS_PART_IDX].shape).toEqual(
      [batchSize, inputExample.length, config.kqRepSize]);
    expect(outputs[attention_head.QUERIES_PART_IDX].shape).toEqual(
      [batchSize, inputExample.length, config.kqRepSize]);
  });
});

