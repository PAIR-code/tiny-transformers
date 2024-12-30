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

/* Implements GPT2 in TS
 *
 * Transformers implemented using GTensor.
 *
 * TODO: check order of operations and compare to hugging face repo and
 * then check the number of parameters to match. We can do so in the test?
 * And then dummy check where everything is initialized to 0 (not sure how easy)
 * and then compare outputs.
 * 
 * Another part that might be challenging is tokenization and loading the positional
 * encodings since I'm not sure this is working in the current
 * repository .
 * 
 * Once that's done, then we can try to load the weights following the example we already have in JS.
 */
import { relu, tanh, tensor, Tensor, oneHot, Scalar } from '@tensorflow/tfjs';
import * as tf from '@tensorflow/tfjs';
import {
  GTensor,
  DName,
  makeTruncNormal,
  makeScalar,
  GVariable,
  GTensorOrVar,
  TensorOrVarKind,
  VariableKind,
  TensorKind,
  makeRange,
} from '../gtensor/gtensor';
import * as tf_init from '@tensorflow/tfjs-layers/dist/initializers';
import {
  initRawRelativePosEncoding,
  makePosAttentionMatrix,
} from './relative_pos_encoding';
import {
  initLayerNormParams,
  layerNorm,
  TensorLayerNormParams,
  VarLayerNormParams,
} from '../gtensor/layer_norm';
import {
  dropout,
} from './dropout';
// import { GTensorTree, GVariableTree } from '../gtensor/gtensor_tree';
import { BasicTaskTokenRep, StrSeqPrepFn } from '../tokens/token_gemb';
import * as jstree from '../js_tree/js_tree';
import { RandomStream } from '../state-iter/random';

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
  hiddenRep: number;
  kqvRep: number;
  layers: TransformerParamLayerSpec[];
  // Dropout rate on the input before going into the stack.
  dropoutRate: number;
  posEncodingSeqLength: number;
};

// ---------------------------------------------------------------------------

export type AttnHeadParamSpec = {
  inputRep: number;
  hiddenRep: number;
  kq: number;
  heads: number;
  value: number;
  // ffRep: number;
  // ffOut: number;
  layerNormHeadsProjection: boolean;
  layerNormFF: boolean;
  addLayerNormBias: boolean;
  // Note: residual spec don't introduce params, so they are not here.
  // It's only relevant to computation.
  // Note: dropout spec don't introduce params, so they are not here either.
};

export type TransformerParamLayerSpec = {
  nHeads: number;
  layerNormFF: boolean;
  layerNormHeadsProjection: boolean;
  addLayerNormBias: boolean; // only meaningful when one of the above is true.
  computeSpec: AttnHeadComputeSpec;
  addPosEmbeddings: boolean;
};

export type AttnHeadComputeSpec = {
  // Whether to include or not the residual connections in the computation.
  residuals: boolean;
  dropoutRate: number; 
};

// ---------------------------------------------------------------------------
export type FfParams<T extends TensorOrVarKind, Input extends DName, Output extends DName> = {
  w: GTensorOrVar<T, Input | Output>;
  b: GTensorOrVar<T, Output>;
} & {};
// & {} is workaround for https://github.com/microsoft/TypeScript/issues/48070

// More workaround for https://github.com/microsoft/TypeScript/issues/48070
export type LayerNormParams<T extends TensorOrVarKind> = T extends VariableKind
  ? VarLayerNormParams
  : TensorLayerNormParams;

// Use of type here to be compatible with generic params.
export type AttnHeadParams<T extends TensorOrVarKind> = {
  queryM: GTensorOrVar<T, 'heads' | 'inputRep' | 'kq'>; // 12 * 768 * 64
  keyM: GTensorOrVar<T, 'heads' | 'inputRep' | 'kq'>; // 12 * 768 * 64
  valueM: GTensorOrVar<T, 'heads' | 'inputRep' | 'value'>; // 12 * 768 * 64
  headsToInputRepM: GTensorOrVar<T, 'heads' | 'value' | 'inputRepToFF'>; // 12 * 768 * 64

  // TODO(@aliciafmachado): use the parameters below and simplify:
  queryMBias: GTensorOrVar<T, 'heads' | 'kq'>; // 12 * 64
  keyMBias: GTensorOrVar<T, 'heads' | 'kq'>; // 12 * 64
  valueMBias: GTensorOrVar<T, 'heads' | 'value'>; // 12 * 64
  headsToInputRepMBias: GTensorOrVar<T, 'inputRepToFF'>; // 768

  // workaround for https://github.com/microsoft/TypeScript/issues/48070
  layerNormHeadsProjection?: LayerNormParams<T>;
  layerNormPostFF?: LayerNormParams<T>;
  ff1: FfParams<T, 'inputRepToFF', 'hiddenRep'>; // 768 * 4 * 768
  ff2: FfParams<T, 'inputRepToFF', 'inputRep'>; // 4 * 768 * 768
} & {};
// & {} is workaround for https://github.com/microsoft/TypeScript/issues/48070

// Use of type here to be compatible with generic params.
export type CondTransformerParams<T extends TensorOrVarKind> = {
  layers: AttnHeadParams<T>[];
  tokenEmbedding: GTensorOrVar<T, 'tokenId' | 'inputRep'>;
  posEmbedding: GTensorOrVar<T, 'posId' | 'inputRep'>;
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
  const { inputRep, hiddenRep, kq, value, heads } = spec;
  const attnHeadParams: AttnHeadParams<TensorKind> = {
    queryM: makeTruncNormal({ inputRep, kq, heads }, initConfig),
    keyM: makeTruncNormal({ inputRep, kq, heads }, initConfig),
    valueM: makeTruncNormal({ inputRep, value, heads }, initConfig),
    headsToInputRepM: makeTruncNormal({ heads, value, inputRepToFF: inputRep }, initConfig),
    queryMBias: makeTruncNormal({ kq, heads }, initConfig),
    keyMBias: makeTruncNormal({ kq, heads }, initConfig),
    valueMBias: makeTruncNormal({ value, heads }, initConfig),
    headsToInputRepMBias: makeTruncNormal({ inputRepToFF: inputRep }, initConfig),

    ff1: {
      w: makeTruncNormal({ inputRepToFF: inputRep, hiddenRep }, initConfig),
      b: makeTruncNormal({ hiddenRep }, initConfig),
    },
    ff2: {
      w: makeTruncNormal({ inputRepToFF: hiddenRep, inputRep }, initConfig),
      b: makeTruncNormal({ inputRep }, initConfig),
    }
  };
  if (spec.layerNormFF) {
    attnHeadParams.layerNormPostFF = initLayerNormParams(spec.addLayerNormBias);
  }
  if (spec.layerNormHeadsProjection) {
    attnHeadParams.layerNormHeadsProjection = initLayerNormParams(spec.addLayerNormBias);
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
//
// TODO: Move layernorm and add layernorm on compute transfomer.
// TODO: Fix residuals.
// https://github.com/huggingface/transformers/blob/13493215abceafc1653af88b045120014fb4c1fc/src/transformers/models/gpt2/modeling_gpt2.py#L123
//
// Differences from current transformer model are:
//  - Layer norm positioning (3 for GPT2 including outside the neural network)
//  - 
//
// Idea: rename this fn.
export function computeAttnHead(
  spec: AttnHeadComputeSpec,
  params: AttnHeadParams<TensorKind>,
  seqInput: GTensor<'batch' | 'pos' | 'inputRep'>,
  generator: RandomStream
): BatchAttnHeadCompututation {
  const { queryM, keyM, valueM, headsToInputRepM, queryMBias, keyMBias, valueMBias, 
    headsToInputRepMBias, ff1, ff2 } = params;

  const queries = seqInput.contract(queryM, ['inputRep']).pointwiseAdd(queryMBias);
  const keys = seqInput.contract(keyM, ['inputRep']).pointwiseAdd(keyMBias);
  const values = seqInput.contract(valueM, ['inputRep']).pointwiseAdd(valueMBias);

  let rawAttention = keys
    .rename('pos', 'keyPos')
    .contract(queries.rename('pos', 'queryPos'), ['kq']);

  const attention = rawAttention.softmax('queryPos');

  // Dropout on the attention weights.
  const attentionAfterDropout = dropout(spec.dropoutRate, attention, generator.random());

  const attendedValues = values
    .contract(attentionAfterDropout.rename('queryPos', 'pos'), ['pos'])
    .rename('keyPos', 'pos');

  // TODO(@aliciafmachado): I don't think we need to apply dropout after the head reduction.
  const headsReduction = attendedValues.contract(
    headsToInputRepM, ['value', 'heads']).pointwiseAdd(headsToInputRepMBias);

  // Checked: Dropout before layer norm and residual connection.
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

  // Head MLP block
  let unNormedSeqOuput = inputToFF
    .contract(ff1.w, ['inputRepToFF'])
    .pointwiseAdd(ff1.b)
    .applyPointWiseTfFn(gelu)
    .rename('hiddenRep', 'inputRepToFF')
    .contract(ff2.w, ['inputRepToFF'])
    .pointwiseAdd(ff2.b);

  // [Checked(@aliciafmachado)] Dropout before layer norm and residual connection.
  const unNormedSeqOuputAfterDropout = dropout(spec.dropoutRate, unNormedSeqOuput, generator.random());

  if (spec.residuals) {
    // FF residual.
    unNormedSeqOuput = unNormedSeqOuputAfterDropout.pointwiseAdd(inputToFF.rename('inputRepToFF', 'inputRep'));
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
      hiddenRep: spec.hiddenRep,
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
  }, init);

  // If parameter is available, initialize posEmbedding
  const posEmbedding = makeTruncNormal({
    posId: spec.posEncodingSeqLength,
    inputRep: spec.inputRep,
  });

  const transformerParams: TransformerParams = {
    tokenEmbedding: tokenEmbedding,
    layers: layers,
    posEmbedding: posEmbedding
  };

  return transformerParams;
}

export function initDecoderParamsTree(
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
  seqInput: GTensor<'batch' | 'pos' | 'inputRep'>,
  generator: RandomStream
): TransformerComputation {
  const compute: TransformerComputation = { layers: [] };
  // checked: Dropout on the input before going into heads.
  let currentLayerInput = dropout(spec.dropoutRate, seqInput, generator.random());
  params.layers.forEach((layerParams, i) => {
    const layerCompute = computeAttnHead(
      spec.layers[i].computeSpec,
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
  targetTokenIdxs: GTensor<'batch'>,
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
  inputs: string[][],
  generator: RandomStream
): TransformerComputation {
  const maxInputLength = inputs.reduce(
    (max, curInput) => (max >= curInput.length ? max : curInput.length),
    0
  );
  // TODO: we need to keep the input under the max positional encodings (1024 for gpt2).
  // Add capping
  // input prep fn would be subword tokenization?
  const gtensorInputs = inputPrepFn(tokenRep, params, maxInputLength, inputs);

  // Then once we cap and mask it, we can apply positional encodings i think

  // export function makeSimplePosEncoding(awRelativePosAttention: GTensor<'inputRep' | 'posRep'>): 
  // GTensor<'inputRep'>  {
  //   const indexes =
  //     gtensor.makeRange('keyPos', 0, seqLength, 1, 'int32');
  //   const oneHotToken = new GTensor(oneHot(indexes.tensor, posParams.dim.posId.size), [
  //     'batch',
  //     'tokenId',
  //   ]);
  //     // gshape()
  //   return oneHotToken;
  // }
  // if (params.posEmbedding) {
  //   const indexes =
  //     makeRange('pos', 0, params.posEmbedding.dim.posId.size, 1, 'int32');
  //   const posAttentionMatrix = new GTensor(oneHot(indexes.tensor, params.posEmbedding.dim.posId.size),
  //     ['batch', 'pos', 'posId']);
    
  //   // TODO: what to do if the inputSeq is longer than the relative pos?
  //   //
  //   // if (seqInput.dim.ps.size >
  //   //     params.relativePosAttention.dim.relativePos.size) ...
  //   // Batch the relativePos Matrix...
  //   const batchedPosAttentionMatrix = posAttentionMatrix.broadcastToCombinedShape(rawAttention);
  //   rawAttention = rawAttention
  //     .pointwiseAdd(batchedPosAttentionMatrix)
  //     .scalarDiv(makeScalar(Math.sqrt(seqInput.dim.inputRep.size), 'float32'));
  // }
  return computeTransformer(spec, params, gtensorInputs, generator);
}

export function computePrediction(
  tokenRep: BasicTaskTokenRep,
  inputPrepFn: StrSeqPrepFn<TransformerParams, 'batch' | 'pos' | 'inputRep'>,
  spec: TransformerParamSpec,
  params: TransformerParams,
  inputs: string[][],
  generator: RandomStream
): string[][] {
  const examplePredictions = tf.tidy(() => {
    const decoderComputation = computeDecoder(tokenRep, inputPrepFn, spec, params, inputs, generator);
    const predictions = transformerTopPrediction(decoderComputation, params.tokenEmbedding);
    return (predictions.tensor.arraySync() as number[]).map((idx, i) => [tokenRep.tokens[idx]]);
  });
  return examplePredictions;
}
