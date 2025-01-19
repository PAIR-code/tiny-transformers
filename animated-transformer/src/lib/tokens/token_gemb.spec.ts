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

// token_gemb.spec.ts

import { GVariable, GTensor, makeTruncNormal } from '../gtensor/gtensor';
import * as tf from '@tensorflow/tfjs';
import {
  strSeqPrepFn,
  embed,
  prepareBasicTaskTokenRep,
  embedBatch,
  embedBatchWithTokenizer,
  expectedOutputSeqPrepFn,
} from '../tokens/token_gemb';
import r50k_base from "gpt-tokenizer/esm/encoding/r50k_base";

function tokenize_fn_test(input: string): number[] {
  if (input == "")
    return [];
  if (input == "a")
    return [0];
  if (input == "b")
    return [1];

  return tokenize_fn_test(
    input.substring(0, input.length / 2)).concat(tokenize_fn_test(input.substring(input.length / 2, input.length)));
};

function untokenize_fn_test(input: number[]): string {
  if (input.length == 0)
    return "";
  if (input.length == 1 && input[0] == 0)
    return "a";
  if (input.length == 1 && input[0] == 1)
    return "b";
  return untokenize_fn_test(
    input.slice(0, input.length / 2)).concat(untokenize_fn_test(input.slice(input.length / 2, input.length)));
};

describe('token_gemb', () => {
  it('embed', () => {
    const [aEmb, bEmb, padEmb] = [
      [1, 1],
      [2, 2],
      [0, 0],
    ];
    const tokens = ['a', 'b', '[pad]'];
    const tokenRep = prepareBasicTaskTokenRep(tokens);
    const embeddings = new GTensor(tf.tensor([aEmb, bEmb, padEmb]), ['tokenId', 'inputRep']);
    const seqToEmbed = ['a', 'b', '[PAD]', 'a'];
    const embeddedSeq = embed(tokenRep.tokenToIdx, embeddings, seqToEmbed);
    const positionEmb = embeddedSeq.unstack('pos');
    expect(positionEmb.length).toEqual(4);
    expect(positionEmb[0].tensor.arraySync()).toEqual(aEmb);
    expect(positionEmb[1].tensor.arraySync()).toEqual(bEmb);
    expect(positionEmb[2].tensor.arraySync()).toEqual(padEmb);
    expect(positionEmb[3].tensor.arraySync()).toEqual(aEmb);
  });

  it('batchEmbed, pad start', () => {
    const [aEmb, bEmb, padEmb] = [
      [1, 1],
      [2, 2],
      [0, 0],
    ];
    const tokens = ['a', 'b', '[pad]'];
    const tokenRep = prepareBasicTaskTokenRep(tokens);
    const tokenEmbedding = new GTensor(tf.tensor([aEmb, bEmb, padEmb]), ['tokenId', 'inputRep']);

    const seqsToEmbed = [['a', 'b', '[pad]', 'a'], ['a', 'b'], [], ['b'], ['a']];

    const seqEmb = embedBatch(tokenRep.tokenToIdx, tokenEmbedding, seqsToEmbed, {
      paddingId: 2,
      padAt: 'start',
      dtype: 'int32',
    });
    const batchesEmb = seqEmb.unstack('batch');
    expect(batchesEmb.length).toEqual(5);
    expect(batchesEmb[0].tensor.arraySync()).toEqual([aEmb, bEmb, padEmb, aEmb]);
    expect(batchesEmb[1].tensor.arraySync()).toEqual([padEmb, padEmb, aEmb, bEmb]);
    expect(batchesEmb[2].tensor.arraySync()).toEqual([padEmb, padEmb, padEmb, padEmb]);
    expect(batchesEmb[3].tensor.arraySync()).toEqual([padEmb, padEmb, padEmb, bEmb]);
    expect(batchesEmb[4].tensor.arraySync()).toEqual([padEmb, padEmb, padEmb, aEmb]);
  });

  it('batchEmbed, pad end', () => {
    const [aEmb, bEmb, padEmb] = [
      [1, 1],
      [2, 2],
      [0, 0],
    ];
    const tokens = ['a', 'b', '[pad]'];
    const tokenRep = prepareBasicTaskTokenRep(tokens);
    const embeddings = new GTensor(tf.tensor([aEmb, bEmb, padEmb]), ['tokenId', 'inputRep']);

    const seqsToEmbed = [['a', 'b', '[pad]', 'a'], ['a', 'b'], [], ['b'], ['a']];

    const seqEmb = embedBatch(tokenRep.tokenToIdx, embeddings, seqsToEmbed, {
      paddingId: 2,
      padAt: 'end',
      dtype: 'int32',
    });
    const batchesEmb = seqEmb.unstack('batch');
    expect(batchesEmb.length).toEqual(5);
    expect(batchesEmb[0].tensor.arraySync()).toEqual([aEmb, bEmb, padEmb, aEmb]);
    expect(batchesEmb[1].tensor.arraySync()).toEqual([aEmb, bEmb, padEmb, padEmb]);
    expect(batchesEmb[2].tensor.arraySync()).toEqual([padEmb, padEmb, padEmb, padEmb]);
    expect(batchesEmb[3].tensor.arraySync()).toEqual([bEmb, padEmb, padEmb, padEmb]);
    expect(batchesEmb[4].tensor.arraySync()).toEqual([aEmb, padEmb, padEmb, padEmb]);
  });

  it('strSeqPrepFn', () => {
    const tokens = ['a', 'b'];
    const tokenRep = prepareBasicTaskTokenRep(tokens);
    const params = {
      tokenEmbedding: new GVariable(
        makeTruncNormal({
          tokenId: tokenRep.tokens.length,
          inputRep: 2,
        }),
      ),
    };

    const seqToEmbed = ['a', 'b', '[PAD]', 'a'];

    const embeddedSeq = strSeqPrepFn({ config: { tokenRep }, params }, [seqToEmbed], {
      maxInputLength: 6,
    });

    const tokenEmbUnstacked = params.tokenEmbedding.unstack('tokenId');
    const aRep = tokenEmbUnstacked[tokenRep.tokenToIdx['a']].tensor.arraySync();
    const bRep = tokenEmbUnstacked[tokenRep.tokenToIdx['b']].tensor.arraySync();
    const padRep = tokenEmbUnstacked[tokenRep.tokenToIdx['[PAD]']].tensor.arraySync();

    const positionEmb = embeddedSeq.unstack('batch')[0].unstack('pos');
    expect(positionEmb.length).toEqual(6);
    // Observe that padding is added at the start of the seq
    // (so that final token prediction acts as expected)
    expect(positionEmb[0].tensor.arraySync()).toEqual(padRep);
    expect(positionEmb[1].tensor.arraySync()).toEqual(padRep);
    expect(positionEmb[2].tensor.arraySync()).toEqual(aRep);
    expect(positionEmb[3].tensor.arraySync()).toEqual(bRep);
    expect(positionEmb[4].tensor.arraySync()).toEqual(padRep);
    expect(positionEmb[5].tensor.arraySync()).toEqual(aRep);
  });

  it('expectedOutputSeqPrepFn', () => {
    const tokens = ['a', 'b'];
    const tokenRep = prepareBasicTaskTokenRep(tokens);
    const batchInput: string[][] = [
      ['a', 'b'],
      ['b', 'a'],
    ];
    const batchOutput: string[][] = [['a'], ['b']];
    const targetTokensOneHot = expectedOutputSeqPrepFn(
      { config: { tokenRep } },
      batchInput,
      batchOutput,
    );

    const expectedOutputArr: number[][][] = [
      [
        [0, 1, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0],
      ],
      [
        [1, 0, 0, 0, 0, 0],
        [0, 1, 0, 0, 0, 0],
      ],
    ];

    expect(targetTokensOneHot.tensor.arraySync()).toEqual(expectedOutputArr);
    expect(targetTokensOneHot.dimNames).toEqual(['batch', 'pos', 'tokenId'])
  });

  it('batchEmbed, pad start', () => {
    const [aEmb, bEmb, padEmb] = [
      [1, 1],
      [2, 2],
      [0, 0],
    ];
    const tokens = ['a', 'b'];
    const tokenEmbedding = new GTensor(tf.tensor([aEmb, bEmb, padEmb]), ['tokenId', 'inputRep']);

    const seqsToEmbed = ['aba', 'ab', '', 'b', 'a'];

    const seqEmb = embedBatchWithTokenizer(tokenize_fn_test, tokenEmbedding, seqsToEmbed, {
      paddingId: 2,
      padAt: 'start',
      dtype: 'int32',
      maxInputLength: 2,
    });

    const expectedOutputArr: number[][][] = [
      [
        [1, 1],
        [2, 2],
      ],
      [
        [1, 1],
        [2, 2],
      ],
      [
        [0, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [2, 2],
      ],
      [
        [0, 0],
        [1, 1],
      ],
    ];

    expect(seqEmb.tensor.arraySync()).toEqual(expectedOutputArr);
    expect(seqEmb.dimNames).toEqual(['batch', 'pos', 'inputRep'])
  });
});
