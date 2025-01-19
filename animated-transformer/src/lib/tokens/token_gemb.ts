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
// import '@tensorflow/tfjs-core/dist/public/chained_ops/register_all_chained_ops';
/*
Not needed anymore. See
"Note: If you are using @tensorflow/tfjs or @tensorflow/tfjs-layers or any of the
other higher level packages, this is done for you automatically." in
https://www.tensorflow.org/js/tutorials/upgrading_to_3_0
*/
import { GTensor, DName, makeTruncNormal } from '../gtensor/gtensor';

// CONSIDER: parameterise by the tokens, e.g. by a <T extends string>?
export interface TokenEmbConfig {
  tokens: string[];
  embeddings: GTensor<'token' | 'inputRep'>;
}

// // Input Embedding
// export class TokenEmb {
//   public tokenToIdx: { [token: string]: number } = {};

//   constructor(
//     public tokens: string[],
//     public embeddings: GTensor<'token' | 'inputRep'>
//   ) {
//     this.tokens.forEach((t, i) => this.tokenToIdx[t] = i);
//   }

// Output shape is [input.length, repSize + posRepSize]
export function embed(
  tokenToIdx: { [token: string]: number },
  embeddings: GTensor<'tokenId' | 'inputRep'>,
  input: string[]
): GTensor<'pos' | 'inputRep'> {
  const inputIds = new GTensor(
    tf.tensor1d(
      input.map((s) => tokenToIdx[s]),
      'int32'
    ),
    ['pos']
  );
  const embeddedInput = embeddings.gather(inputIds, 'tokenId');
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
export function embedBatch(
  tokenToIdx: { [token: string]: number },
  embeddings: GTensor<'tokenId' | 'inputRep'>,
  examples: string[][],
  config: {
    paddingId: number;
    padAt: 'start' | 'end';
    dtype: tf.NumericDataType;
    batchSize?: number;
    maxInputLength?: number;
  }
): GTensor<'batch' | 'pos' | 'inputRep'> {
  const inputEmbList: tf.Tensor[] = [];

  if (config.batchSize !== undefined && config.batchSize < examples.length) {
    examples = examples.slice(0, config.batchSize);
  }

  let maxInputLength = 0;
  if (!config.maxInputLength) {
    examples.forEach((l) => (maxInputLength = Math.max(l.length, maxInputLength)));
    examples.map((l) => l.map((s) => tokenToIdx[s]));
  } else {
    maxInputLength = config.maxInputLength;
  }

  examples.forEach((example) => {
    if (example.length >= maxInputLength) {
      const tensor = tf.tensor1d(
        example.slice(0, maxInputLength).map((s) => tokenToIdx[s]),
        config.dtype
      );
      inputEmbList.push(tensor);
      // console.log(l)
      // console.log(l.map(s => this.tokenToIdx[s]))
      // console.log(tensor.dataSync())
    } else if (example.length === 0) {
      const tensor = tf.fill([maxInputLength], config.paddingId, config.dtype);
      inputEmbList.push(tensor);
    } else if (example.length < maxInputLength) {
      const paddingLocation: [[number, number]] =
        config.padAt === 'start'
          ? [[maxInputLength - example.length, 0]]
          : [[0, maxInputLength - example.length]];
      const tensor = tf.pad(
        tf.tensor1d(
          example.map((s) => tokenToIdx[s]),
          config.dtype
        ),
        paddingLocation,
        config.paddingId
      );
      inputEmbList.push(tensor);
    }
  });

  if (config.batchSize !== undefined && config.batchSize > examples.length) {
    const nPaddingExamples = Math.max(examples.length - config.batchSize);
    for (let i = 0; i < nPaddingExamples; i++) {
      const tensor = tf.fill([maxInputLength], config.paddingId, config.dtype);
      inputEmbList.push(tensor);
    }
  }

  const batchTokenIds = new GTensor(tf.stack(inputEmbList, 0), ['batch', 'pos']);

  const batchedinputEmbs = new GTensor(tf.gather(embeddings.tensor, batchTokenIds.tensor), [
    'batch',
    'pos',
    'inputRep',
  ]);

  return batchedinputEmbs;
}

export function embedBatchWithTokenizer(
  tokenize_fn: (input: string) => number[],
  embeddings: GTensor<'tokenId' | 'inputRep'>,
  examples: string[],
  config: {
    paddingId: number;
    padAt: 'start' | 'end';
    dtype: tf.NumericDataType;
    batchSize?: number;
    maxInputLength?: number;
  }
): GTensor<'batch' | 'pos' | 'inputRep'> {
  const inputEmbList: tf.Tensor[] = [];

  if (config.batchSize !== undefined && config.batchSize < examples.length) {
    examples = examples.slice(0, config.batchSize);
  }

  let maxInputLength = 0;
  if (!config.maxInputLength) {
    examples.forEach((l) => (maxInputLength = Math.max(l.length, maxInputLength)));
    examples.map((l) => tokenize_fn(l));
  } else {
    maxInputLength = config.maxInputLength;
  }

  // Tokenize first and then slice it.
  examples.forEach((example) => {
    let tensor = tf.tensor1d(tokenize_fn(example), config.dtype);

    if (tensor.shape[0] >= maxInputLength) {
      tensor = tensor.slice(0, maxInputLength);
    } else if (tensor.shape[0] == 0) {
      tensor = tf.fill([maxInputLength], config.paddingId, config.dtype);
    } else if (tensor.shape[0] < maxInputLength) {
      const paddingLocation: [[number, number]] =
        config.padAt === 'start'
          ? [[maxInputLength - tensor.shape[0], 0]]
          : [[0, maxInputLength - tensor.shape[0]]];
      tensor = tf.pad(
        tensor,
        paddingLocation,
        config.paddingId
      );
    }
    inputEmbList.push(tensor);
  });

  if (config.batchSize !== undefined && config.batchSize > examples.length) {
    const nPaddingExamples = Math.max(examples.length - config.batchSize);
    for (let i = 0; i < nPaddingExamples; i++) {
      const tensor = tf.fill([maxInputLength], config.paddingId, config.dtype);
      inputEmbList.push(tensor);
    }
  }

  const batchTokenIds = new GTensor(tf.stack(inputEmbList, 0), ['batch', 'pos']);
  const batchedinputEmbs = new GTensor(tf.gather(embeddings.tensor, batchTokenIds.tensor), [
    'batch',
    'pos',
    'inputRep',
  ]);

  return batchedinputEmbs;
}

export type BasicTaskTokenRep = {
  maskToken: string;
  padToken: string;
  eosToken: string;
  spaceToken: string;
  // tokens is all tokens, including mask, pod, eos, etc
  tokens: string[];
  // remove below
  tokenToIdx: { [token: string]: number };
  idxToOneHot: { [tokenIdx: number]: number[] };
};

// TODO(@aliciafmachado): token wrap class with the tokenize and untokenize fn?
// make basictasktokenrep minimal and then add a wrapper class that creates the tokenToIdx and idxToOneHot.
// This interface would be compatible with a tokenizer straight out-of-the-box.

// ----------------------------------------------------------------------------
// Prepate the task representation in a vector space.
// TODO: maybe this should be viewed as a task extension: i.e. Task --> Task
export function prepareBasicTaskTokenRep(baseVocab: string[]): BasicTaskTokenRep {
  // Create a tokenEmbedding that has an extra mask token.
  const maskToken = '[MASK]';
  const padToken = '[PAD]';
  const eosToken = '[EOS]';
  const spaceToken = ' '
  const vocab = [...baseVocab, maskToken, padToken, eosToken, spaceToken];
  const tokenToIdx: { [token: string]: number } = {};
  vocab.forEach((t, i) => (tokenToIdx[t] = i));

  // const tokenEmb = new TokenEmb(
  //   vocab,
  //   makeTruncNormal({ token: vocab.length, inputRep: repSize })
  // );

  // TODO: Find a better place for the idxToOneHot lookup table
  const idxToOneHot: { [tokenIdx: number]: number[] } = {};
  const oneHotTokens = [tf.oneHot(tf.tensor1d(Object.values(tokenToIdx), 'int32'), baseVocab.length + 4).arraySync() as number[][]];
  Object.values(tokenToIdx).forEach((i) => (idxToOneHot[i] = oneHotTokens[0][i]));
  return {
    maskToken,
    padToken,
    eosToken,
    spaceToken,
    tokens: vocab,
    tokenToIdx,
    idxToOneHot
  };
}

export const toyTokenTep = prepareBasicTaskTokenRep(['a', 'b', 'c']);

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------

// Note: don't use  `GTensor<'tokenId' | 'inputRep'>,` here because we want
// this type to be generic enough that a generic training state that knows
// nothing about
//
// TODO: revisit.
export type StrSeqPrepFn<Params, Dims extends DName> = (
  model: {
    config: { tokenRep: BasicTaskTokenRep };
    params: Params;
  },
  strSeqs: string[][],
  options: { maxInputLength: number }
) => GTensor<Dims>;

export function strSeqPrepFn(
  model: {
    config: { tokenRep: BasicTaskTokenRep };
    params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
  },
  inputSeqs: string[][],
  options: { maxInputLength: number }
): GTensor<'batch' | 'pos' | 'inputRep'> {
  const padTokenId = model.config.tokenRep.tokenToIdx[model.config.tokenRep.padToken];
  const batchedInputEmb = embedBatch(
    model.config.tokenRep.tokenToIdx,
    model.params.tokenEmbedding,
    inputSeqs,
    {
      paddingId: padTokenId,
      padAt: 'start',
      dtype: 'int32',
      maxInputLength: options.maxInputLength,
    }
  );
  return batchedInputEmb;
}

/**
 * Adds a [MASK] token at the end of the input, and creates the GTensor
 * representation for the batch.
 */
// Note: pure decoder language models are a little different: each token's
// output is the prediction of the next token; but that requires causal
// attention from the token forward. We use bi-dir attention throughout (no
// causal masking of attention, yet).
export function strSeqPrepFnAddingFinalMask(
  model: {
    config: { tokenRep: BasicTaskTokenRep };
    params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
  },
  inputSeqs: string[][],
  options: { maxInputLength: number }
): GTensor<'batch' | 'pos' | 'inputRep'> {
  const inputsWithFinalMask = inputSeqs.map((inputSeq) =>
    inputSeq.concat(model.config.tokenRep.maskToken)
  );
  return strSeqPrepFn(model, inputsWithFinalMask, options);
}

// TODO: maybe change the type to somethinfg more specific and without tokenEmb
// and maxInputLength since they are not relevant.
//
// Note: outputSeqs is a list of next tokens, where each inner list contains an
// entry for each example in the batch.
// e.g.
// if you have batch size 3, and 3 continuations:
//    example 1 continuation: cat
//    example 2 continuation: boo
//    example 3 continuation: foo
// Then you have an outputSeqs array: [[c,b,f], [a,o,o], [t,o,o]]
// And this function returns the token indexes for [c,b,f].
//
// TODO: we'll want to generalise this for longer sequences...
export function singleNextTokenIdxOutputPrepFn(
  model: { config: { tokenRep: BasicTaskTokenRep } },
  outputSeqs: string[][]
): GTensor<'batch'> {
  return new GTensor(
    tf.tensor(
      outputSeqs.map((outputSeq) => model.config.tokenRep.tokenToIdx[outputSeq[0]]),
      [outputSeqs.length],
      'int32'
    ),
    ['batch']
  );
}

// Returns the one Hot representation for each token of the expected output sequence for the provided input sequence
export function expectedOutputSeqPrepFn(
  model: { config: { tokenRep: BasicTaskTokenRep } },
  inputSeqs: string[][],
  expectedOutputs: string[][],
): GTensor<'batch' | 'pos' | 'tokenId'> {
  // Compute Token rep for inputSeq
  const batchInputs = inputSeqs.map((inputSeq) => inputSeq.map((token) => model.config.tokenRep.tokenToIdx[token]))
  // Compute Token rep for inputSeq
  const expectedOutputSeq = expectedOutputs.map((outputToken) => model.config.tokenRep.tokenToIdx[outputToken[0]])
  // Shift input sequences to the right and add the corresponding target in "expectedOutputs" at the end of each sequence
  let shiftedInputs = batchInputs.map((x) => x.slice(1,))
  const expectedOutputSeqIdx = expectedOutputSeq.map((y, index) => shiftedInputs[index].concat(y))
  const expectedOutputSeqOneHot = expectedOutputSeqIdx.map((sample) => sample.map((tidx) => model.config.tokenRep.idxToOneHot[tidx]))
  // TODO: We should probably be using a lookup function and storing the one-hot for every token in the GPU as a constant.
  return new GTensor(tf.tensor(expectedOutputSeqOneHot), ['batch', 'pos', 'tokenId']);
}


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
