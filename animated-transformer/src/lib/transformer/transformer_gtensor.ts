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

/**
 * Transformers implemented using GTensor.
 *
 * TODO: encode-decoder. (currently only have decoder models)
 * TODO: MQA: https://arxiv.org/pdf/1911.02150.pdf
 * TODO: loss for all tokens (currently just the last token).
 * TODO: Adam optimiser / others (currently only have SGD).
 * TODO: backprop to embeddings too.
 */
import { relu, tanh, tensor, Tensor, oneHot, Scalar } from '@tensorflow/tfjs';
import * as tf from '@tensorflow/tfjs';
import {
  GTensor,
  DName,
  makeTruncNormal,
  makeZeros,
  makeOnes,
  makeScalar,
  GVariable,
  SerializedGTensor,
} from '../gtensor/gtensor';
import {
  ConstTKind,
  serializeParams,
  GTensorKindFn,
  SerializeTensorParams,
  SerialTKind,
  deserializeParams,
  TensorKind,
  VarifyTensorParams,
  VarTKind,
} from '../gtensor/params';

import * as tf_init from '@tensorflow/tfjs-layers/dist/initializers';
import {
  BatchedRelativePosAttention,
  initRawRelativePosEncoding,
  makePosAttentionMatrix,
} from './relative_pos_encoding';
import { initLayerNormParams, layerNorm, LayerNormParams } from '../gtensor/layer_norm';
import { dropout } from './dropout';
// import { GTensorTree, GVariableTree } from '../gtensor/gtensor_tree';
import { BasicTaskTokenRep, StrSeqPrepFn, toyTokenTep } from '../tokens/token_gemb';
import * as jstree from '../js_tree/js_tree';
import { makeModel, modelRegistry } from '../models/model_registry';
import { RandomStream } from '../random/random';
// import { SavableValueKind } from '../weblab/savable-value';

// ---------------------------------------------------------------------------
export type TransformerConfig = {
  id: string;
  kind: 'Transformer';
  // Defines how the transformer is created.
  spec: TransformerParamSpec;
  tokenRep: BasicTaskTokenRep;
  init: {
    // === tf_init.TruncatedNormalArgs
    stddev: number;
    mean: number;
    seed: number;
  };
};

export type TransformerParamSpec = {
  inputRep: number;
  kqvRep: number;
  layers: TransformerParamLayerSpec[];
  // Dropout rate on the input before going into the stack.
  dropoutRate: number;
  relPosEncodingSeqLength?: number;
};

// ---------------------------------------------------------------------------

export type AttnHeadParamSpec = {
  inputRep: number;
  kq: number;
  heads: number;
  value: number;
  // ffRep: number;
  // ffOut: number;
  // Used for creating the relative position encodings.
  maxRelPosSeqLen?: number;
  layerNormHeadsProjection: boolean;
  layerNormFF: boolean;
  addLayerNormBias: boolean;
  // Note: residual spec don't introduce params, so they are not here.
  // It's only relevant to computation.
  // Note: dropout spec don't introduce params, so they are not here either.
};

export type TransformerParamLayerSpec = {
  nHeads: number;
  hasPosEncoding: boolean;
  layerNormFF: boolean;
  layerNormHeadsProjection: boolean;
  addLayerNormBias: boolean; // only meaningful when one of the above is true.
  computeSpec: AttnHeadComputeSpec;
};

export type AttnHeadComputeSpec = {
  // Whether to include or not the residual connections in the computation.
  residuals: boolean;
  dropoutRate: number;
};

export function defaultTransformerConfig(): TransformerConfig {
  const layer_config: TransformerParamLayerSpec = {
    nHeads: 4,
    hasPosEncoding: false,
    // There may be a problem with layer norm; it seems to stop it from learning.
    // With laynorm off, we get entropyLoss: 1.05391383  accuracy: 0.53125000
    // with it on, we get lowest entropyLoss: 1.7 ish, and accuracy: ~0.35
    layerNormFF: false,
    layerNormHeadsProjection: false,
    addLayerNormBias: false,
    computeSpec: { residuals: true, dropoutRate: 0 },
  };
  const layer_config_first: TransformerParamLayerSpec = {
    ...layer_config,
    hasPosEncoding: false,
  };
  const spec: TransformerParamSpec = {
    inputRep: 64,
    kqvRep: 64,
    dropoutRate: 0,
    layers: [layer_config_first, layer_config, layer_config, layer_config],
  };
  const config: TransformerConfig = {
    id: 'defaultTransformerConfig',
    kind: 'Transformer',
    spec: spec,
    tokenRep: toyTokenTep,
    init: {
      stddev: 0.05, // default
      mean: 0,
      seed: 42,
    },
  };
  return config;
}

export const simpleLayerSpec_nLN: TransformerParamLayerSpec = {
  nHeads: 4,
  hasPosEncoding: true,
  computeSpec: { residuals: true, dropoutRate: 0 },
  layerNormFF: false,
  layerNormHeadsProjection: false,
  addLayerNormBias: false,
};

export const simpleTransfomerConfig_nLN: TransformerConfig = {
  id: 'd=8 l=1 h=4, !layerN',
  kind: 'Transformer',
  spec: {
    inputRep: 8,
    kqvRep: 8,
    dropoutRate: 0,
    layers: [simpleLayerSpec_nLN],
  },
  tokenRep: toyTokenTep,
  init: {
    stddev: 0.5,
    mean: 0,
    seed: 76,
  },
};

export const simpleLayerSpec_LN: TransformerParamLayerSpec = {
  nHeads: 4,
  hasPosEncoding: true,
  computeSpec: { residuals: true, dropoutRate: 0 },
  layerNormFF: true,
  layerNormHeadsProjection: true,
  addLayerNormBias: false,
};

export const simpleTransfomerConfig_LN: TransformerConfig = {
  id: 'd=8 l=1 h=4 +layerN',
  kind: 'Transformer',
  spec: {
    inputRep: 8,
    kqvRep: 8,
    dropoutRate: 0,
    layers: [simpleLayerSpec_LN],
  },
  tokenRep: toyTokenTep,
  init: {
    stddev: 0.5,
    mean: 0,
    seed: 96,
  },
};

// ---------------------------------------------------------------------------
export type FfParams<Input extends DName, Output extends DName> = {
  w: GTensor<Input | Output>;
  bIn: GTensor<Output>;
  bOut: GTensor<Output>;
};

// Use of type here to be compatible with generic params.
export type AttnHeadParams = {
  queryM: GTensor<'heads' | 'inputRep' | 'kq'>;
  keyM: GTensor<'heads' | 'inputRep' | 'kq'>;
  valueM: GTensor<'heads' | 'inputRep' | 'value'>;
  headsToInputRepM: GTensor<'heads' | 'value' | 'inputRepToFF'>;
  // workaround for https://github.com/microsoft/TypeScript/issues/48070
  layerNormHeadsProjection?: LayerNormParams;
  layerNormPostFF?: LayerNormParams;
  ff: FfParams<'inputRepToFF', 'inputRep'>;
  // ff2: FfParams<'ffRep', 'ffOut'>;
  // Relative position attention
  relativePosAttention?: GTensor<'heads' | 'relativePos'>;
};

// Use of type here to be compatible with generic params.
export type TransformerParams = {
  layers: AttnHeadParams[];
  tokenEmbedding: GTensor<'tokenId' | 'inputRep'>;
};

export type VarTransformerParams = VarifyTensorParams<TransformerParams>;
export type SerialTransformerParams = SerializeTensorParams<TransformerParams>;

// type TransformerParamsCheck = VarTransformerParams extends TransformerParams ? true : false;

export type TransformerModel = {
  // Locally cached version of the model.
  config: TransformerConfig;
  params: TransformerParams;
};

// export const savableTransformerModelKind = new SavableValueKind(
//   'SVKind_TransformerModel',
//   (x: TransformerModel) => {
//     return {
//       config: x.config as TransformerConfig,
//       params: jstree.map(x.params, (g: GTensor<any>) => g.toSerialised()),
//     };
//   },
//   (s: { config: TransformerConfig; params: jstree.DictArrTree<SerializedGTensor<any>> }) => {
//     return {
//       config: s.config as TransformerConfig,
//       params: jstree.map(s.params, (sg) => GTensor.fromSerialised(sg)) as TransformerParams,
//     };
//   }
// );

// ---------------------------------------------------------------------------

export function initAttnHeadParams(
  spec: AttnHeadParamSpec,
  // TODO: take in param initializers, instead of one for all.
  initConfig?: tf_init.TruncatedNormalArgs
): AttnHeadParams {
  const { inputRep, kq, value, heads } = spec;
  const attnHeadParams: AttnHeadParams = {
    queryM: makeTruncNormal({ inputRep, kq, heads }, initConfig),
    keyM: makeTruncNormal({ inputRep, kq, heads }, initConfig),
    valueM: makeTruncNormal({ inputRep, value, heads }, initConfig),
    headsToInputRepM: makeTruncNormal({ heads, value, inputRepToFF: inputRep }, initConfig),
    ff: {
      w: makeTruncNormal({ inputRepToFF: inputRep, inputRep }, initConfig),
      bIn: makeTruncNormal({ inputRep }, initConfig),
      bOut: makeTruncNormal({ inputRep }, initConfig),
    },
  };
  if (spec.layerNormFF) {
    attnHeadParams.layerNormPostFF = initLayerNormParams(spec.addLayerNormBias);
  }
  if (spec.layerNormHeadsProjection) {
    attnHeadParams.layerNormHeadsProjection = initLayerNormParams(spec.addLayerNormBias);
  }
  if (spec.maxRelPosSeqLen) {
    attnHeadParams.relativePosAttention = initRawRelativePosEncoding(
      spec.maxRelPosSeqLen,
      heads,
      initConfig
    );
  }
  return attnHeadParams;
}

export type BatchAttnHeadCompututation = {
  seqInput: GTensor<'batch' | 'pos' | 'inputRep'>;
  keys: GTensor<'batch' | 'heads' | 'pos' | 'kq'>;
  queries: GTensor<'batch' | 'heads' | 'pos' | 'kq'>;
  attention: GTensor<'batch' | 'heads' | 'keyPos' | 'queryPos'>;
  values: GTensor<'batch' | 'heads' | 'pos' | 'value'>;
  attendedValues: GTensor<'batch' | 'heads' | 'pos' | 'value'>;
  inputToFF: GTensor<'batch' | 'pos' | 'inputRep'>;
  seqOuput: GTensor<'batch' | 'pos' | 'inputRep'>;
};

function gelu(x: tf.Tensor) {
  const s0p5 = tf.scalar(0.5);
  const s1p0 = tf.scalar(1.0);
  const sSqrt2 = tf.sqrt(2.0);
  const cdf = tf.mul(s0p5, tf.add(s1p0, tf.erf(tf.div(x, sSqrt2))));
  return tf.mul(x, cdf);
}

export function ComputeMaskedAffinities(
  qk: GTensor<'batch' | 'keyPos' | 'heads' | 'queryPos'>, // q @ k / rawAttention
): GTensor<'batch' | 'heads' | 'keyPos' | 'queryPos'> {
  let upperInfTriangularMask = qk.TriangularMask('keyPos', 'queryPos', -Infinity);
  return qk.pointwiseAdd(upperInfTriangularMask);
}

// (Approximation for) Compute (batched) attention.
//
// Note: for non-batched attention, the code is identical, just remove the
// outer 'batch' from the seqInput argument.
//
// TODO: Add residuals and layer-norm.
export function computeAttnHead(
  spec: AttnHeadComputeSpec,
  params: AttnHeadParams,
  seqInput: GTensor<'batch' | 'pos' | 'inputRep'>,
  generator: RandomStream
): BatchAttnHeadCompututation {
  const { queryM, keyM, valueM, headsToInputRepM, ff } = params;

  const queries = seqInput.contract(queryM, ['inputRep']);
  const keys = seqInput.contract(keyM, ['inputRep']);
  const values = seqInput.contract(valueM, ['inputRep']);

  let rawAttention = keys
    .rename('pos', 'keyPos')
    .contract(queries.rename('pos', 'queryPos'), ['kq']);

  if (params.relativePosAttention) {
    const posAttentionMatrix = makePosAttentionMatrix(params.relativePosAttention);
    // TODO: what to do if the inputSeq is longer than the relative pos?
    //
    // if (seqInput.dim.ps.size >
    //     params.relativePosAttention.dim.relativePos.size) ...
    // Batch the relativePos Matrix...
    const batchedPosAttentionMatrix = posAttentionMatrix.broadcastToCombinedShape(rawAttention);
    rawAttention = rawAttention
      .pointwiseAdd(batchedPosAttentionMatrix)
      .scalarDiv(makeScalar(Math.sqrt(seqInput.dim.inputRep.size), 'float32'));
  }

  const maskedAffinities = ComputeMaskedAffinities(rawAttention); // Uncomment this and the next lines to compute Masked Attention
  const attention = maskedAffinities.softmax('queryPos'); // Uncomment this and the previous lines to compute Masked Attention
  //const attention = rawAttention.softmax('queryPos'); // Uncomment this line to compute Unmasked self attention

  // Dropout on the attention weights.
  const attentionAfterDropout = dropout(spec.dropoutRate, attention, generator.random());

  const attendedValues = values
    .contract(attentionAfterDropout.rename('queryPos', 'pos'), ['pos'])
    .rename('keyPos', 'pos');

  const headsReduction = attendedValues.contract(headsToInputRepM, ['value', 'heads']);

  // Dropout before layer norm and residual connection.
  let headsReductionAfterDropout = dropout(spec.dropoutRate, headsReduction, generator.random());

  let normedHeadReduction = headsReductionAfterDropout;
  if (params.layerNormHeadsProjection) {
    normedHeadReduction = layerNorm(
      params.layerNormHeadsProjection,
      headsReductionAfterDropout,
      'inputRepToFF'
    );
  }

  // Residual connection. Note: we follow T5 transformers and put layerNorm
  // before residual. The original attention paper had layer norm after the
  // residual connection.
  let inputToFF = normedHeadReduction;
  if (spec.residuals) {
    inputToFF = normedHeadReduction.pointwiseAdd(seqInput.rename('inputRep', 'inputRepToFF'));
  }

  // Skipped dropout in the FF, since the FF nn is a single layer with two biases.
  let unNormedSeqOuput = inputToFF
    .contract(ff.w, ['inputRepToFF'])
    .pointwiseAdd(ff.bIn)
    .applyPointWiseTfFn(gelu)
    .pointwiseAdd(ff.bOut);

  // Dropout before layer norm and residual connection.
  const unNormedSeqOuputAfterDropout = dropout(
    spec.dropoutRate,
    unNormedSeqOuput,
    generator.random()
  );

  if (spec.residuals) {
    // FF residual.
    unNormedSeqOuput = unNormedSeqOuputAfterDropout.pointwiseAdd(
      inputToFF.rename('inputRepToFF', 'inputRep')
    );
  }

  let seqOuput = unNormedSeqOuput;
  if (params.layerNormPostFF) {
    seqOuput = layerNorm(params.layerNormPostFF, unNormedSeqOuput, 'inputRep');
  }

  return {
    seqInput,
    keys,
    queries,
    attention,
    values,
    attendedValues,
    inputToFF: inputToFF.rename('inputRepToFF', 'inputRep'),
    seqOuput,
  };
}

export function initDecoderParams(config: TransformerConfig): TransformerParams {
  const { spec, init } = config;
  // const paramInitializerConfig = config.init;
  const layers: AttnHeadParams[] = spec.layers.map((layerSpec) => {
    const attnHeadSpec: AttnHeadParamSpec = {
      inputRep: spec.inputRep,
      kq: spec.kqvRep,
      heads: layerSpec.nHeads,
      value: spec.kqvRep,
      layerNormFF: layerSpec.layerNormFF,
      layerNormHeadsProjection: layerSpec.layerNormHeadsProjection,
      // addLayerNormBias: AttentionIsAllYouNeed = true; T5 = false.
      addLayerNormBias: layerSpec.addLayerNormBias,
    };
    return initAttnHeadParams(attnHeadSpec, init);
  });
  const tokenEmbedding = makeTruncNormal(
    {
      tokenId: config.tokenRep.tokens.length,
      inputRep: spec.inputRep,
    },
    init
  );
  return { layers, tokenEmbedding };
}

export type TransformerComputation = {
  layers: BatchAttnHeadCompututation[];
};

export function computeTransformer(
  model: {
    config: { spec: TransformerParamSpec };
    params: TransformerParams;
  },
  seqInput: GTensor<'batch' | 'pos' | 'inputRep'>,
  generator: RandomStream
): TransformerComputation {
  const compute: TransformerComputation = { layers: [] };
  let currentLayerInput = dropout(model.config.spec.dropoutRate, seqInput, generator.random());
  model.params.layers.forEach((layerParams, i) => {
    const layerCompute = computeAttnHead(
      model.config.spec.layers[i].computeSpec,
      layerParams,
      currentLayerInput,
      generator
    );
    compute.layers.push(layerCompute);
    currentLayerInput = layerCompute.seqOuput;
  });
  // TODO(@aliciafmachado): Skipped dropout on the output, since I am not sure how to integrate
  // this in the TransformerComputation output.
  return compute;
}

// TODO: GTensor<never> happens:
// GTensor<'x'>.sumOverDims('x') = GTensor<never>
// This is not very good because we use GTensor<never> for errors.
//
// Update so that GTensor<'#scalar'> is produced.

/** Batch compute the loss for the last token of a transformer.
 *
 * params: transformer parameters.
 * tokenEmb: embeddings for all tokens.
 * targetTokenIdxs: a one-hot token vector for the correct token.
 */
export function lastTokenLogits(
  model: {
    params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
  },
  computation: TransformerComputation
): GTensor<'batch' | 'tokenId'> {
  const lastLayer = computation.layers[computation.layers.length - 1];
  const positionParams = lastLayer.seqOuput.unstack('pos');
  const lastPosParams = positionParams[positionParams.length - 1];
  const logits = lastPosParams.contract(model.params.tokenEmbedding, ['inputRep']);
  return logits;
}

/**
 * Returns the average per example loss for the last token prediction.
 */
export function lastTokenCrossEntropyLoss(
  model: {
    params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
  },
  computation: TransformerComputation,
  targetTokenIdxs: GTensor<'batch'>
): tf.Scalar {
  const logits = lastTokenLogits(model, computation);
  const logProbs = logits.softmax('tokenId').log();
  const nTokens = model.params.tokenEmbedding.dim.tokenId.size;
  const oneHotToken = new GTensor(oneHot(targetTokenIdxs.tensor, nTokens), ['batch', 'tokenId']);
  const crossEntopy = logProbs.pointwiseMul(oneHotToken);
  return (
    crossEntopy
      .sumOverDims(['batch', 'tokenId'])
      // ._tfScalarMul(tf.scalar(-1))
      ._tfScalarDiv(tf.scalar(targetTokenIdxs.dim.batch.size * -1)).tensor as tf.Scalar
  );
  // const squaredError = signedDelta.pointwiseMul(signedDelta);
  // const loss = squaredError.sumOverDims(['batch', 'token']);
  // return loss.tensor;
}

/**
 * Compute the logits for all the past tokens of a transformer
 */
export function AllPastTokensLogits(
  model: {
    params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
  },
  computation: TransformerComputation
): GTensor<'batch' | 'pos' | 'tokenId'> {
  const lastLayer = computation.layers[computation.layers.length - 1];
  const logits = lastLayer.seqOuput.contract(model.params.tokenEmbedding, ['inputRep']);
  return logits;
}

/**
 * Returns the Softmax Cross Entropy Loss between the logits and the oneHotEncoded targets
 * Batch compute the loss for all the past tokens of a transformer.
 */
export function AllPastTokensCrossEntropyLoss(
  model: {
    params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
  },
  computation: TransformerComputation,
  oneHotToken: GTensor<'batch'| 'pos'| 'tokenId'>
): tf.Scalar {
  const logits = AllPastTokensLogits(model, computation);
  const crossEntropyLoss = tf.losses.softmaxCrossEntropy(oneHotToken.tensor,logits.tensor);
  return crossEntropyLoss.asScalar()
}
/** Batch compute the top prediction from the last token of a transformer.
 *
 * params: transformer parameters.
 * tokenEmb: embeddings for all tokens.
 * targetTokenIdxs: a one-hot token vector for the correct token.
 */
export function transformerTopPrediction(
  model: {
    params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
  },
  computation: TransformerComputation
): GTensor<'batch'> {
  const dotProd = lastTokenLogits(model, computation);
  return dotProd.argMax('tokenId');
}

export function transformerAccuracy(
  model: {
    params: { tokenEmbedding: GTensor<'tokenId' | 'inputRep'> };
  },
  computation: TransformerComputation,
  targetTokenIdxs: GTensor<'batch'>
): tf.Scalar {
  const predictions = transformerTopPrediction(model, computation);
  return predictions
    .pointwiseEqual(targetTokenIdxs)
    .sumOverDims(['batch'])
    .tensor.div(tf.scalar(targetTokenIdxs.dim.batch.size));
}

export function computeDecoder(
  model: {
    config: {
      spec: TransformerParamSpec;
      tokenRep: BasicTaskTokenRep;
    };
    params: TransformerParams;
  },
  inputPrepFn: StrSeqPrepFn<TransformerParams, 'batch' | 'pos' | 'inputRep'>,
  inputs: string[][],
  generator: RandomStream
): TransformerComputation {
  const maxInputLength = inputs.reduce(
    (max, curInput) => (max >= curInput.length ? max : curInput.length),
    0
  );
  const gtensorInputs = inputPrepFn(model, inputs, { maxInputLength });
  return computeTransformer(model, gtensorInputs, generator);
}

export function computePrediction(
  model: {
    config: { spec: TransformerParamSpec; tokenRep: BasicTaskTokenRep };
    params: TransformerParams;
  },
  inputPrepFn: StrSeqPrepFn<TransformerParams, 'batch' | 'pos' | 'inputRep'>,
  inputs: string[][],
  generator: RandomStream
): string[][] {
  const examplePredictions = tf.tidy(() => {
    const decoderComputation = computeDecoder(model, inputPrepFn, inputs, generator);
    const predictions = transformerTopPrediction(model, decoderComputation);
    return (predictions.tensor.arraySync() as number[]).map((idx) => [
      model.config.tokenRep.tokens[idx],
    ]);
  });
  return examplePredictions;
}

export function makeTransformer(transformerConfig: TransformerConfig): TransformerModel {
  const config = structuredClone(transformerConfig);
  const params = initDecoderParams(config);
  return { config, params };
}

export const transformerModelKind = modelRegistry.register(
  defaultTransformerConfig(),
  makeTransformer
);
