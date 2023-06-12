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
import * as transformer from '../../src/lib/transformer/transformer_gtensor';
import * as tf from '@tensorflow/tfjs';

import { generateBatches } from '../../src/lib/seqtasks/util';
import * as abtask from '../../src/lib/seqtasks/ab_task';
// import * as aOnlyTask from '../../src/lib/seqtasks/a_only_task';
import { TokenEmb } from '../../src/lib/tokens/token_gemb';
import * as param_map from '../../src/lib/gtensor/gtensor_tree';
import { gtensorTrees } from '../../src/lib/gtensor/gtensor_tree';

// import {plotParams} from './plot-params';

declare var d3: any
declare var _: any


const taskConfig: abtask.AbTaskConfig = {
  inputSeqLen: 4,
  batchSize: 32,
};

const inputRep = 3;

const decoderSizes: transformer.TransformerParamSpec = {
  rep: inputRep,
  kqv: 4,
  ffRep: 5,
  nlayers: 3,
};

// Create a tokenEmbedding that has an extra mask token.
const maskToken = '[MASK]';
const padToken = '[PAD]';
const vocab = ['a', 'b', maskToken, padToken];
// const maskTokenId = vocab.length - 2;
const padTokenId = vocab.length - 1;
const tokenEmb = new TokenEmb(vocab, makeTruncNormal(
  { token: vocab.length, inputRep }));

window.tokenEmb = tokenEmb

export async function trainAB() {
  // Create training batches that have the mask token added to the end of the
  // input.
  const nBatches = 5;

  interface TrainingBatch {
    batchId: number;
    inputs: GTensor<'batch' | 'pos' | 'inputRep'>;
    // TODO: this is a special case of predicting only a single next token.
    targets: GTensor<'batch'>;
    examples: abtask.Example[];
  }

  const trainingBatches = d3.range(nBatches).map(generateStaticBatch)

  interface TrainStep {
    batch: TrainingBatch;
    initParams: transformer.TransformerParams;
    gradParams: transformer.TransformerParams;
    updatedParams: transformer.TransformerParams;
    perExampleLoss: tf.Tensor;
  }

  const batchSizeScalar = tf.scalar(taskConfig.batchSize);

  // TODO: cleanup using a gtensor.valueAndGrads function.
  function trainStep(
    initParams: transformer.TransformerParams,
    lr = 0.1,
    batch: TrainingBatch,
  ): TrainStep {
    function tfLoss(...tensors: tf.Tensor[]): tf.Tensor {
      // TODO: check if we can skip unflattening, and just use coincidental
      // params tensors matching input tensors?
      // const decoderParams = param_map.unflatten(initParams, tensors);
      const decoderComputation = transformer.computeTransformer(
        initParams, batch.inputs);
      const loss = transformer.transformerLastTokenCrossEntropyLoss(
        decoderComputation, tokenEmb.embeddings, batch.targets);
      // console.log(batch.targets.tensor.dataSync())
      return loss;
    }

    // batch.updateInputEmb()

    const gtensors = gtensorTrees.flatten(initParams)//.concat(tokenEmb.embeddings);
    const tfGradFn = tf.valueAndGrads(tfLoss);
    const gradAndValue = tfGradFn(gtensors.map(g => g.tensor));
    // const gradAndValue = tf.tidy(() => tfGradFn(gtensors.map(g => g.tensor)));
    const gradTensors = gradAndValue.grads;
    const gradGTensors = gradTensors.map((t, i) =>
      new GTensor(t, gtensors[i].dimNames));
    const gradParams = gtensorTrees.unflatten(initParams, gradGTensors);
    const scalarLr = tf.scalar(lr)
    const updatedParams = gtensorTrees.map(initParams, (g, i) =>
      g.pointwiseSub(gradGTensors[i]._tfScalarMul(scalarLr))) as transformer.TransformerParams;

    return {
      batch,
      initParams,
      gradParams,
      updatedParams,
      perExampleLoss: tf.div(gradAndValue.value, batchSizeScalar),
    };
  }



  const chart = initChart()

  // var params = transformer.initDecoderParams(decoderSizes);

  // Try to avoid inits with dead softmax layer
  var count = 0
  do {
    var params = transformer.initDecoderParams(decoderSizes);
    let decodeComp = transformer.computeTransformer(params, trainingBatches[0].inputs)
    let loss = transformer.transformerLastTokenCrossEntropyLoss(
      decodeComp, tokenEmb.embeddings, trainingBatches[0].targets);

    var perExampleLoss = tf.div(loss, batchSizeScalar).dataSync()[0]
    console.log({ perExampleLoss })
  } while (perExampleLoss >= .375 && count++ < 10)



  const instanceUUID = Math.random()
  window.__instanceUUID = instanceUUID
  for (let i in d3.range(200)) {
    if (window.__instanceUUID != instanceUUID) break

    const batchTrainStep = trainStep(params, 5, trainingBatches[0])
    params = batchTrainStep.updatedParams

    const loss = batchTrainStep.perExampleLoss.dataSync()
    // console.log(`loss: ${loss}`)

    chart.render(params, loss, i)
    await sleep(1)
  }


  // if (window.__timer) window.__timer.stop()
  // window.__timer = d3.timer(() => {
  //   const batchTrainStep = trainStep(params, 2, trainingBatches[0])
  //   params = batchTrainStep.updatedParams

  //   const loss = batchTrainStep.perExampleLoss.dataSync()
  //   console.log(`loss: ${loss}`)

  //   chart.render(params)
  // })

}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}


function fmt(d) { return d3.format('.3f') }

function initChart() {
  var appSel = d3.select('.chart-container').html('')
  var updateSel = appSel.append('div')

  var batch = generateStaticBatch(0)
  function render(params, loss, batchIndex) {
    var decodeComp = transformer.computeTransformer(params, batch.inputs)
    var softmax = transformerSoftmax(decodeComp, tokenEmb.embeddings)

    var softmaxFloats = softmax.tensor.dataSync()
    var softmaxFirstToken = d3.range(4).map(i => d3.format('.5f')(softmaxFloats[i]))
    updateSel.html(`
      <p><b>Batch index</b> ${batchIndex}
      <p><b>Loss</b> ${d3.format('.5f')(loss[0])}
      <p><b>Softmax</b> ${softmaxFirstToken.join(', ')}
    `)
  }
  return { render }
}


function generateStaticBatch(batchId) {
  var examples = d3.range(Math.pow(taskConfig.inputSeqLen, 2)).map(i => {
    var str = i.toString(2)
    while (str.length < taskConfig.inputSeqLen) str = '0' + str

    var input = d3.range(taskConfig.inputSeqLen)
      .map(i => str[i] == '1' ? 'a' : 'b')

    var aCount = d3.sum(input, d => d == 'a')

    var output = aCount > taskConfig.inputSeqLen / 2 ? 'a' : 'b'
    return { input, aCount, output }
  })
  examples = _.sortBy(examples, d => d.aCount)

  const inputs = tokenEmb.embedBatch(
    examples.map(example => example.input.concat(maskToken)),
    { paddingId: padTokenId, padAt: 'start', dtype: 'int32' })

  const targets = new GTensor(tf.tensor(
    examples.map(example => tokenEmb.tokenToIdx[example.output[0]]),
    [examples.length],
    'int32'), ['batch'])

  var rv = { batchId, examples, inputs, targets, updateInputEmb }

  function updateInputEmb() {
    // TODO: fix as one hot multiply instead?
    if (rv.inputs) rv.inputs.dispose()
    rv.inputs = tokenEmb.embedBatch(
      examples.map(example => example.input.concat(maskToken)),
      { paddingId: padTokenId, padAt: 'start', dtype: 'int32' })
  }
  updateInputEmb()

  return rv
}

function transformerSoftmax(
  params: TransformerComputation,
  tokenEmb: GTensor<'token' | 'inputRep'>,
): Tensor {
  const lastLayer = params.layers[params.layers.length - 1];
  const positionParams = lastLayer.ffLayer2Rep.unstack('pos');
  const lastPosParams = positionParams[positionParams.length - 1];
  const dotProd = lastPosParams.rename('ffOut', 'inputRep')
    .contract(tokenEmb, ['inputRep']);
  // TODO: verify this: assumes softmax is batched over the non-selected
  // dimensions.
  const softmax = dotProd.softmax('token');
  return softmax;
}










if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      console.clear()
      newModule.trainAB()
      // newModule is undefined when SyntaxError happened
    }
  })
}


