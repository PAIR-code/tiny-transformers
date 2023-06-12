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
import {
  AttentionHead,
  ATTENDED_VALUES_PART_IDX,
  ATTENTION_PART_IDX,
  VALUES_PART_IDX,
  KEYS_PART_IDX,
  QUERIES_PART_IDX,
} from './attention_head_tflayer';

// TODOs:
// - dropout. Attention is all you need: rate 0.1; T5: applies to input, output, skip-connections,
//   attention, attention weights, FF network.
// - T5 layer norm: activations are only rescaled and no additive bias is applied.
// - residual layer connections (limits the variability in the value dimension).

export interface EncoderConfig {
  // Note: seqLen doesn't define any parameters; but it's needed at layer construction becuase tf
  // doesn't know that no parameters depend on it (in theory I could define a model that depended on
  // the seqLength, and only worked for one seqLength). This means that to change seqLength, you can
  // create a new model with a new seqLen and safely just import the weights.
  seqLen: number;
  // If true, then returns intermediate computed values of the transformer. Like seqLen, this does
  // not define parameters. So you can make a new model with a different value of this and seqLen,
  // and import the weights and it will be fine.
  returnAllParts?: boolean;

  // These values actually define weights.
  inputRepSize: number;  // Can be inferred from what the encoder is applied to.
  // Assumes all attention head have the same parameters.
  // TODO: consider hetrogenious attention heads.
  nAttnHeads: number; // = Number of Values = Number of Keys (= number of Queries).
  // Internal representation space.
  kqRepSize: number;
  valueRepSize: number;

  // Internal ff network size (transformers have 2 layers). If unspecified, same as output.
  ffInnerRepSize?: number;
  outputRepSize: number; // Representation size of values.
}

export type SymbolicAttentionParts = [
  tf.SymbolicTensor, // AttendedValues
  tf.SymbolicTensor, // Attention
  tf.SymbolicTensor, // Values
  tf.SymbolicTensor, // Keys
  tf.SymbolicTensor, // Queries
];

export type TransformerParts = [
  tf.Tensor3D, // TransformerOuput = FFN(AttendedValues)
  tf.Tensor3D, // AttendedValues = Attention * Values
  tf.Tensor3D, // Attention = Queries * Keys
  tf.Tensor3D, // Values = [batchSize, seqLen, valueRepSize]
  tf.Tensor3D, // Keys = [batchSize, seqLen, kqRepSize]
  tf.Tensor3D, // Queries = [batchSize, seqLen, kqRepSize]
];

/**
 * An encoder transformer model (without layer or batch normalization).
 */
export function encoder(config: EncoderConfig): tf.LayersModel {

  const inputs = tf.input({
    shape: [config.seqLen, config.inputRepSize],
    name: 'encoder_input'
  });

  const attentionHeads: AttentionHead[] = [];
  for (let i = 0; i < config.nAttnHeads; i++) {
    attentionHeads.push(new AttentionHead(config));
  }

  const attentionParts: SymbolicAttentionParts[] =
    attentionHeads.map(h => h.apply(inputs) as SymbolicAttentionParts);

  const attnHeadValues = attentionParts.map(parts => parts[ATTENDED_VALUES_PART_IDX]);

  const attnHeadValuesAsOne = tf.layers.concatenate().apply(attnHeadValues) as tf.SymbolicTensor;

  // TODO: Residual requires that input dim = value dim. Think about this. For now skipping the
  // attention head residual.
  //
  // const attentionWithResidual = tf.layers.add().apply([inputs, attnHeadValuesAsOne]);
  // const attentionNormalized = tf.layers.layerNormalization().apply(attentionWithResidual);
  const attentionNormalized = tf.layers.layerNormalization().apply(attnHeadValuesAsOne);
  // console.log((attentionNormalized as tf.Tensor).shape);

  const transformerOutput =
    tf.layers.dense({
      name: 'transformer_ff_output_l2',
      units: config.outputRepSize,
    }).apply(
      tf.layers.dense({
        name: 'transformer_ff_output_l1_w_act',
        units: config.ffInnerRepSize || config.outputRepSize,
        activation: 'relu'
      })
        .apply(attentionNormalized)) as tf.SymbolicTensor;
  // TODO: rescale 1/ sqrt(output dim size). Or fold it into the initialization.

  // TODO: Residual requires that output dim = value dim. Think about this. For now skipping the
  // attention head residual.
  //
  // const transformerOutputWithResidual = tf.layers.add().apply(
  //   transformerOutput, attentionNormalized);
  const transformerOutputNormalized = tf.layers.layerNormalization().apply(
    transformerOutput) as tf.SymbolicTensor;

  let outputs = [transformerOutputNormalized];
  if (config.returnAllParts) {
    const attentionsAsOne = tf.layers.concatenate().apply(attentionParts.map(
      parts => parts[ATTENTION_PART_IDX])) as tf.SymbolicTensor;
    const valuesAsOne = tf.layers.concatenate().apply(attentionParts.map(
      parts => parts[VALUES_PART_IDX])) as tf.SymbolicTensor;
    const keysAsOne = tf.layers.concatenate().apply(attentionParts.map(
      parts => parts[KEYS_PART_IDX])) as tf.SymbolicTensor;
    const queriesAsOne = tf.layers.concatenate().apply(attentionParts.map(
      parts => parts[QUERIES_PART_IDX])) as tf.SymbolicTensor;

    outputs = outputs.concat([attnHeadValuesAsOne, attentionsAsOne, valuesAsOne, keysAsOne, queriesAsOne]);
  }

  return tf.model({ inputs, outputs, name: 'transformer-encoder' });
}
