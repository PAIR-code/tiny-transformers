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

// gtensor.spec.ts
import * as gtensor from './gtensor';
import { DName, Dims, GTensor, gtensorOfDims } from './gtensor';
import * as tf from '@tensorflow/tfjs';

describe('gtensor', () => {
  beforeEach(() => {});

  it('creatingGTensors', () => {
    // Making a GTensor with an initializer:
    const g1 = gtensor.makeTruncNormal({ inputRep: 2, kqRep: 3 });
    // gshape() gives you the dict that describes the dimension's sizes.
    expect(g1.gshape()).toEqual({ inputRep: 2, kqRep: 3 });

    // Making a GTensor from a tensor by naming the dimensions:
    const g2 = new gtensor.GTensor(
      tf.tensor([
        [
          // 'example' dimension index 0
          [
            // 'pos' dimension index 0: contains an array of repSize
            1, // 'repSize' dimension index 0
            2, // repSize index 1
          ],
          [3, 4], // pos index 1
          [5, 6], // pos index 2
        ],
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ], // example index 1
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ], // example index 2
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ], // example index 3
      ]),
      ['example', 'pos', 'repSize'],
    );
    expect(g2.gshape()).toEqual({ example: 4, pos: 3, repSize: 2 });
  });

  it('transpose', () => {
    const g1 = new gtensor.GTensor(
      tf.tensor([
        [
          // example = 0
          [1, 2], // pos = 0
          [3, 4], // pos = 1
          [5, 6], // pos = 2
        ],
        [
          // example = 1
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        [
          // example = 2
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        [
          // example = 3
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      ]),
      ['example', 'pos', 'repSize'],
    );
    expect(g1.gshape()).toEqual({ example: 4, pos: 3, repSize: 2 });
    const g2 = g1.transpose();
    const g1DimsReversed = g1.dimNames.slice().reverse();
    expect(g2.dimNames).toEqual(g1DimsReversed);
    const g1TensorShapeReversed = g1.tensor.shape.slice().reverse();
    expect(g2.tensor.shape).toEqual(g1TensorShapeReversed);
  });

  it('transposeTo', async () => {
    const g1 = new gtensor.GTensor(
      tf.tensor(
        [
          [
            [1, 2],
            [3, 4],
            [5, 6],
          ], // example = 1
          [
            [1, 2],
            [3, 4],
            [5, 6],
          ], // example = 2
          [
            [1, 2],
            [3, 4],
            [5, 6],
          ], // example = 3
          [
            [1, 2],
            [3, 4],
            [5, 6],
          ],
        ], // example = 4
      ),
      ['example', 'pos', 'repSize'],
    );

    const g2 = new gtensor.GTensor(
      tf.tensor(
        [
          [
            [1, 2],
            [1, 2],
            [1, 2],
            [1, 2],
          ], // pos = 1
          [
            [3, 4],
            [3, 4],
            [3, 4],
            [3, 4],
          ], // pos = 2
          [
            [5, 6],
            [5, 6],
            [5, 6],
            [5, 6],
          ],
        ], // pos = 3
      ),
      ['pos', 'example', 'repSize'],
    );
    expect(g1.gshape()).toEqual({ pos: 3, example: 4, repSize: 2 });
    const likeg2 = g1.transposeLike(g2);
    expect(likeg2.dimNames).toEqual(g2.dimNames);
    expect(likeg2.tensor.shape).toEqual(g2.tensor.shape);
    tf.test_util.expectArraysClose(likeg2.tensor.dataSync(), g2.tensor.dataSync());
  });

  // TODO: add exception test also.
  it('broadcastToCombinedShape simple', async () => {
    const g1 = new gtensor.GTensor(
      tf.tensor([
        [1, 2, 3],
        [3, 4, 5],
        [5, 6, 7],
      ]),
      ['pos', 'repSize'],
    );

    const g2 = new gtensor.GTensor(
      tf.tensor(
        [1, 2, 3], // pos = 3
      ),
      ['pos'],
    );
    const g2big = g2.broadcastToCombinedShape(g1);

    expect(g2big.dimNames).toEqual(['repSize', 'pos']);
    tf.test_util.expectArraysEqual(g2big.tensor.arraySync(), [
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ]);
  });

  // TODO: add exception test also.
  it('broadcastToCombinedShape', async () => {
    const g1 = new gtensor.GTensor(
      tf.tensor(
        [
          [
            [1, 2],
            [3, 4],
            [5, 6],
          ], // example = 1
          [
            [1, 2],
            [3, 4],
            [5, 6],
          ],
        ], // example = 2
      ),
      ['example', 'pos', 'repSize'],
    );

    const g2 = new gtensor.GTensor(
      tf.tensor(
        [
          [
            [1, 2],
            [1, 2],
          ], // pos = 1
          [
            [3, 4],
            [3, 4],
          ], // pos = 2
          [
            [5, 6],
            [5, 6],
          ],
        ], // pos = 3
      ),
      ['pos', 'foo', 'repSize'],
    );
    expect(g2.gshape()).toEqual({ pos: 3, foo: 2, repSize: 2 });
    const g1big = g1.broadcastToCombinedShape(g2);

    expect(g1big.dimNames).toEqual(['foo', 'example', 'pos', 'repSize']);
    expect(g1big.gshape()).toEqual({ foo: 2, pos: 3, example: 2, repSize: 2 });
  });

  // TODO: add exception test also. Should fail and warn for broadcasting to an
  // existing dimension.
  it('broadcastTo', async () => {
    const g1 = new gtensor.GTensor(
      tf.tensor(
        [
          [
            [1, 2],
            [3, 4],
            [5, 6],
          ], // example = 1
          [
            [1, 2],
            [3, 4],
            [5, 6],
          ],
        ], // example = 2
      ),
      ['example', 'pos', 'repSize'],
    );

    const g1big = g1.broadcastTo(new Map([['foo', 2]]));

    expect(g1big.dimNames).toEqual(['foo', 'example', 'pos', 'repSize']);
    expect(g1big.gshape()).toEqual({ foo: 2, pos: 3, example: 2, repSize: 2 });
  });

  it('basicMultiplications', () => {
    // GTensor is the thing that holds a dimension map with the tensor and
    // dimNames.
    const bar = new gtensor.GTensor(
      tf.initializers.truncatedNormal({}).apply(
        // Dimension sizes. Notice: c = 3.
        [1, 2, 3, 4, 5],
      ),
      ['a', 'b', 'c', 'd', 'e'],
    );
    const foo = gtensor.makeZeros({ x: 6, y: 2, c: 3 });

    // Operations can be done only on type names that exist in the dimension
    // map.
    const g = foo.contract(bar, ['c']);

    // The following is, gloriously, a type error!
    //
    // const _ = foo.contract(bar, ['a']);
    //                              ^^^
    //          Type '"a"' is not assignable to type '"c"'

    expect(g.gshape()).toEqual({ a: 1, b: 2, d: 4, e: 5, x: 6, y: 2 });
    expect(g.dimNames).toEqual(['x', 'y', 'a', 'b', 'd', 'e']);
    expect(g.tensor.shape).toEqual([6, 2, 1, 2, 4, 5]);
  });

  it('pointwiseAdd', async () => {
    const bar = new gtensor.GTensor(
      tf.tensor([
        [1, 2],
        [3, 4],
      ]),
      ['example', 'repSize'],
    );
    const foo = new gtensor.GTensor(
      tf.tensor([
        [1, 2],
        [3, 4],
        [5, 6],
      ]),
      ['point_id', 'repSize'],
    );
    const r = bar.pointwiseAdd(foo);
    expect(r.gshape()).toEqual({ example: 2, point_id: 3, repSize: 2 });
    expect(r.dimNames).toEqual(['example', 'point_id', 'repSize']);
    expect(r.tensor.shape).toEqual([2, 3, 2]);
    tf.test_util.expectArraysClose(await r.tensor.data(), [
      [
        [2, 4],
        [4, 6],
        [6, 8],
      ],
      [
        [4, 6],
        [6, 8],
        [8, 10],
      ],
    ]);
  });

  it('pointwiseAdd2', async () => {
    const bar = new gtensor.GTensor(
      tf.tensor([
        [
          [1, 2],
          [3, 4],
        ],
      ]),
      ['batch', 'example', 'repSize'],
    );
    const foo = new gtensor.GTensor(
      tf.tensor([
        [1, 2],
        [3, 4],
        [5, 6],
      ]),
      ['point_id', 'repSize'],
    );
    const r = bar.pointwiseAdd(foo);
    expect(r.gshape()).toEqual({
      example: 2,
      batch: 1,
      point_id: 3,
      repSize: 2,
    });
    expect(r.tensor.shape).toEqual([1, 2, 3, 2]);
    tf.test_util.expectArraysClose(await r.tensor.data(), [
      [
        [
          [2, 4],
          [4, 6],
          [6, 8],
        ],
        [
          [4, 6],
          [6, 8],
          [8, 10],
        ],
      ],
    ]);
  });

  it('pointwiseAdd3', () => {
    const bar = new gtensor.GTensor(
      tf.tensor([
        [1, 2, 3],
        [2, 3, 4],
        [4, 5, 6],
      ]),
      ['pos', 'repSize'],
    );
    const foo = new gtensor.GTensor(tf.tensor([1, 2, 3]), ['pos']);
    const s1 = bar.pointwiseAdd(foo);
    const s2 = foo.pointwiseAdd(bar);

    tf.test_util.expectArraysEqual(s1.transpose().tensor.arraySync(), [
      [2, 3, 4],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    expect(s1.dimNames).toEqual(['repSize', 'pos']);
    tf.test_util.expectArraysEqual(s2.tensor.arraySync(), [
      [2, 3, 4],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    expect(s2.dimNames).toEqual(['pos', 'repSize']);
  });

  it('pointwiseAdd_no_common_dims', async () => {
    const bar = new gtensor.GTensor(
      tf.tensor([
        [1, 2],
        [3, 4],
      ]),
      ['example', 'repSize'],
    );
    const foo = new gtensor.GTensor(
      tf.tensor([
        [1, 2, 3],
        [3, 4, 5],
        [5, 6, 7],
      ]),
      ['point_id', 'repSize2'],
    );
    const r = bar.pointwiseAdd(foo);
    // console.log(r.tensor);
    // r.tensor.print();
    expect(r.dimNames).toEqual(['example', 'repSize', 'point_id', 'repSize2']);
    expect(r.tensor.shape).toEqual([2, 2, 3, 3]);
    tf.test_util.expectArraysClose(await r.tensor.data(), [
      [
        [
          [2, 3, 4],
          [4, 5, 6],
          [6, 7, 8],
        ],
        [
          [3, 4, 5],
          [5, 6, 7],
          [7, 8, 9],
        ],
      ],
      [
        [
          [4, 5, 6],
          [6, 7, 8],
          [8, 9, 10],
        ],
        [
          [5, 6, 7],
          [7, 8, 9],
          [9, 10, 11],
        ],
      ],
    ]);
  });

  it('pointwiseMul', async () => {
    const bar = new gtensor.GTensor(
      tf.tensor([
        [1, 2],
        [3, 4],
      ]),
      ['example', 'repSize'],
    );
    const foo = new gtensor.GTensor(
      tf.tensor([
        [1, 2],
        [3, 4],
        [5, 6],
      ]),
      ['point_id', 'repSize'],
    );
    const r = bar.pointwiseMul(foo);
    expect(r.gshape()).toEqual({ example: 2, point_id: 3, repSize: 2 });
    expect(r.dimNames).toEqual(['example', 'point_id', 'repSize']);
    expect(r.tensor.shape).toEqual([2, 3, 2]);
    tf.test_util.expectArraysClose(await r.tensor.data(), [
      [
        [1, 4],
        [3, 8],
        [5, 12],
      ],
      [
        [3, 8],
        [9, 16],
        [15, 24],
      ],
    ]);
  });

  it('mergeDims', () => {
    const t = new gtensor.GTensor(
      tf.tensor([
        [
          [0, 0],
          [0, 1],
        ],
        [
          [1, 0],
          [1, 1],
        ],
      ]),
      ['a', 'b', 'c'],
    );
    const t2 = t.mergeDims(['a', 'b'], 'ab');
    expect(t2.gshape()).toEqual({ ab: 4, c: 2 });
    tf.test_util.expectArraysClose(t2.tensor.dataSync(), [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);

    const t3 = t.mergeDims(['b', 'c'], 'bc');
    expect(t3.gshape()).toEqual({ a: 2, bc: 4 });
    tf.test_util.expectArraysClose(t3.tensor.dataSync(), [
      [0, 0, 0, 1],
      [1, 0, 1, 1],
    ]);

    const t4 = t.mergeDims(['a', 'c'], 'ac');
    expect(t4.gshape()).toEqual({ ac: 4, b: 2 });
    tf.test_util.expectArraysClose(t3.tensor.dataSync(), [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it('splitDims', () => {
    const t = new gtensor.GTensor(
      tf.tensor([
        [0, 0, 0],
        [0, 1, 0],
        [1, 0, 0],
        [1, 1, 0],
      ]),
      ['example', 'rep'],
    );
    const t2 = t.splitDim('example', { x: 2, y: 2 });
    expect(t2.gshape()).toEqual({ x: 2, y: 2, rep: 3 });
    tf.test_util.expectArraysClose(t2.tensor.dataSync(), [
      [
        [0, 0, 0],
        [0, 1, 0],
      ],
      [
        [1, 0, 0],
        [1, 1, 0],
      ],
    ]);
  });

  it('prodOverDims', () => {
    const t = new gtensor.GTensor(
      tf.tensor([
        [
          [0, 0],
          [0, 1],
        ],
        [
          [1, 0],
          [1, 1],
        ],
      ]),
      ['a', 'b', 'c'],
    );

    const rSumA = t.prodOverDims(['a']);
    expect(rSumA.gshape()).toEqual({ b: 2, c: 2 });
    tf.test_util.expectArraysClose(rSumA.tensor.dataSync(), [
      [0, 0],
      [0, 1],
    ]);

    const rSumB = t.prodOverDims(['b']);
    expect(rSumB.gshape()).toEqual({ a: 2, c: 2 });
    tf.test_util.expectArraysClose(rSumB.tensor.dataSync(), [
      [0, 0],
      [1, 0],
    ]);

    const rSumC = t.prodOverDims(['c']);
    expect(rSumC.gshape()).toEqual({ a: 2, b: 2 });
    tf.test_util.expectArraysClose(rSumC.tensor.dataSync(), [
      [0, 0],
      [0, 1],
    ]);

    const rSumAB = t.prodOverDims(['a', 'b']);
    expect(rSumAB.gshape()).toEqual({ c: 2 });
    tf.test_util.expectArraysClose(rSumAB.tensor.dataSync(), [0, 0]);
  });

  it('sumOverDims', () => {
    const t = new gtensor.GTensor(
      tf.tensor([
        [
          [0, 0],
          [0, 1],
        ],
        [
          [1, 0],
          [1, 1],
        ],
      ]),
      ['a', 'b', 'c'],
    );

    const rSumA = t.sumOverDims(['a']);
    expect(rSumA.gshape()).toEqual({ b: 2, c: 2 });
    tf.test_util.expectArraysClose(rSumA.tensor.dataSync(), [
      [1, 0],
      [1, 2],
    ]);

    const rSumB = t.sumOverDims(['b']);
    expect(rSumB.gshape()).toEqual({ a: 2, c: 2 });
    tf.test_util.expectArraysClose(rSumB.tensor.dataSync(), [
      [0, 1],
      [2, 1],
    ]);

    const rSumC = t.sumOverDims(['c']);
    expect(rSumC.gshape()).toEqual({ a: 2, b: 2 });
    tf.test_util.expectArraysClose(rSumC.tensor.dataSync(), [
      [0, 1],
      [1, 2],
    ]);

    const rSumAB = t.sumOverDims(['a', 'b']);
    expect(rSumAB.gshape()).toEqual({ c: 2 });
    tf.test_util.expectArraysClose(rSumAB.tensor.dataSync(), [2, 2]);
  });

  it('serialisation', () => {
    const g = new gtensor.GTensor(
      tf.tensor([
        [1, 0],
        [2, 1],
        [3, 1],
      ]),
      ['point_id', 'inputRepSize'],
    );
    const g2 = GTensor.fromSerialised(g.toSerialised());
    expect(g.tensor.arraySync()).toEqual(g2.tensor.arraySync());
  });

  it('squaredDiff', async () => {
    const paramPositions = new gtensor.GTensor(
      tf.tensor([
        [1, 0],
        [0, 1],
        [1, 1],
      ]),
      ['point_id', 'inputRepSize'],
    );

    const r = paramPositions.squaredDifference(paramPositions.rename('point_id', 'point_id2'));

    expect(r.gshape()).toEqual({ point_id: 3, point_id2: 3, inputRepSize: 2 });
    tf.test_util.expectArraysClose(await r.tensor.data(), [
      [
        [0, 0],
        [1, 1],
        [0, 1],
      ],
      [
        [1, 1],
        [0, 0],
        [1, 0],
      ],
      [
        [0, 1],
        [1, 0],
        [0, 0],
      ],
    ]);
  });

  it('gather', () => {
    // Making a GTensor from a tensor by naming the dimensions:
    const g = new gtensor.GTensor(
      tf.tensor([
        [1, 2, 3, 4],
        [5, 6, 7, 8],
      ]),
      ['heads', 'relativePos'],
    );

    const indexes = new gtensor.GTensor(
      tf.tensor(
        [
          [0, 1],
          [1, 2],
          [2, 3],
        ],
        [3, 2],
        'int32',
      ),
      ['keyPos', 'queryPos'],
    );

    const gathered = g.gather(indexes, 'relativePos');
    expect(gathered.dimNames).toEqual(['heads', 'keyPos', 'queryPos']);
    tf.test_util.expectArraysClose(
      gathered.tensor.dataSync(),
      tf
        .tensor([
          [
            [1, 2],
            [2, 3],
            [3, 4],
          ],
          [
            [5, 6],
            [6, 7],
            [7, 8],
          ],
        ])
        .dataSync(),
    );
  });

  it('variable assign', () => {
    // Making a GTensor from a tensor by naming the dimensions:
    const x = new gtensor.GTensor(tf.tensor([1, 2, 3, 4]), ['foo']);

    const x2 = new gtensor.GTensor(tf.tensor([0, 0, 0, 0]), ['foo']);

    expect(tf.all(tf.equal(x.tensor, x2.tensor)).dataSync()[0]).toEqual(0);

    const y = new gtensor.GVariable(x);

    tf.test_util.expectArraysEqual(y.tensor.dataSync(), x.tensor.dataSync());

    y.assign(x2);

    tf.test_util.expectArraysEqual(y.tensor.dataSync(), x2.tensor.dataSync());
  });

  it('softmax', () => {
    // Making a GTensor from a tensor by naming the dimensions:
    const g = new gtensor.GTensor(
      tf.tensor([
        [
          // 'example' dimension index 0
          [1, 2.1],
          [3, 4.2], // pos index 1
          [5, 6.3], // pos index 2
        ],
        [
          [2, 3.1],
          [3, 4.2],
          [6, 7.3],
        ], // example index 1
      ]),
      ['batch', 'pos', 'repSize'],
    );

    tf.test_util.expectArraysClose(
      g.softmax('repSize').tensor.dataSync(),
      tf
        .tensor([
          [
            tf.softmax([1, 2.1]).dataSync(),
            tf.softmax([3, 4.2]).dataSync(),
            tf.softmax([5, 6.3]).dataSync(),
          ],
          [
            tf.softmax([2, 3.1]).dataSync(),
            tf.softmax([3, 4.2]).dataSync(),
            tf.softmax([6, 7.3]).dataSync(),
          ],
        ])
        .dataSync(),
    );

    const gsoftmax = g.softmax('pos');

    const batch0pos0rep = tf.softmax([1, 3, 5]).dataSync();
    const batch0pos1rep = tf.softmax([2.1, 4.2, 6.3]).dataSync();
    const batch1pos0rep = tf.softmax([2, 3, 6]).dataSync();
    const batch1pos1rep = tf.softmax([3.1, 4.2, 7.3]).dataSync();
    const expectedGTensor = new gtensor.GTensor(
      tf.tensor([
        [
          [batch0pos0rep[0], batch0pos1rep[0]],
          [batch0pos0rep[1], batch0pos1rep[1]],
          [batch0pos0rep[2], batch0pos1rep[2]],
        ],
        [
          [batch1pos0rep[0], batch1pos1rep[0]],
          [batch1pos0rep[1], batch1pos1rep[1]],
          [batch1pos0rep[2], batch1pos1rep[2]],
        ],
      ]),
      ['batch', 'pos', 'repSize'],
    );
    tf.test_util.expectArraysClose(
      gsoftmax.tensor.dataSync(),
      expectedGTensor.transposeLike(gsoftmax).tensor.dataSync(),
    );
  });

  it('unstack', () => {
    // Making a GTensor from a tensor by naming the dimensions:
    const g = new gtensor.GTensor(
      tf.tensor([
        [
          // 'example' dimension index 0
          [
            // 'pos' dimension index 0: contains an array of repSize
            1, // 'repSize' dimension index 0
            2, // repSize index 1
          ],
          [3, 4], // pos index 1
          [5, 6], // pos index 2
        ],
        [
          [2, 3],
          [3, 4],
          [6, 7],
        ], // example index 1
      ]),
      ['example', 'pos', 'repSize'],
    );

    const gs = g.unstack('pos');

    expect(gs.length).toEqual(3);
  });

  it('attentionHead1', () => {
    const queryM = gtensor.makeTruncNormal({ inputRep: 2, kqRep: 3 });
    const keyM = gtensor.makeTruncNormal({ inputRep: 2, kqRep: 3 });
    const valueM = gtensor.makeTruncNormal({ inputRep: 2, valueRep: 4 });
    const oneInput = gtensor.makeTruncNormal({ seqLen: 8, inputRep: 2 });
    const batchedInput = gtensor.makeTruncNormal({
      batchSize: 10,
      seqLen: 8,
      inputRep: 2,
    });

    function attentionHeadFn(
      input: GTensor<'seqLen' | 'inputRep'>,
    ): GTensor<'seqLen' | 'valueRep'> {
      const inputKeys = input.contract(keyM, ['inputRep']).rename('seqLen', 'keySeqLen');
      const inputQueries = input.contract(queryM, ['inputRep']);
      const attention = inputKeys.contract(inputQueries, ['kqRep']);
      const values = input.contract(valueM, ['inputRep']);
      const attendedValues = values.contract(attention, ['seqLen']).rename('keySeqLen', 'seqLen');
      return attendedValues;
    }

    const attendedValues0 = attentionHeadFn(oneInput);
    expect(attendedValues0.gshape()).toEqual({
      seqLen: 8,
      valueRep: 4,
    });

    const batchedAttentionHeadFn = gtensor.liftGTensorFnOverDim('batchSize', attentionHeadFn);
    const batchedAttendedValues = batchedAttentionHeadFn(batchedInput);
    expect(batchedAttendedValues.gshape()).toEqual({
      batchSize: 10,
      seqLen: 8,
      valueRep: 4,
    });
  });

  xit('attentionHead2', () => {
    const queryM = gtensor.makeTruncNormal({ inputRep: 2, kqRep: 3 });
    const keyM = gtensor.makeTruncNormal({ inputRep: 2, kqRep: 3 });
    const valueM = gtensor.makeTruncNormal({ inputRep: 2, valueRep: 4 });
    const oneInput = gtensor.makeTruncNormal({ seqLen: 8, inputRep: 2 });
    const batchedInput = gtensor.makeTruncNormal({
      batchSize: 10,
      seqLen: 8,
      inputRep: 2,
    });

    // It's possible to make input be matched strictly, but you have to introduce `ExactDims`
    // wrapper and a new type parameter. :/
    interface ErrorGivenHadExtraTypes<T> {
      _Error_GivenHadExtraTypes: ['Error_GivenHadExtraTypes', T];
    }

    type ExactGTensor<Exact extends string, Given extends string> =
      Exclude<Given, Exact> extends never
        ? GTensor<Given>
        : ErrorGivenHadExtraTypes<Exclude<Given, Exact>>;

    function attentionHeadFn2<T extends string>(
      maybeInput: ExactGTensor<'seqLen' | 'inputRep', T>,
    ): GTensor<'seqLen' | 'valueRep'> {
      const input = maybeInput as never as GTensor<'seqLen' | 'inputRep'>;
      const inputKeys = input.contract(keyM, ['inputRep']).rename('seqLen', 'keySeqLen');
      const inputQueries = input.contract(queryM, ['inputRep']);
      const attention = inputKeys.contract(inputQueries, ['kqRep']);
      const values = input.contract(valueM, ['inputRep']);
      const attendedValues = values.contract(attention, ['seqLen']).rename('keySeqLen', 'seqLen');
      return attendedValues;
    }
    // Bug/TODO: extra dimensions don't get caught by type-checker. :(
    //   const attendedValues = attentionHeadFn(batchedInput);
    // Maybe we have to use record types instead of simple string unions...

    // const attendedValues2 = attentionHeadFn2(batchedInput); // Has error, yay, but what a mess...
    const attendedValues3 = attentionHeadFn2(oneInput);
  });

  it('simple Lower triangular -Inf mask', async () => {
    const g1 = new gtensor.GTensor(
      tf.tensor([
        [
          [
            [1, 2, 3],
            [3, 4, 5],
            [5, 6, 7],
          ],
        ],
      ]),
      ['heads', 'batch', 'Pos1', 'Pos2'],
    );
    const g1tril = g1.TriangularMask(['batch', 'Pos1', 'Pos2'], -Infinity, 0);

    expect(g1tril.dimNames).toEqual(['heads', 'batch', 'Pos1', 'Pos2']);
    tf.test_util.expectArraysEqual(g1tril.tensor.arraySync(), [
      [
        [
          [0, -Infinity, -Infinity],
          [0, 0, -Infinity],
          [0, 0, 0],
        ],
      ],
    ]);
  });

  it('Multiple heads Lower triangular -Inf mask', async () => {
    const g1 = new gtensor.GTensor(
      tf.tensor([
        [
          [
            [1, 2, 3],
            [3, 4, 5],
            [5, 6, 7],
          ],
          [
            [8, 9, 10],
            [11, 12, 13],
            [14, 15, 16],
          ],
        ],
        [
          [
            [1, 2, 3],
            [3, 4, 5],
            [5, 6, 7],
          ],
          [
            [8, 9, 10],
            [11, 12, 13],
            [14, 15, 16],
          ],
        ],
      ]),
      ['heads', 'batch', 'Pos1', 'Pos2'],
    );
    const g1tril = g1.TriangularMask(['batch', 'Pos1', 'Pos2'], 42, 1);

    expect(g1tril.dimNames).toEqual(['heads', 'batch', 'Pos1', 'Pos2']);
    tf.test_util.expectArraysEqual(g1tril.tensor.arraySync(), [
      [
        [
          [1, 42, 42],
          [1, 1, 42],
          [1, 1, 1],
        ],

        [
          [1, 42, 42],
          [1, 1, 42],
          [1, 1, 1],
        ],
      ],

      [
        [
          [1, 42, 42],
          [1, 1, 42],
          [1, 1, 1],
        ],

        [
          [1, 42, 42],
          [1, 1, 42],
          [1, 1, 1],
        ],
      ],
    ]);
  });
});
