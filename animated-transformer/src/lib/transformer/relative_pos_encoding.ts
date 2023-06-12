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


/* Relative Positional Encoding for Transformers */

import { GTensor, makeTruncNormal } from '../gtensor/gtensor';
import * as tf_init from '@tensorflow/tfjs-layers/dist/initializers';
import { gtensor } from '..';

/**
 * RelativeAttention
 */
export interface RelativePosAttention {
  rawRelativePosAttention: GTensor<'relativePos'>;
  posIndexes: GTensor<'keyPos' | 'queryPos'>;
}

export interface BatchedRelativePosAttention {
  rawRelativePosAttention: GTensor<'relativePos'>;
  batchedPosIndexes: GTensor<'batch' | 'keyPos' | 'queryPos'>;
}

export function initRawRelativePosEncoding(
  seqLength: number,
  heads: number,
  truncNormalConfig?: tf_init.TruncatedNormalArgs
): GTensor<'heads' | 'relativePos'> {
  // rawRelativePosAttention corresponds to attention values for relative
  // positions, e.g.
  //   rawRelativePosAttention[seqLength * 2 - 1] = token seqLength to the right
  //   rawRelativePosAttention[seqLength] = token 1 to the right
  //   rawRelativePosAttention[seqLength - 1] = self attention
  //   rawRelativePosAttention[seqLength - 2] = token 1 to the left
  //   rawRelativePosAttention[0] = token 'seqLength' to the left
  return makeTruncNormal(
    {
      relativePos: seqLength * 2 - 1,
      heads
    },
    truncNormalConfig);
}

/**
 * Relative position encoding is done by adding an relative position attention
 * value to the query-key attention matrix. This function creates the
 * `rawRelativePosAttention` vector (of length `seqLength * 2 - 1`,
 * corresponding to max left position from current token to max right position
 * from current token), as well as the `posIndexes` matrix, which is a static
 * matrix of `keyPos` * `queryPos` that can be gathered from
 * `rawRelativePosAttention` to add create `rawRelativePosAttention`, which
 * can be added directly to the query-key attention matrix. e.g. with:
 *
 * ```
 * const posRelativeAttention = rawRelativePosAttention.gather(
 *   posIndexes, 'relativePos');
 * ```
 *
 * It is expected that gradients will propegate to `rawRelativePosAttention`,
 * while `posRelativeAttention` is constant.
 */
export function makePosAttentionMatrix(
  rawRelativePosAttention: GTensor<'heads' | 'relativePos'>,
): GTensor<'heads' | 'keyPos' | 'queryPos'> {
  const seqLength = (rawRelativePosAttention.dim.relativePos.size - 1) / 2;
  const keyIndexes =
    gtensor.makeRange('keyPos', 0, seqLength, 1, 'int32');
  const queryIndexes =
    gtensor.makeRange('queryPos', 0, seqLength, 1, 'int32');
  const keyPosBCast = keyIndexes.broadcastToCombinedShape(
    rawRelativePosAttention).rename('relativePos', 'queryPos');
  const queryPosBCast = queryIndexes.broadcastToCombinedShape(
    rawRelativePosAttention).rename('relativePos', 'keyPos');
  // posIndexes: will end up looking like so...
  //
  // 0 1     2     ... N
  // 1 2     3     ... N+1
  // ...
  // N (N+1) (N+2) ... (N+N)
  //
  // These are used to index into rawRelativePosAttention to create a matrix
  // of query * key with the appropriate value from rawRelativePosAttention.
  //
  // TODO: verify gradients propegate back correctly through "gather". If not,
  // we'll need to do some custom gradient management here...
  const posIndexes = keyPosBCast.pointwiseAdd(queryPosBCast);
  const posRelativeAttention = rawRelativePosAttention.gather(posIndexes,
    'relativePos');
  return posRelativeAttention;
}
