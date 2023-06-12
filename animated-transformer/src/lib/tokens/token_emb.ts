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
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-core/dist/public/chained_ops/register_all_chained_ops';
import * as gtensor from '../gtensor/gtensor';

// CONSIDER: parameterise by the tokens, e.g. by a <T extends string>?
export interface TokenEmbConfig {
  // seqLen: number;
  repSize: number;
  vocab: string[];
  posRep?: {
    seqLen: number;
    posRepSize: number;
  };
  repInitializer?: string; // | Initializer
}

// Input Embedding
export class TokenEmb {
  public vocabPosMap: { [s: string]: number };
  public vocabEmbedding: tf.layers.Layer;
  public positionEmbedding?: tf.layers.Layer;

  // public seqLen: number;
  // public repSize: number;
  // public vocab: string[];
  // public posRepSize?: number;
  public config: TokenEmbConfig;

  constructor(config: TokenEmbConfig) {
    this.config = config;
    // this.seqLen = config.seqLen;
    // this.repSize = config.repSize;
    // this.vocab = config.vocab;
    // this.posRepSize = config.posRepSize;

    this.vocabPosMap = this.config.vocab.reduce(
      (prev: { [s: string]: number }, cur: string, curIdx: number) => {
        prev[cur] = curIdx;
        return prev;
      }, {});

    this.vocabEmbedding = tf.layers.embedding({
      name: 'vocabEmbed',
      inputDim: this.config.vocab.length,
      outputDim: this.config.repSize,
      embeddingsInitializer: config.repInitializer || 'truncatedNormal',
      // TODO(ldixon): what kind of normalization to apply?
      dtype: 'float32',
      trainable: true,
    });

    if (this.config.posRep) {
      this.positionEmbedding = tf.layers.embedding({
        inputDim: this.config.posRep.seqLen,
        outputDim: this.config.posRep.posRepSize,
        embeddingsInitializer: config.repInitializer || 'truncatedNormal',
        // TODO(ldixon): what kind of normalization to apply?
        dtype: 'float32',
        trainable: true,
      });
    }
  }

  get vocabRepGTensor(): gtensor.GTensor<'token' | 'inputRep'> {
    return new gtensor.GTensor(this.vocabEmbedding.getWeights()[0],
      ['token', 'inputRep']);
  }

  // Output shape is [input.length, repSize + posRepSize]
  embed1(input: string[]): tf.Tensor2D {
    const inputIds = tf.tensor1d(input.map(s => this.vocabPosMap[s]));
    const inputEmbeddings = this.vocabEmbedding.apply(inputIds) as tf.Tensor2D;
    // TODO: add positions.
    return inputEmbeddings;
  }
  embedBatch(inputs: string[][]): tf.Tensor3D {
    const batchInputIds = tf.tensor2d(inputs.map(input => input.map(s => this.vocabPosMap[s])));
    console.log('batchInputIds', batchInputIds);
    const batchInputEmbeddings = this.vocabEmbedding.apply(batchInputIds) as tf.Tensor3D;
    // TODO: add positions.
    return batchInputEmbeddings;
  }

  embedBatchGTensor(inputs: string[][]): gtensor.GTensor<'batch' | 'pos' | 'inputRep'> {
    return new gtensor.GTensor(this.embedBatch(inputs), ['batch', 'pos', 'inputRep']);
  }

  get repSize(): number {
    if (this.config.posRep) {
      return this.config.repSize + this.config.posRep.posRepSize;
    } else {
      return this.config.repSize;
    }
  }
}
