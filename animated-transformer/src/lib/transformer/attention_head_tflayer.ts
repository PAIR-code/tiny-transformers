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
import { LayerArgs } from '@tensorflow/tfjs-layers/dist/engine/topology';
import { getExactlyOneShape, getExactlyOneTensor } from '@tensorflow/tfjs-layers/dist/utils/types_utils';
import { ValueError } from '@tensorflow/tfjs-layers/dist/errors';

// Creating custom layers is has very little and sparse documentation, but rather complex
// requirements. Sadly, at the moment the best way to understand what you need to do is guess from
// existing examples. For example look at:
// https://github.com/tensorflow/tfjs-examples/blob/master/fashion-mnist-vae/model.js
//
// And also the raw sourse code for various layer constructions, like:
// https://github.com/tensorflow/tfjs/blob/master/tfjs-layers/src/layers/recurrent.ts
//
// There's a graveyard of failed attempts at this that is maybe 100x time the code here.

export interface AttentionHeadParams {
  // Inferred when input shape is given.
  // inputRepSize: number;
  // The Key and Query representation size.
  kqRepSize: number;
  // The value representation size.
  valueRepSize: number;
}
export interface AttentionHeadConfig extends AttentionHeadParams, LayerArgs { }

// Use these to reference the parts in the array of returned Tensors from attention head.
export const ATTENDED_VALUES_PART_IDX = 0;
export const ATTENTION_PART_IDX = 1;
export const VALUES_PART_IDX = 2;
export const KEYS_PART_IDX = 3;
export const QUERIES_PART_IDX = 4;

export class AttentionHead extends tf.layers.Layer {
  valueM!: tf.LayerVariable;
  keyM!: tf.LayerVariable;
  queryM!: tf.LayerVariable;

  // Depends on the input given, but defines the parameters created.
  inputRepSize: number | null = null;

  kqRepSize: number;
  valueRepSize: number;

  // Cached static value of the square root of the kq rep sized used for
  // attention normalization.
  kqRepSizeSqrt: tf.Tensor;

  constructor(config: AttentionHeadConfig) {
    super(config);
    // inputRepSize can be worked out dynamically from the given input.
    // this.inputRepSize = config.inputRepSize;
    this.kqRepSize = config.kqRepSize;
    this.valueRepSize = config.valueRepSize;
    this.kqRepSizeSqrt = tf.sqrt(this.kqRepSize);
  }

  override build(inputShape: tf.Shape | tf.Shape[]): void {
    inputShape = getExactlyOneShape(inputShape);

    this.inputRepSize = inputShape[inputShape.length - 1];

    this.valueM = this.addWeight('valueM', [this.inputRepSize, this.valueRepSize], 'float32',
      tf.initializers.truncatedNormal({}), undefined, true, undefined);

    this.keyM = this.addWeight('keyM', [this.inputRepSize, this.kqRepSize], 'float32',
      tf.initializers.truncatedNormal({}), undefined, true, undefined);

    this.queryM = this.addWeight('queryM', [this.inputRepSize, this.kqRepSize], 'float32',
      tf.initializers.truncatedNormal({}), undefined, true, undefined);
  }

  // Note: inputShape, with batches, will be [batchSize, seqLen, repSize]
  // When applied without batches, it will be just [seqLen, repSize].
  // When batchSize is not yet known, it's value is null.
  //
  // This function needs to work for all cases.
  override computeOutputShape(inputShape: tf.Shape | tf.Shape[]): tf.Shape | tf.Shape[] {
    // console.log('inputShape:', inputShape);
    inputShape = getExactlyOneShape(inputShape);
    // console.log('inputShape:', inputShape);
    if (inputShape.length !== 3) {
      throw new ValueError(
        `AttentionHead.call() expects input tensor to be rank-3 ` +
        `[batchSize, seqLen, repSize], but ` +
        `received a tensor of shape ${inputShape}`);
    }
    // inputShapeWithoutRepSize = [batchSize, seqLen]
    const inputShapeWithoutRepSize = inputShape.slice(0, inputShape.length - 1);
    const attendedValueShape = inputShapeWithoutRepSize.concat(this.valueRepSize);
    const valueShape = inputShapeWithoutRepSize.concat(this.valueRepSize);
    const attendedKeyShape = inputShapeWithoutRepSize.concat(this.kqRepSize);
    const attendedQueryShape = inputShapeWithoutRepSize.concat(this.kqRepSize);
    const seqLen = inputShape[inputShape.length - 2];
    const attentionShape = inputShapeWithoutRepSize.concat(seqLen);
    // console.log([attendedValueShape, attentionShape, valueShape, attendedKeyShape, attendedQueryShape]);
    return [attendedValueShape, attentionShape, valueShape, attendedKeyShape, attendedQueryShape];
  }

  static get className(): string {
    return 'AttentionHead';
  }

  attendOneExample(example: tf.Tensor2D
  ): {
    attendedValues: tf.Tensor2D,
    attention: tf.Tensor2D,
    values: tf.Tensor2D,
    keys: tf.Tensor2D,
    queries: tf.Tensor2D
  } {

    // keys.shape == [seqLen, kqRepSize]
    const keys: tf.Tensor2D = tf.matMul(example, this.keyM.read());
    // console.log('keys.shape', keys.shape);

    // queries.shape == [seqLen, kqRepSize]
    const queries: tf.Tensor2D = tf.matMul(example, this.queryM.read());

    // TODO: do like T5: no explicit rescaling of the attention by
    // div(_,sqrt(kqRepSize)). It's done in the initialization of the
    // linear transformations (equivalent under Adafactor).
    //
    // attention.shape == [seqLen (query), seqLen (key)]
    const attention = tf.softmax(
      tf.div(tf.matMul(queries, keys, false, true), this.kqRepSizeSqrt)) as tf.Tensor2D;
    // console.log('attention.shape:', attention.shape);

    // values.shape == [seqLen, valueRepSize]
    const values: tf.Tensor2D = tf.matMul(example, this.valueM.read());
    // console.log('values.shape:', values.shape);

    // attendedValues.shape == [seqLen (query), valueRepSize]
    const attendedValues: tf.Tensor2D = tf.matMul(attention, values);
    // console.log('attendedValues.shape:', attendedValues.shape);

    return { attendedValues, attention, values, keys, queries };
  }

  /**
   * Attention Head computation calculates this attention head's value for every
   * input, and also returns intermediate computations.
   *
   * inputEmbedding.shape == [batchSize, seqLen, inputRepSize]
   */
  override call(inputEmbeddings: tf.Tensor3D | tf.Tensor3D[], _kwargs: never): tf.Tensor[] {
    return tf.tidy(() => {
      const inputEmbedding = getExactlyOneTensor(inputEmbeddings) as tf.Tensor;
      if (inputEmbedding.shape.length !== 3) {
        throw new ValueError(
          `AttentionHead.call() expects input tensor to be rank-3 ` +
          `[batchSize, seqLen, repSize], but ` +
          `received a tensor of rank-${inputEmbedding.shape.length}`);
      }

      const examples = tf.unstack(inputEmbedding, 0);
      const atteendedStuff = examples.map(e => this.attendOneExample(e as tf.Tensor2D));
      const result = {} as {
        attendedValues: tf.Tensor3D,
        attention: tf.Tensor3D,
        values: tf.Tensor3D,
        keys: tf.Tensor3D,
        queries: tf.Tensor3D
      };
      result.attendedValues = tf.stack(atteendedStuff.map(m => m.attendedValues)) as tf.Tensor3D;
      result.attention = tf.stack(atteendedStuff.map(m => m.attention)) as tf.Tensor3D;
      result.values = tf.stack(atteendedStuff.map(m => m.attendedValues)) as tf.Tensor3D;
      result.keys = tf.stack(atteendedStuff.map(m => m.keys)) as tf.Tensor3D;
      result.queries = tf.stack(atteendedStuff.map(m => m.queries)) as tf.Tensor3D;

      // // Old Implementation... overly optimistic about batch handling...
      //
      // // keys.shape == [batchSize, seqLen, kqRepSize]
      // const keys = tf.matMul(inputEmbedding, this.keyM.read())
      // // console.log('keys.shape', keys.shape);

      // // queries.shape == [batchSize, seqLen, kqRepSize]
      // const queries = tf.matMul(inputEmbedding, this.queryM.read())

      // // Guess: this doesn't work because it would/does produce:
      // // [batchSize, batchSize, seqLen (query), seqLen (key)], not:
      // // [batchSize, seqLen (query), seqLen (key)]
      // //
      // // Why this doesn't produce a size mis-match error is unclear, maybe sizes are not checked // // for lists?
      // //
      // // attention.shape == [batchSize, seqLen (query), seqLen (key)]
      // const attention = tf.matMul(queries, keys, false, true);
      // console.log('attention.shape:', attention.shape);

      // // values.shape == [batchSize, seqLen, valueRepSize]
      // const values = tf.matMul(inputEmbedding, this.valueM.read())
      // console.log('values.shape:', values.shape);

      // // attendedValues.shape == [batchSize, seqLen (query), valueRepSize]
      // const attendedValues: tf.Tensor3D = tf.matMul(attention, values);
      // console.log('attendedValues.shape:', attendedValues.shape);

      return [result.attendedValues, result.attention, result.values, result.keys, result.queries];
    });
  }
}

tf.serialization.registerClass(AttentionHead);


