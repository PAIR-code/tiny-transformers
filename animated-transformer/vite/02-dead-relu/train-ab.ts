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


declare var d3: any
declare var _: any
window.tf = tf


const taskConfig: abtask.AbTaskConfig = {
  inputSeqLen: 4,
  batchSize: 16,
};

const inputRep = 4;

const decoderSizes: transformer.TransformerParamSpec = {
  rep: inputRep,
  kqv: 4,
  ffRep: 1,
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

tokenEmb.embeddings.tensor = tf.oneHot(d3.range(vocab.length), inputRep)
window.tokenEmb = tokenEmb

export function trainAB() {
  // Create training batches that have the mask token added to the end of the
  // input.

  interface TrainingBatch {
    batchId: number;
    inputs: GTensor<'batch' | 'pos' | 'inputRep'>;
    // TODO: this is a special case of predicting only a single next token.
    targets: GTensor<'batch'>;
    examples: abtask.Example[];
  }

  const trainingBatches = d3.range(1).map(generateStaticBatch)

  interface TrainStep {
    batch: TrainingBatch;
    initParams: transformer.TransformerParams;
    gradParams: transformer.TransformerParams;
    updatedParams: transformer.TransformerParams;
    perExampleLoss: tf.Tensor;
  }

  const batchSizeScalar = tf.scalar(taskConfig.batchSize);

  function trainStep(
    params: transformer.TransformerParams,
    lr = 0.1,
    batch: TrainingBatch,
  ): TrainStep {
    function tfLoss(...tensors: tf.Tensor[]): tf.Tensor {
      const decoderComputation = transformer.computeTransformer(
        params, batch.inputs);
      const loss = transformer.transformerLastTokenCrossEntropyLoss(
        decoderComputation, tokenEmb.embeddings, batch.targets);
      return loss;
    }

    batch.updateInputEmb()

    const gtensors = gtensorTrees.flatten(params).concat(tokenEmb.embeddings);
    const tfGradFn = tf.valueAndGrads(tfLoss);
    const gradAndValue = tfGradFn(gtensors.map(g => g.tensor));
    // const gradAndValue = tf.tidy(() => tfGradFn(gtensors.map(g => g.tensor)));
    const gradTensors = gradAndValue.grads;
    const gradGTensors = gradTensors.map((t, i) =>
      new GTensor(t, gtensors[i].dimNames));
    const gradParams = gtensorTrees.unflatten(params, gradGTensors);
    const scalarLr = tf.scalar(lr)
    const updatedParams = gtensorTrees.map(params, (g, i) =>
      g.pointwiseSub(gradGTensors[i]._tfScalarMul(scalarLr))) as transformer.TransformerParams;

    return {
      batch,
      params,
      gradParams,
      updatedParams,
      perExampleLoss: tf.div(gradAndValue.value, batchSizeScalar),
    };
  }


  // Try to avoid inits with dead softmax layer
  var count = 0
  do {
    var params = transformer.initDecoderParams(decoderSizes);
    let decodeComp = transformer.computeTransformer(params, trainingBatches[0].inputs)
    let loss = transformer.transformerLastTokenCrossEntropyLoss(
      decodeComp, tokenEmb.embeddings, trainingBatches[0].targets);

    var perExampleLoss = tf.div(loss, batchSizeScalar).dataSync()[0]
  } while (perExampleLoss >= .375 && count++ < 10 && 0)

  // if (perExampleLoss >= .375) console.log('bad init')


  window.chart = initChart(params, trainAndRenderStep)

  var batchIndex = 0
  function trainAndRenderStep() {
    const batchTrainStep = trainStep(params, .1, trainingBatches[0])
    params = batchTrainStep.updatedParams
    // const loss = batchTrainStep.perExampleLoss.dataSync()

    chart.render(params, batchIndex)
    if (batchIndex++ > 1) window.__timer.stop()
  }
  if (window.__timer) window.__timer.stop()
  window.__timer = d3.timer(trainAndRenderStep)
}


var s = 17

function initChart(params) {
  var appSel = d3.select('.chart-container').html('')
  var batch = generateStaticBatch(0)

  var activations = transformer.computeTransformer(params, batch.inputs)
  activations.layers.forEach(d => d.isBatch = true)


  var updateSel = appSel.append('div')

  var gridSel = appSel.append('div.grid-container')

  var weightsSel = gridSel.append('div').append('h3').text('Model Weights')
    .parent()
    .appendMany('div.layer', params.layers).each(drawLayer)

  var activationSel = gridSel.append('div').append('h3').text('Batch Activations')
    .parent()
    .appendMany('div.layer', activations.layers).each(drawLayer)

  var height = Math.max(weightsSel.node().offsetHeight, activationSel.node().offsetHeight)
  appSel.selectAll('.layer').st({ height })

  var batchIndex = null
  function render(paramsUpdate = params, batchIndexUpdate = batchIndex) {
    params = paramsUpdate
    batchIndex = batchIndexUpdate

    var activations = transformer.computeTransformer(params, batch.inputs)
    var { softmax, loss } = transformerSoftmaxAndLoss(activations, tokenEmb.embeddings, batch.targets)
    var softmaxFloats = softmax.tensor.dataSync()
    var softmaxFirstToken = d3.range(4).map(i => d3.format('.5f')(softmaxFloats[i]))
    loss = loss.tensor.dataSync()[0] / taskConfig.batchSize

    weightsSel.each((d, i) => d.render(params.layers[i], i))
    activationSel.each((d, i) => d.render(activations.layers[i]))

    updateSel.html(`
      <p><b>Batch index</b> ${batchIndex}
      <p><b>Loss</b> ${d3.format('.5f')(loss)}
      <p><b>Softmax</b> ${softmaxFirstToken.join(', ')}
    `)


    // console.log(softmax.tensor.dataSync().slice(0, 4))
    // console.log(`loss: ${loss}`)

  }

  return { render }
}

function drawLayer(layer, i) {
  var sel = d3.select(this)
  var isBatch = layer.isBatch

  var layerRenderFns = {}

  sel.appendMany('div', flattenLayerParams(layer)).each(drawMatrix)
    .st({ display: 'inline-block', padding: 2 })


  function drawMatrix({ key, value }) {
    // var isLogging = key == 'ff1 b'

    var gtensor = value
    var ppKey = key.replace('Values', 'Val')

    var shape = gtensor.tensor.shape.slice(-2)

    var sel = d3.select(this).st({ position: 'relative' })
      .call(d3.attachTooltip)
      .on('mouseover', () => {
        var ttSel = d3.select('.tooltip').html('')
        ttSel.append('div').append('b').text(ppKey)
        ttSel.append('div').text(gtensor.dimNames.join(' ✕ '))
        // TODO match matrix shape / color?

        if (layer.isBatch) {
          console.log(gtensor.tensor.shape)
          var batchSel = ttSel.appendMany('div.batch', gtensor.unstack('batch'))
          batchSel.append('div.num-block').appendMany('span', d => d.tensor.dataSync())
            .text(d => d3.format('+.5f')(d) + ', ')
        } else {
          ttSel.append('div.num-block')
            .appendMany('span', gtensor.tensor.dataSync())
            .text(d => d3.format('+.5f')(d) + ', ')
        }
      })
      .on('click', () => {
        console.log(gtensor)
        console.log(gtensor.tensor.dataSync())
      })

    sel.append('div').st({ position: 'absolute', top: -13, fontSize: 12, color: '#666' })
      .text(ppKey)

    var { ctx, canvasSel } = addCanvas(sel, shape[0] * s, shape[1] * s)


    var drag = d3.drag()
      .subject(function () {
        var [px, py] = d3.mouse(this)
        var arr = [px, py].map(d => Math.floor(d / s))
        var buffer = gtensor.tensor.bufferSync()
        if (gtensor.tensor.shape.length == 1) arr.pop()
        var initVal = buffer.get(...arr)

        return { px, py, arr, buffer, initVal }
      })
      .on('drag', function (a, b, c) {
        var { x, subject: { px, arr, buffer, initVal } } = d3.event
        var dx = x - px

        buffer.set(initVal + dx / 1000, ...arr)
        gtensor.tensor = buffer.toTensor()
        window.chart.render()
        d3.select('.tooltip').text(initVal + dx / 1000)
      })
      .on('start', () => d3.select('body').classed('is-dragging', 1))
      .on('end', () => d3.select('body').classed('is-dragging', 0))
    canvasSel.call(drag)


    function color(d) {
      return d == 0 ? '#f0f' : d3.interpolatePuOr(d * 2 + 1 / 2)
    }

    function render2d(gtensorUpdate, keyUpdate) {
      gtensor = gtensorUpdate
      var rawTensor = gtensor.tensor.dataSync()
      for (var i = 0; i < rawTensor.length; i++) {
        var x = i % shape[0]
        var y = Math.floor(i / shape[0])

        ctx.beginPath()
        ctx.fillStyle = color(rawTensor[i])
        ctx.rect(x * s, y * s, s - 1, s - 1)
        ctx.fill()
      }
    }

    var batchSize = gtensor.tensor.shape[0]
    function render3dBatch(gtensorUpdate) {
      gtensor = gtensorUpdate
      var rawTensor = gtensor.tensor.dataSync()
      for (var i = 0; i < rawTensor.length; i++) {

        var batchIndex = i % batchSize
        var x = Math.floor(i / batchSize) % shape[0]
        var y = Math.floor(i / shape[0] / batchSize)

        // TODO: don't assume batch size of 16
        var bx = (batchIndex % 4) / 4
        var by = Math.floor(batchIndex / 4) / 4

        ctx.beginPath()
        ctx.fillStyle = color(rawTensor[i])
        ctx.rect((x + bx) * s, (y + by) * s, (s - 4) / 4, (s - 4) / 4)
        ctx.fill()
      }
    }

    layerRenderFns[key] = isBatch ? render3dBatch : render2d
  }

  function render(layer, i) {
    var matrices = flattenLayerParams(layer)
    matrices.forEach((matrix, i) => {
      layerRenderFns[matrix.key](matrix.value, matrix.key)
    })
  }
  render(layer, i)

  // TODO: switch to returned fn?
  layer.render = render
}


function flattenLayerParams(layer) {
  var matrices = []
  d3.entries(layer).forEach(d => {
    if (d.value.tensor) matrices.push(d)
    // TODO: recurse?
    else {
      d3.entries(d.value).forEach(e => {
        e.key = d.key + ' ' + e.key
        matrices.push(e)
      })
    }
  })

  return matrices
}


function addCanvas(sel, width, height) {
  var s = window.devicePixelRatio || 1
  // TODO: correct minisquare sizing
  s = 1

  var canvasSel = sel.append('canvas')
    .at({ width: width * s, height: height * s })
    .st({ width: width, height: height })

  var ctx = canvasSel.node().getContext('2d')
  ctx.scale(s, s)

  return { ctx, canvasSel }
}







function generateStaticBatch(batchId) {
  var examples = d3.range(Math.pow(taskConfig.inputSeqLen, 2)).map(i => {
    i = 0
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
    rv.inputs = tokenEmb.embedBatch(
      examples.map(example => example.input.concat(maskToken)),
      { paddingId: padTokenId, padAt: 'start', dtype: 'int32' })
  }
  updateInputEmb()

  return rv
}

function transformerSoftmaxAndLoss(
  params: TransformerComputation,
  tokenEmb: GTensor<'token' | 'inputRep'>,
  targetTokenIdxs: GTensor<'batch'>
): Tensor {
  const lastLayer = params.layers[params.layers.length - 1];
  const positionParams = lastLayer.ffLayer2Rep.unstack('pos');
  const lastPosParams = positionParams[positionParams.length - 1];

  const dotProd = lastPosParams.rename('ffOut', 'inputRep')
    .contract(tokenEmb, ['inputRep']);
  // TODO: verify this: assumes softmax is batched over the non-selected
  // dimensions.
  const softmax = dotProd.softmax('token');

  const oneHotToken = new GTensor(
    tf.oneHot(targetTokenIdxs.tensor, tokenEmb.dim.token.size),
    ['batch', 'token']);
  const signedDelta = softmax.pointwiseSub(oneHotToken);
  const squaredError = signedDelta.pointwiseMul(signedDelta);
  const loss = squaredError.sumOverDims(['batch', 'token']);

  return { softmax, loss };
}







// function plotParams(loss, params, batch){
//   var appSel = d3.select('.chart-container')
//   if (batch.batchId == 0) appSel.html('')

//   var sel = appSel.append('div.batch-row')

//   sel.append('div.batch').text('batch: ' + batch.batchId)
//   sel.append('div.loss').text('loss: ' + d3.format('.3f')(loss))

//   var layerSel = sel.appendMany('div.layer', params.layers)
//     .each(drawLayer)

//   debugger
//   }






if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      console.clear()
      newModule.trainAB()
      // newModule is undefined when SyntaxError happened
    }
  })
}


