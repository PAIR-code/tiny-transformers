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
import { GTensor, DName, makeTruncNormal } from '../gtensor/gtensor';

// CONSIDER: parameterise by the tokens, e.g. by a <T extends string>?
export interface TokenEmbConfig {
  tokens: string[];
  embeddings: GTensor<'token' | 'inputRep'>;
}

// Input Embedding
export class TokenEmb {
  public tokenToIdx: { [token: string]: number } = {};

  constructor(
    public tokens: string[],
    public embeddings: GTensor<'token' | 'inputRep'>
  ) {
    this.tokens.forEach((t, i) => this.tokenToIdx[t] = i);
  }

  // Output shape is [input.length, repSize + posRepSize]
  embed(input: string[]): GTensor<'pos' | 'inputRep'> {
    const inputIds = new GTensor(
      tf.tensor1d(input.map(s => this.tokenToIdx[s]), 'int32'), ['pos']);
    const embeddedInput = this.embeddings.gather(inputIds, 'token');
    return embeddedInput;
  }

  // TODO: consider supporting padding string[][] ?
  // pad(inputs: string[][], config: {
  //   paddingId: number;
  //   padAt: 'start' | 'end';
  //   dtype: tf.NumericDataType,
  // }) {

  // }

  // When batchSize is defined and batchSize > examples.length, then
  // padding-filled examples are added to the final output GTensor. When
  // batchSize < examples.length, examples is truncated to make the output
  // GTensor.
  embedBatch(examples: string[][], config: {
    paddingId: number;
    padAt: 'start' | 'end';
    dtype: tf.NumericDataType,
    batchSize?: number,
    maxInputLength?: number
  }): GTensor<'batch' | 'pos' | 'inputRep'> {
    const inputEmbList: tf.Tensor[] = [];

    if (config.batchSize !== undefined && config.batchSize < examples.length) {
      examples = examples.slice(0, config.batchSize);
    }

    let maxInputLength = 0;
    if (!config.maxInputLength) {
      examples.forEach(l => maxInputLength = Math.max(l.length, maxInputLength));
      examples.map(l => l.map(s => this.tokenToIdx[s]));
    } else {
      maxInputLength = config.maxInputLength;
    }

    examples.forEach(example => {
      if (example.length >= maxInputLength) {
        const tensor = tf.tensor1d(
          example.slice(0, maxInputLength).map(s => this.tokenToIdx[s]),
          config.dtype);
        inputEmbList.push(tensor);
        // console.log(l)
        // console.log(l.map(s => this.tokenToIdx[s]))
        // console.log(tensor.dataSync())
      } else if (example.length === 0) {
        const tensor = tf.fill(
          [maxInputLength], config.paddingId, config.dtype);
        inputEmbList.push(tensor);
      } else if (example.length < maxInputLength) {
        const paddingLocation: [[number, number]] = (config.padAt === 'start' ?
          [[maxInputLength - example.length, 0]] : [[0, maxInputLength - example.length]]);
        const tensor = tf.pad(
          tf.tensor1d(example.map(s => this.tokenToIdx[s]), config.dtype),
          paddingLocation, config.paddingId);
        inputEmbList.push(tensor);
      }
    });

    if (config.batchSize !== undefined && config.batchSize > examples.length) {
      const nPaddingExamples = Math.max(examples.length - config.batchSize);
      for (let i = 0; i < nPaddingExamples; i++) {
        const tensor = tf.fill(
          [maxInputLength], config.paddingId, config.dtype);
        inputEmbList.push(tensor);
      }
    }

    const batchTokenIds = new GTensor(
      tf.stack(inputEmbList, 0), ['batch', 'pos']);

    const batchedinputEmbs = new GTensor(
      tf.gather(this.embeddings.tensor, batchTokenIds.tensor),
      ['batch', 'pos', 'inputRep']);

    return batchedinputEmbs;
  }
}

export type BasicTaskTokenRep = {
  maskToken: string;
  padToken: string;
  eosToken: string;
  tokenEmb: TokenEmb;
}


// ----------------------------------------------------------------------------
// Prepate the task representation in a vector space.
// TODO: maybe this should be viewed as a task extension: i.e. Task --> Task
export function prepareBasicTaskTokenRep(
  baseVocab: string[],
  repSize: number,
): BasicTaskTokenRep {
  // Create a tokenEmbedding that has an extra mask token.
  const maskToken = '[MASK]';
  const padToken = '[PAD]';
  const eosToken = '[EOS]';
  const vocab = [...baseVocab, maskToken, padToken, eosToken];
  const tokenEmb = new TokenEmb(vocab, makeTruncNormal(
    { token: vocab.length, inputRep: repSize }));
  return {
    maskToken,
    padToken,
    eosToken,
    tokenEmb
  };
}


// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------

export type StrSeqPrepFn<Dims extends DName> =
  (tokenRep: BasicTaskTokenRep,
    maxInputLength: number,
    strSeqs: string[][]
  ) => GTensor<Dims>;

export const strSeqPrepFn
  : StrSeqPrepFn<'batch' | 'pos' | 'inputRep'> =
  (
    tokenRep: BasicTaskTokenRep,
    maxInputLength: number,
    inputSeqs: string[][],
  ): GTensor<'batch' | 'pos' | 'inputRep'> => {
    const tokenEmb = tokenRep.tokenEmb;
    const padTokenId = tokenEmb.tokenToIdx[tokenRep.padToken];
    const batchedInputEmb = tokenEmb.embedBatch(inputSeqs,
      {
        paddingId: padTokenId,
        padAt: 'start',
        dtype: 'int32',
        maxInputLength,
      });
    return batchedInputEmb;
  };

/**
 * Adds a [MASK] token at the end of the input, and creates the GTensor
 * representation for the batch.
 */
// Note: pure decoder language models are a little different: each token's
// output is the prediction of the next token; but that requires causal
// attention from the token forward. We use bi-dir attention throughout (no
// causal masking of attention, yet).
export const strSeqPrepFnAddingFinalMask
  : StrSeqPrepFn<'batch' | 'pos' | 'inputRep'> =
  (
    tokenRep: BasicTaskTokenRep,
    maxInputLength: number,
    inputSeqs: string[][],
  ): GTensor<'batch' | 'pos' | 'inputRep'> => {
    return strSeqPrepFn(
      tokenRep, maxInputLength,
      inputSeqs.map(
        inputSeq => inputSeq.concat(tokenRep.maskToken)));
  };

export const singleNextTokenIdxOutputPrepFn
  : StrSeqPrepFn<'batch'> =
  (
    tokenRep: BasicTaskTokenRep,
    maxInputLength: number,
    outputSeqs: string[][],
  ): GTensor<'batch'> => {
    return new GTensor(tf.tensor(
      outputSeqs.map(outputSeq => tokenRep.tokenEmb.tokenToIdx[outputSeq[0]]),
      [outputSeqs.length],
      'int32'), ['batch']);
  };

export function padInputSeqStart(
  paddingToken: string,
  maxInputLength: number,
  strSeq: string[]
): string[] {
  const extraNeededTokens = maxInputLength - strSeq.length;
  const paddingPrefix = [];
  for (let i = 0; i < extraNeededTokens; i++) {
    paddingPrefix.push(paddingToken);
  }
  return paddingPrefix.concat(strSeq);
}

export function addPaddingExamples(
  paddingToken: string,
  maxInputLength: number,
  batchSize: number,
  strSeqs: string[][]
) {
  const nExtraNeededPaddingExamples = batchSize - strSeqs.length;
  const extraPaddingExamples = [];
  if (nExtraNeededPaddingExamples > 0) {
    const allPaddingExample = [];
    for (let i = 0; i < maxInputLength; i++) {
      allPaddingExample.push(paddingToken);
    }

    for (let i = 0; i < nExtraNeededPaddingExamples; i++) {
      extraPaddingExamples.push(allPaddingExample);
    }
  }
  return strSeqs.concat(extraPaddingExamples);
}

