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
 * TODO: dropout.
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
  GTensorOrVar,
  TensorOrVarKind,
  VariableKind,
  TensorKind,
} from '../gtensor/gtensor';
import * as tf_init from '@tensorflow/tfjs-layers/dist/initializers';
import {
  BatchedRelativePosAttention,
  initRawRelativePosEncoding,
  makePosAttentionMatrix,
} from './relative_pos_encoding';
import {
  initLayerNormParams,
  layerNorm,
  TensorLayerNormParams,
  VarLayerNormParams,
} from '../gtensor/layer_norm';
// import { GTensorTree, GVariableTree } from '../gtensor/gtensor_tree';
import { BasicTaskTokenRep, StrSeqPrepFn } from '../tokens/token_gemb';
import * as jstree from '../js_tree/js_tree';

// ---------------------------------------------------------------------------
export type TransformerConfig = {
  // Defines how the transformer is created.
  spec: TransformerParamSpec;
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
    computeSpec: { residuals: true },
  };
  const layer_config_first: TransformerParamLayerSpec = {
    ...layer_config,
    hasPosEncoding: false,
  };
  const spec: TransformerParamSpec = {
    inputRep: 64,
    kqvRep: 64,
    layers: [layer_config_first, layer_config, layer_config, layer_config],
  };
  const config: TransformerConfig = {
    spec: spec,
    init: {
      stddev: 0.05, // default
      mean: 0,
      seed: 42,
    },
  };
  return config;
}

// ---------------------------------------------------------------------------
export type FfParams<T extends TensorOrVarKind, Input extends DName, Output extends DName> = {
  w: GTensorOrVar<T, Input | Output>;
  bIn: GTensorOrVar<T, Output>;
  bOut: GTensorOrVar<T, Output>;
} & {};
// & {} is workaround for https://github.com/microsoft/TypeScript/issues/48070

// More workaround for https://github.com/microsoft/TypeScript/issues/48070
export type LayerNormParams<T extends TensorOrVarKind> = T extends VariableKind
  ? VarLayerNormParams
  : TensorLayerNormParams;

// Use of type here to be compatible with generic params.
export type AttnHeadParams<T extends TensorOrVarKind> = {
  queryM: GTensorOrVar<T, 'heads' | 'inputRep' | 'kq'>;
  keyM: GTensorOrVar<T, 'heads' | 'inputRep' | 'kq'>;
  valueM: GTensorOrVar<T, 'heads' | 'inputRep' | 'value'>;
  headsToInputRepM: GTensorOrVar<T, 'heads' | 'value' | 'inputRepToFF'>;
  // workaround for https://github.com/microsoft/TypeScript/issues/48070
  layerNormHeadsProjection?: LayerNormParams<T>;
  layerNormPostFF?: LayerNormParams<T>;
  ff: FfParams<T, 'inputRepToFF', 'inputRep'>;
  // ff2: FfParams<'ffRep', 'ffOut'>;
  // Relative position attention
  relativePosAttention?: GTensorOrVar<T, 'heads' | 'relativePos'>;
} & {};
// & {} is workaround for https://github.com/microsoft/TypeScript/issues/48070

// Use of type here to be compatible with generic params.
export type CondTransformerParams<T extends TensorOrVarKind> = {
  layers: AttnHeadParams<T>[];
  tokenEmbedding: GTensorOrVar<T, 'tokenId' | 'inputRep'>;
} & {};
// & {} is workaround for https://github.com/microsoft/TypeScript/issues/48070

// Checks for workaround for https://github.com/microsoft/TypeScript/issues/48070
type FfParamsCheck<I extends DName, O extends DName> = FfParams<
  VariableKind,
  I,
  O
> extends FfParams<TensorKind, I, O>
  ? true
  : false;

type LayerNormParamsCheck = LayerNormParams<VariableKind> extends LayerNormParams<TensorKind>
  ? true
  : false;
type AttnHeadParamsCheck = AttnHeadParams<VariableKind> extends AttnHeadParams<TensorKind>
  ? true
  : false;

export type VarTransformerParams = CondTransformerParams<VariableKind>;
export type TransformerParams = CondTransformerParams<TensorKind>;

type TransformerParamsCheck = VarTransformerParams extends TransformerParams ? true : false;

// ---------------------------------------------------------------------------

export function initAttnHeadParams(
  spec: AttnHeadParamSpec,
  // TODO: take in param initializers, instead of one for all.
  initConfig?: tf_init.TruncatedNormalArgs
): AttnHeadParams<TensorKind> {
  const { inputRep, kq, value, heads } = spec;
  const attnHeadParams: AttnHeadParams<TensorKind> = {
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

// (Approximation for) Compute (batched) attention.
//
// Note: for non-batched attention, the code is identical, just remove the
// outer 'batch' from the seqInput argument.
//
// TODO: Add residuals and layer-norm.
export function computeAttnHead(
  spec: AttnHeadComputeSpec,
  params: AttnHeadParams<TensorKind>,
  seqInput: GTensor<'batch' | 'pos' | 'inputRep'>
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

  const attention = rawAttention.softmax('queryPos');
  const attendedValues = values
    .contract(attention.rename('queryPos', 'pos'), ['pos'])
    .rename('keyPos', 'pos');

  const headsReduction = attendedValues.contract(headsToInputRepM, ['value', 'heads']);

  let normedHeadReduction = headsReduction;
  if (params.layerNormHeadsProjection) {
    normedHeadReduction = layerNorm(
      params.layerNormHeadsProjection,
      headsReduction,
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

  let unNormedSeqOuput = inputToFF
    .contract(ff.w, ['inputRepToFF'])
    .pointwiseAdd(ff.bIn)
    .applyPointWiseTfFn(gelu)
    .pointwiseAdd(ff.bOut);
  if (spec.residuals) {
    // FF residual
    unNormedSeqOuput = unNormedSeqOuput.pointwiseAdd(inputToFF.rename('inputRepToFF', 'inputRep'));
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

export function initDecoderParams(
  tokenRep: BasicTaskTokenRep,
  config: TransformerConfig
): TransformerParams {
  const { spec, init } = config;
  // const paramInitializerConfig = config.init;
  const layers: AttnHeadParams<TensorKind>[] = spec.layers.map((layerSpec) => {
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
  const tokenEmbedding = makeTruncNormal({
    tokenId: tokenRep.tokens.length,
    inputRep: spec.inputRep,
  });
  return { layers, tokenEmbedding };
}

export function initDecoderVarParams(
  tokenRep: BasicTaskTokenRep,
  config: TransformerConfig
): VarTransformerParams {
  const initParams = initDecoderParams(tokenRep, config);
  // Maybe make a nice initializer variable trees from tensor trees?
  const params = jstree.map(initParams, (t: GTensor<any>) => new GVariable(t));
  return params as VarTransformerParams;
}

export type TransformerComputation = {
  layers: BatchAttnHeadCompututation[];
};

export function computeTransformer(
  spec: TransformerParamSpec,
  params: TransformerParams,
  seqInput: GTensor<'batch' | 'pos' | 'inputRep'>
): TransformerComputation {
  const compute: TransformerComputation = { layers: [] };
  let currentLayerInput = seqInput;
  params.layers.forEach((layerParams, i) => {
    const layerCompute = computeAttnHead(
      spec.layers[i].computeSpec,
      layerParams,
      currentLayerInput
    );
    compute.layers.push(layerCompute);
    currentLayerInput = layerCompute.seqOuput;
  });
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
export function transformerLastTokenLogits(
  params: TransformerComputation,
  tokenEmb: GTensor<'tokenId' | 'inputRep'>
): GTensor<'batch' | 'tokenId'> {
  const lastLayer = params.layers[params.layers.length - 1];
  const positionParams = lastLayer.seqOuput.unstack('pos');
  const lastPosParams = positionParams[positionParams.length - 1];
  const logits = lastPosParams.contract(tokenEmb, ['inputRep']);
  return logits;
}

/**
 * Returns the average per example loss for the last token prediction.
 */
export function transformerLastTokenCrossEntropyLoss(
  params: TransformerComputation,
  tokenEmb: GTensor<'tokenId' | 'inputRep'>,
  targetTokenIdxs: GTensor<'batch'>
): tf.Scalar {
  const logits = transformerLastTokenLogits(params, tokenEmb);

  const logProbs = logits.softmax('tokenId').log();
  //
  // const logProbs = logits.softmax('token');

  const oneHotToken = new GTensor(oneHot(targetTokenIdxs.tensor, tokenEmb.dim.tokenId.size), [
    'batch',
    'tokenId',
  ]);

  const crossEntopy = logProbs.pointwiseMul(oneHotToken);
  // const crossEntopy = logProbs.squaredDifference(oneHotToken).sqrt();
  // const loss = signedDelta.pointwiseMul(signedDelta);

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

/** Batch compute the top prediction from the last token of a transformer.
 *
 * params: transformer parameters.
 * tokenEmb: embeddings for all tokens.
 * targetTokenIdxs: a one-hot token vector for the correct token.
 */
export function transformerTopPrediction(
  params: TransformerComputation,
  tokenEmb: GTensor<'tokenId' | 'inputRep'>
): GTensor<'batch'> {
  const dotProd = transformerLastTokenLogits(params, tokenEmb);
  return dotProd.argMax('tokenId');
}

export function transformerAccuracy(
  params: TransformerComputation,
  tokenEmb: GTensor<'tokenId' | 'inputRep'>,
  targetTokenIdxs: GTensor<'batch'>
): tf.Scalar {
  const predictions = transformerTopPrediction(params, tokenEmb);

  return predictions
    .pointwiseEqual(targetTokenIdxs)
    .sumOverDims(['batch'])
    .tensor.div(tf.scalar(targetTokenIdxs.dim.batch.size));
}

export function computeDecoder(
  tokenRep: BasicTaskTokenRep,
  inputPrepFn: StrSeqPrepFn<TransformerParams, 'batch' | 'pos' | 'inputRep'>,
  spec: TransformerParamSpec,
  params: TransformerParams,
  inputs: string[][]
): TransformerComputation {
  const maxInputLength = inputs.reduce(
    (max, curInput) => (max >= curInput.length ? max : curInput.length),
    0
  );
  const gtensorInputs = inputPrepFn(tokenRep, params, maxInputLength, inputs);
  return computeTransformer(spec, params, gtensorInputs);
}

export function computePrediction(
  tokenRep: BasicTaskTokenRep,
  inputPrepFn: StrSeqPrepFn<TransformerParams, 'batch' | 'pos' | 'inputRep'>,
  spec: TransformerParamSpec,
  params: TransformerParams,
  inputs: string[][]
): string[][] {
  const examplePredictions = tf.tidy(() => {
    const decoderComputation = computeDecoder(tokenRep, inputPrepFn, spec, params, inputs);
    const predictions = transformerTopPrediction(decoderComputation, params.tokenEmbedding);
    return (predictions.tensor.arraySync() as number[]).map((idx, i) => [tokenRep.tokens[idx]]);
  });
  return examplePredictions;
}
