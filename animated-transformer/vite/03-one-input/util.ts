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

import { GTensor, DName, makeTruncNormal } from '../../src/lib/gtensor/gtensor';
import { gtensorTrees } from '../../src/lib/gtensor/gtensor_tree';
import * as transformer from '../../src/lib/transformer/transformer_gtensor';
import { TokenEmb } from '../../src/lib/tokens/token_gemb';
import * as tf from '@tensorflow/tfjs';
import * as abtask from '../../src/lib/seqtasks/ab_task';

function initVocabConfig(config) {
  // Create a tokenEmbedding that has an extra mask token.
  const maskToken = '[MASK]';
  const padToken = '[PAD]';
  const vocab = ['a', 'b', maskToken];
  const padTokenId = vocab.length - 1;

  const tokenEmb = new TokenEmb(
    vocab,
    makeTruncNormal({ token: vocab.length, inputRep: config.decoderSizes.rep })
  );

  return { maskToken, padToken, vocab, padTokenId, tokenEmb };
}

interface TrainingBatch {
  batchId: number;
  inputs: GTensor<'batch' | 'pos' | 'inputRep'>;
  targets: GTensor<'batch'>;
  examples: abtask.Example[];
}

interface TrainStep {
  batch: TrainingBatch;
  params: transformer.TransformerParams;
  gradParams: transformer.TransformerParams;
  updatedParams: transformer.TransformerParams;
  perExampleLoss: tf.Tensor;
}

interface VocabConfig {
  maskToken: string;
  padTokenId: number;
  taskConfig: abtask.AbTaskConfig;
  tokenEmb: { embeddings: GTensor<'token' | 'inputRep'> };
}

function trainStep(
  params: transformer.TransformerParams,
  config,
  lr = 0.1,
  batch: TrainingBatch
): TrainStep {
  // TODO: Move to outer loop?
  const batchSizeScalar = tf.scalar(config.taskConfig.batchSize);

  function tfLoss(...tensors: tf.Tensor[]): tf.Tensor {
    const decoderComputation = transformer.computeTransformer(params, batch.inputs);

    const loss = transformer.lastTokenCrossEntropyLoss(
      decoderComputation,
      config.vocab.tokenEmb.embeddings,
      batch.targets
    );

    return loss;
  }

  // enables trainable embeddings
  // batch.updateInputEmb()
  // const gtensors = gtensorTrees.flatten(params).concat(vocabConfig.tokenEmb.embeddings);

  const gtensors = gtensorTrees.flatten(params);

  const tfGradFn = tf.valueAndGrads(tfLoss);
  const gradAndValue = tfGradFn(gtensors.map((g) => g.tensor));
  // const gradAndValue = tf.tidy(() => tfGradFn(gtensors.map(g => g.tensor)));
  const gradTensors = gradAndValue.grads;
  const gradGTensors = gradTensors.map((t, i) => new GTensor(t, gtensors[i].dimNames));
  const gradParams = gtensorTrees.unflatten(params, gradGTensors);

  const scalarLr = tf.scalar(lr);
  window.gradGTensors = gradGTensors;
  const updatedParams = gtensorTrees.map(params, (g, i) =>
    g.pointwiseSub(gradGTensors[i]._tfScalarMul(scalarLr))
  ) as transformer.TransformerParams;

  return {
    batch,
    params,
    gradParams,
    updatedParams,
    perExampleLoss: tf.div(gradAndValue.value, batchSizeScalar),
  };
}

function transformerSoftmaxAndLoss(
  params: transformer.TransformerComputation,
  tokenEmb: GTensor<'token' | 'inputRep'>,
  targetTokenIdxs: GTensor<'batch'>
): Tensor {
  const lastLayer = params.layers[params.layers.length - 1];
  const positionParams = lastLayer.ffLayer2Rep.unstack('pos');
  const lastPosParams = positionParams[positionParams.length - 1];

  const dotProd = lastPosParams.rename('ffOut', 'inputRep').contract(tokenEmb, ['inputRep']);
  // TODO: verify this: assumes softmax is batched over the non-selected
  // dimensions.
  const softmax = dotProd.softmax('token');

  const oneHotToken = new GTensor(tf.oneHot(targetTokenIdxs.tensor, tokenEmb.dim.token.size), [
    'batch',
    'token',
  ]);

  const signedDelta = softmax.pointwiseSub(oneHotToken);
  const squaredError = signedDelta.pointwiseMul(signedDelta);
  const loss = squaredError.sumOverDims(['batch', 'token']).tensor;

  return { softmax, loss };
}

function generateStaticBatch(batchId, config) {
  const { maskToken, padTokenId, tokenEmb } = config.vocab;
  var examples = d3.range(Math.pow(config.taskConfig.inputSeqLen, 2)).map((i) => {
    var str = i.toString(2);
    while (str.length < config.taskConfig.inputSeqLen) str = '0' + str;

    var input = d3.range(config.taskConfig.inputSeqLen).map((i) => (str[i] == '1' ? 'b' : 'a'));
    var inputStr = input.join(' ');

    var aCount = d3.sum(input, (d) => d == 'a');
    var output = aCount > config.taskConfig.inputSeqLen / 2 ? 'a' : 'b';
    // output = 'a'

    return { input, inputStr, aCount, output };
  });
  examples = _.sortBy(examples, (d) => -d.aCount);
  examples.forEach((d, i) => (d.i = i));

  const inputs = tokenEmb.embedBatch(
    examples.map((example) => example.input.concat(maskToken)),
    { paddingId: padTokenId, padAt: 'start', dtype: 'int32' }
  );

  const exampleOutputs = examples.map((example) => tokenEmb.tokenToIdx[example.output[0]]);
  const targets = new GTensor(tf.tensor(exampleOutputs, [examples.length], 'int32'), ['batch']);

  var rv = { batchId, examples, inputs, targets, updateInputEmb };

  function updateInputEmb() {
    // TODO: fix as one hot multiply instead?
    rv.inputs = tokenEmb.embedBatch(
      examples.map((example) => example.input.concat(maskToken)),
      { paddingId: padTokenId, padAt: 'start', dtype: 'int32' }
    );
  }
  updateInputEmb();

  return rv;
}

function flattenLayerParams(layer) {
  var matrices = [];
  d3.entries(layer).forEach((d) => {
    if (d.value.tensor) matrices.push(d);
    // TODO: recurse?
    else {
      d3.entries(d.value).forEach((e) => {
        e.key = d.key + '_' + e.key;
        matrices.push(e);
      });
    }
  });

  return matrices;
}

function addCanvas(sel, width, height) {
  var scale = window.devicePixelRatio || 1;
  // TODO: correct minisquare sizing
  scale = 1;

  var canvasSel = sel
    .st({ position: 'relative', width, height })
    .append('canvas')
    .at({ width: width * scale, height: height * scale })
    .st({ width, height, position: 'absolute' });

  var ctx = canvasSel.node().getContext('2d');
  ctx.scale(scale, scale);

  var svgSel = sel
    .append('svg.svg-drag')
    .at({ width, height })
    .st({ position: 'absolute', pointerEvents: 'none', overflow: 'visible' })
    .append('g');

  return { ctx, canvasSel, svgSel };
}

export {
  initVocabConfig,
  addCanvas,
  trainStep,
  flattenLayerParams,
  generateStaticBatch,
  transformerSoftmaxAndLoss,
};
