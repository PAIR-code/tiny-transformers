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

import { GTensor } from '../gtensor/gtensor';
import * as tf from '@tensorflow/tfjs';
import { TokenEmb } from '../tokens/token_gemb';

describe('Token GTensor Embeddings', () => {

  it('embed', () => {
    const [aEmb, bEmb, padEmb] = [[1, 1], [2, 2], [0, 0]];
    const tokens = ['a', 'b', '[pad]'];
    const embeddings =
      new GTensor(tf.tensor([aEmb, bEmb, padEmb]), ['token', 'inputRep']);
    const tokenEmb = new TokenEmb(tokens, embeddings);

    const seqToEmbed = ['a', 'b', '[pad]', 'a'];

    const seqEmb = tokenEmb.embed(seqToEmbed);
    const positionEmb = seqEmb.unstack('pos');
    expect(positionEmb.length).toEqual(4);
    expect(positionEmb[0].tensor.arraySync()).toEqual(aEmb);
    expect(positionEmb[1].tensor.arraySync()).toEqual(bEmb);
    expect(positionEmb[2].tensor.arraySync()).toEqual(padEmb);
    expect(positionEmb[3].tensor.arraySync()).toEqual(aEmb);
  });

  it('batchEmbed, pad start', () => {
    const [aEmb, bEmb, padEmb] = [[1, 1], [2, 2], [0, 0]];
    const tokens = ['a', 'b', '[pad]'];
    const embeddings =
      new GTensor(tf.tensor([aEmb, bEmb, padEmb]), ['token', 'inputRep']);
    const tokenEmb = new TokenEmb(tokens, embeddings);

    const seqsToEmbed = [
      ['a', 'b', '[pad]', 'a'],
      ['a', 'b'],
      [],
      ['b'],
      ['a'],
    ];

    const seqEmb = tokenEmb.embedBatch(seqsToEmbed,
      { paddingId: 2, padAt: 'start', dtype: 'int32' });
    const batchesEmb = seqEmb.unstack('batch');
    expect(batchesEmb.length).toEqual(5);
    expect(batchesEmb[0].tensor.arraySync())
      .toEqual([aEmb, bEmb, padEmb, aEmb]);
    expect(batchesEmb[1].tensor.arraySync())
      .toEqual([padEmb, padEmb, aEmb, bEmb]);
    expect(batchesEmb[2].tensor.arraySync())
      .toEqual([padEmb, padEmb, padEmb, padEmb]);
    expect(batchesEmb[3].tensor.arraySync())
      .toEqual([padEmb, padEmb, padEmb, bEmb]);
    expect(batchesEmb[4].tensor.arraySync())
      .toEqual([padEmb, padEmb, padEmb, aEmb]);
  });

  it('batchEmbed, pad end', () => {
    const [aEmb, bEmb, padEmb] = [[1, 1], [2, 2], [0, 0]];
    const tokens = ['a', 'b', '[pad]'];
    const embeddings =
      new GTensor(tf.tensor([aEmb, bEmb, padEmb]), ['token', 'inputRep']);
    const tokenEmb = new TokenEmb(tokens, embeddings);

    const seqsToEmbed = [
      ['a', 'b', '[pad]', 'a'],
      ['a', 'b'],
      [],
      ['b'],
      ['a'],
    ];

    const seqEmb = tokenEmb.embedBatch(seqsToEmbed,
      { paddingId: 2, padAt: 'end', dtype: 'int32' });
    const batchesEmb = seqEmb.unstack('batch');
    expect(batchesEmb.length).toEqual(5);
    expect(batchesEmb[0].tensor.arraySync())
      .toEqual([aEmb, bEmb, padEmb, aEmb]);
    expect(batchesEmb[1].tensor.arraySync())
      .toEqual([aEmb, bEmb, padEmb, padEmb]);
    expect(batchesEmb[2].tensor.arraySync())
      .toEqual([padEmb, padEmb, padEmb, padEmb]);
    expect(batchesEmb[3].tensor.arraySync())
      .toEqual([bEmb, padEmb, padEmb, padEmb]);
    expect(batchesEmb[4].tensor.arraySync())
      .toEqual([aEmb, padEmb, padEmb, padEmb]);
  });
});
