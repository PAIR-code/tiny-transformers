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
 * GPT2 implemented using GTensor.
 */
import { oneHot } from '@tensorflow/tfjs';
import * as tf from '@tensorflow/tfjs';
import {
  GTensor,
  DName,
  makeTruncNormal,
  makeRange,
  stackGtensors,
  makeScalar,
} from '../gtensor/gtensor';
import {
  SerializeTensorParams,
  VarifyTensorParams,
} from '../gtensor/params';

import * as tf_init from '@tensorflow/tfjs-layers/dist/initializers';
import { initLayerNormParamsWithDims, layerNorm, LayerNormParams } from '../gtensor/layer_norm';
import { dropout } from './dropout';
import { BasicTaskTokenRep, StrSeqPrepFn, tokenizeAndMapToIdx, embedBatch } from '../tokens/token_gemb';
import { RandomStream } from '../random/random';
import { causalMask, BatchAttnHeadComputation, TransformerComputation, transformerTopPrediction } from './common_transformer';

export type Config = {
  id: string;
  kind: 'Transformer';
  // Defines how the transformer is created.
  spec: TransformerParamSpec;
  tokenRep: BasicTaskTokenRep;
  init: {
    stddev: number;
    mean: number;
    seed: number;
  };
};

export type TransformerParamSpec = {
  inputRep: number;
  kqvRep: number;
  layers: TransformerParamLayerSpec[];
  posEncodingSeqLength: number;
  // Layer norm.
  layerNorm: boolean;
  addLayerNormBias: boolean;
  // Positional embeddings.
  addPosEmbeddings: boolean;
  // Compute spec.
  computeSpec: TransformerComputeSpec;
};

export type TransformerComputeSpec = {
  // Dropout rate on the input before going into the stack.
  dropoutRate: number;
  layerNormEpsilon: number;
};

export type AttnHeadParamSpec = {
  inputRep: number;
  kq: number;
  heads: number;
  value: number;
  layerNormHeadsProjection: boolean;
  layerNormPreAttention: boolean;
  addLayerNormBias: boolean;
  // Note: residual spec don't introduce params, so they are not here.
  // It's only relevant to computation.
  // Note: dropout spec don't introduce params, so they are not here either.
};

export type TransformerParamLayerSpec = {
  nHeads: number;
  layerNormPreAttention: boolean;
  layerNormHeadsProjection: boolean;
  addLayerNormBias: boolean; // only meaningful when one of the above is true.
  computeSpec: AttnHeadComputeSpec;
};

export type AttnHeadComputeSpec = {
  // Whether to include or not the residual connections in the computation.
  residuals: boolean;
  dropoutRate: number;
  layerNormEpsilon: number;
};

// Default GPT2 config.
export function defaultGPT2EvalConfig(
  tokenRep: BasicTaskTokenRep,
  training: boolean,
): Config {
  const embeddingSize = 768;
  const posEmbeddings = 1024;
  const nHeads = 12;
  const dropoutRate = training ? 0.1 : 0;
  const layerNormEpsilon = 1e-5;
  const layerConfig: TransformerParamLayerSpec = {
    nHeads: nHeads,
    layerNormPreAttention: true,
    layerNormHeadsProjection: true,
    addLayerNormBias: true,
    computeSpec: { residuals: true, dropoutRate: dropoutRate, layerNormEpsilon: layerNormEpsilon },
  };
  const spec: TransformerParamSpec = {
    inputRep: embeddingSize,
    kqvRep: embeddingSize / nHeads,
    layers: Array(nHeads).fill(layerConfig),
    computeSpec: {
      dropoutRate: dropoutRate,
      layerNormEpsilon: layerNormEpsilon
    },
    posEncodingSeqLength: posEmbeddings,
    layerNorm: true,
    addLayerNormBias: true,
    addPosEmbeddings: true,
  };
  const config: Config = {
    id: 'GPT2Eval',
    kind: 'Transformer',
    spec: spec,
    tokenRep: tokenRep,
    init: {
      stddev: 0.05,
      mean: 0,
      seed: 42,
    },
  };
  return config;
}

export type FfParams<Input extends DName, Output extends DName> = {
  w: GTensor<Input | Output>;
  b: GTensor<Output>;
};

// Use of type here to be compatible with generic params.
export type AttnHeadParams = {
  queryM: GTensor<'heads' | 'inputRep' | 'kq'>;
  keyM: GTensor<'heads' | 'inputRep' | 'kq'>;
  valueM: GTensor<'heads' | 'inputRep' | 'value'>;
  headsToInputRepM: GTensor<'heads' | 'value' | 'inputRepToFF'>;
  queryMBias: GTensor<'heads' | 'kq'>;
  keyMBias: GTensor<'heads' | 'kq'>;
  valueMBias: GTensor<'heads' | 'value'>;
  headsToInputRepMBias: GTensor<'inputRepToFF'>;
  layerNormHeadsProjection?: LayerNormParams<'inputRepToFF'>;
  layerNormPreAttention?: LayerNormParams<'inputRep'>;
  ff1: FfParams<'inputRepToFF', 'hiddenRep'>;
  ff2: FfParams<'hiddenRep', 'inputRep'>;
};

// Use of type here to be compatible with generic params.
export type TransformerParams = {
  layers: AttnHeadParams[];
  tokenEmbedding: GTensor<'tokenId' | 'inputRep'>;
  posEmbedding?: GTensor<'posId' | 'inputRep'>;
  layerNorm?: LayerNormParams<'inputRep'>; // 768 + 768
};

export type VarTransformerParams = VarifyTensorParams<TransformerParams>;
export type SerialTransformerParams = SerializeTensorParams<TransformerParams>;

export type TransformerModel = {
  config: Config;
  params: TransformerParams;
};

export function initAttnHeadParams(
  spec: AttnHeadParamSpec,
  initConfig?: tf_init.TruncatedNormalArgs
): AttnHeadParams {
  const { inputRep, kq, value, heads } = spec;
  const hiddenRep = 4 * inputRep;
  const attnHeadParams: AttnHeadParams = {
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
      w: makeTruncNormal({ hiddenRep: hiddenRep, inputRep }, initConfig),
      b: makeTruncNormal({ inputRep }, initConfig),
    }
  };
  if (spec.layerNormPreAttention) {
    attnHeadParams.layerNormPreAttention = initLayerNormParamsWithDims(spec.addLayerNormBias, { 'inputRep': inputRep });
  }
  if (spec.layerNormHeadsProjection) {
    attnHeadParams.layerNormHeadsProjection = initLayerNormParamsWithDims(spec.addLayerNormBias, { 'inputRepToFF': inputRep });
  }
  return attnHeadParams;
}

// TODO(@aliciafmachado): seems like GELU from OpenAI is slightly different according
// to https://github.com/huggingface/transformers/blob/main/src/transformers/activations.py#L59.
// For now, we keep the current implementation of GELU but to be revised when we attempt
// to load the weights from GPT2.
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
export function computeAttnHead(
  spec: AttnHeadComputeSpec,
  params: AttnHeadParams,
  seqInput: GTensor<'batch' | 'pos' | 'inputRep'>,
  generator: RandomStream
): BatchAttnHeadComputation {
  const { queryM, keyM, valueM, headsToInputRepM, queryMBias, keyMBias, valueMBias,
    headsToInputRepMBias, ff1, ff2 } = params;

  let seqInputAfterNorm = seqInput;
  if (params.layerNormPreAttention) {
    seqInputAfterNorm = layerNorm(params.layerNormPreAttention, seqInput, 'inputRep',
      makeScalar(spec.layerNormEpsilon));
  }

  const queries = seqInputAfterNorm.contract(queryM, ['inputRep']).pointwiseAdd(queryMBias);
  const keys = seqInputAfterNorm.contract(keyM, ['inputRep']).pointwiseAdd(keyMBias);
  const values = seqInputAfterNorm.contract(valueM, ['inputRep']).pointwiseAdd(valueMBias);

  let rawAttention = keys
    .rename('pos', 'keyPos')
    .contract(queries.rename('pos', 'queryPos'), ['kq']);

  const attention = causalMask(rawAttention);

  // Dropout on the attention weights.
  const attentionAfterDropout = dropout(spec.dropoutRate, attention, generator.random());

  const attendedValues = values
    .contract(attentionAfterDropout.rename('queryPos', 'pos'), ['pos'])
    .rename('keyPos', 'pos');

  const headsReduction = attendedValues.contract(headsToInputRepM, ['value', 'heads']).pointwiseAdd(headsToInputRepMBias);;

  // Dropout before residual connection and layer norm.
  let headsReductionAfterDropout = dropout(spec.dropoutRate, headsReduction, generator.random());

  // Residual after attention computation.
  let headsReductionAfterResidual = headsReductionAfterDropout;
  if (spec.residuals) {
    headsReductionAfterResidual = headsReductionAfterDropout.pointwiseAdd(seqInput.rename('inputRep', 'inputRepToFF'));
  }

  let inputToFF = headsReductionAfterResidual;
  if (params.layerNormHeadsProjection) {
    inputToFF = layerNorm(
      params.layerNormHeadsProjection,
      headsReductionAfterDropout,
      'inputRepToFF',
      makeScalar(spec.layerNormEpsilon)
    );
  }


  let seqOutput = inputToFF
    .contract(ff1.w, ['inputRepToFF'])
    .pointwiseAdd(ff1.b)
    .applyPointWiseTfFn(gelu)
    .contract(ff2.w, ['hiddenRep'])
    .pointwiseAdd(ff2.b);

  // Dropout before residual connection.
  seqOutput = dropout(
    spec.dropoutRate,
    seqOutput,
    generator.random()
  );

  // Residual after MLP.
  if (spec.residuals) {
    seqOutput = seqOutput.pointwiseAdd(
      headsReductionAfterResidual.rename('inputRepToFF', 'inputRep')
    );
  }

  return {
    seqInput,
    keys,
    queries,
    attention,
    values,
    attendedValues,
    // Note: this inputToFF is after the layer norm.
    inputToFF: inputToFF.rename('inputRepToFF', 'inputRep'),
    seqOutput,
  };
}

export function initDecoderParams(config: Config): TransformerParams {
  const { spec, init } = config;
  // const paramInitializerConfig = config.init;
  const layers: AttnHeadParams[] = spec.layers.map((layerSpec) => {
    const attnHeadSpec: AttnHeadParamSpec = {
      inputRep: spec.inputRep,
      kq: spec.kqvRep,
      heads: layerSpec.nHeads,
      value: spec.kqvRep,
      layerNormPreAttention: layerSpec.layerNormPreAttention,
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

  let transformerParams: TransformerParams = {
    tokenEmbedding: tokenEmbedding,
    layers: layers
  };

  if (spec.addPosEmbeddings) {
    const posEmbedding = makeTruncNormal({
      posId: spec.posEncodingSeqLength,
      inputRep: spec.inputRep,
    });
    transformerParams.posEmbedding = posEmbedding;
  }

  if (spec.layerNorm) {
    const layerNormParams = initLayerNormParamsWithDims(
      spec.addLayerNormBias, { 'inputRep': spec.inputRep });
    transformerParams.layerNorm = layerNormParams
  }

  return transformerParams;
}

export function computeTransformer(
  model: {
    config: { spec: TransformerParamSpec };
    params: TransformerParams;
  },
  seqInput: GTensor<'batch' | 'pos' | 'inputRep'>,
  generator: RandomStream
): TransformerComputation {
  const compute: TransformerComputation = { layers: [] };
  let currentLayerInput = dropout(model.config.spec.computeSpec.dropoutRate,
    seqInput, generator.random());
  model.params.layers.forEach((layerParams, i) => {
    const layerCompute = computeAttnHead(
      model.config.spec.layers[i].computeSpec,
      layerParams,
      currentLayerInput,
      generator
    );
    compute.layers.push(layerCompute);
    currentLayerInput = layerCompute.seqOutput;
  });

  // TODO(@aliciafmachado): Hacky way to apply layer norm after the final layer.
  if (model.params.layerNorm) {
    const lastBlock = compute.layers[compute.layers.length - 1];
    const finalSeqOutput = layerNorm(model.params.layerNorm, lastBlock.seqOutput, 'inputRep',
      makeScalar(model.config.spec.computeSpec.layerNormEpsilon));
    let finalOutput = lastBlock;
    finalOutput.seqOutput = finalSeqOutput;
    finalOutput.seqInput = lastBlock.seqOutput;
    compute.layers.push(finalOutput);
  }

  return compute;
}

/** Add positional encodings to the input.
 *
 * This implementation simply creates an embedding for each position.
 * If positional embeddings are disabled, we simply do not do anything.
 * 
 * model: model containing GPT 2 config and params.
 * input: input to generate the positional encodings for.
 */
export function addPosEmbeddings(
  model: {
    config: {
      spec: TransformerParamSpec;
    };
    params: TransformerParams;
  },
  input: GTensor<'batch' | 'pos' | 'inputRep'>
): GTensor<'batch' | 'pos' | 'inputRep'> {
  if (model.params.posEmbedding) {
    const indexes = makeRange('pos', 0, input.dim.pos.size, 1, 'int32');
    const stackedIndexes = stackGtensors('batch', Array(input.dim.batch.size).fill(indexes));
    const oneHotToken = new GTensor(oneHot(stackedIndexes.tensor, model.config.spec.posEncodingSeqLength), [
      'batch',
      'pos',
      'posId'
    ]);
    return input.pointwiseAdd(oneHotToken.contract(model.params.posEmbedding, ['posId']));
  }
  return input;
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
    0,
  );
  const inputLength = Math.max(model.config.spec.posEncodingSeqLength, maxInputLength);
  let gtensorInputs = inputPrepFn(
    model, inputs, { maxInputLength: inputLength })

  if (model.config.spec.addPosEmbeddings) {
    gtensorInputs = addPosEmbeddings(model, gtensorInputs)
  }

  return computeTransformer(model, gtensorInputs, generator);
}

export function computeDecoderWithLoadedTokenizer(
  model: {
    config: {
      spec: TransformerParamSpec;
    };
    params: TransformerParams;
  },
  tokenize_fn: (input: string) => number[],
  inputs: string[],
  generator: RandomStream
): TransformerComputation {
  const maxInputLength = inputs.reduce(
    (max, curInput) => (max >= curInput.length ? max : curInput.length),
    0,
  );
  const inputLength = Math.max(model.config.spec.posEncodingSeqLength, maxInputLength);

  // Encode inputs using the r50k_base.encode which is the tokenizer used for GPT2.
  // TODO(@aliciafmachado): There is no clear padding in the vocabulary of GPT2. We are currently using 
  // the token of idx 0. If propagate the masking to the loss computation this should not be an issue.
  const padTokenId = 0;
  const inputsIdxs = tokenizeAndMapToIdx(tokenize_fn, inputs);

  let gtensorInputs = embedBatch(
    model.params.tokenEmbedding,
    inputsIdxs,
    {
      paddingId: padTokenId,
      padAt: 'start',
      dtype: 'int32',
      maxInputLength: inputLength,
    }
  );

  if (model.config.spec.addPosEmbeddings) {
    gtensorInputs = addPosEmbeddings(model, gtensorInputs)
  }

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

export function computePredictionWithLoadedTokenizer(
  model: {
    config: { spec: TransformerParamSpec };
    params: TransformerParams;
  },
  tokenize_fn: (input: string) => number[],
  decode_token_fn: (input: number[]) => string,
  // We tokenize directly with the preprocessing function from gpt-tokenizer.
  inputs: string[],
  generator: RandomStream
  // TODO(@aliciafmachado): save the input as well, and split in two functions: one that tokenizes and one that doesn't.
): string[] {
  const examplePredictions = tf.tidy(() => {
    const decoderComputation = computeDecoderWithLoadedTokenizer(model, tokenize_fn, inputs, generator);
    const predictions = transformerTopPrediction(model, decoderComputation);
    // TODO(@aliciafmachado): one hot encoding could not be right - what's the right implementation before going into the embedder?
    // this part should return a tensor and then we transform it into a number outside the tidy fn, and in a separate fn.
    return (predictions.tensor.arraySync() as number[]).map((arr: number) => decode_token_fn([arr]));
  });
  return examplePredictions;
}

export function makeTransformer(transformerConfig: Config): TransformerModel {
  const config = structuredClone(transformerConfig);
  const params = initDecoderParams(config);
  return { config, params };
}
