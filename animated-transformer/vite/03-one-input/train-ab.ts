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


import * as transformer from '../../src/lib/transformer/transformer_gtensor'
import * as tf from '@tensorflow/tfjs'

import * as abtask from '../../src/lib/seqtasks/ab_task'
// import * as aOnlyTask from '../../src/lib/seqtasks/a_only_task'

import * as util from './util.js'
import initConfig from './config.js'

declare var d3: any
declare var _: any
window.tf = tf

export function initAB() { initConfig(trainAB) }

export function trainAB(config) {
  const trainingBatches = [util.generateStaticBatch(1, config)]
  let params = transformer.initDecoderParams(config.decoderSizes)

  if (config.initWeight_ff1W !== null) {
    var ff1W = d3.range(config.decoderSizes.kqv).map(_ => d3.range(config.decoderSizes.ffRep).map(d => config.initWeight_ff1W))
    params.layers[0].ff1.w.tensor = tf.tensor(ff1W, [config.decoderSizes.kqv, config.decoderSizes.ffRep])
  }


  // TODO figure out who should own this
  // TODO don't double calc forward pass
  window.calcTrainingStep = function () {
    return util.trainStep(params, config, 0, trainingBatches[0])
  }

  window.chart = initChart(params, config)

  config.stepIndex = 0
  function trainAndRenderStep() {
    if (config.stepIndex + 1 > config.maxSteps) return
    config.stepIndex++

    const batchTrainStep = util.trainStep(params, config, config.learningRate, trainingBatches[0])
    params = batchTrainStep.updatedParams

    try { chart.render(batchTrainStep) } catch (e) { console.log(e) }
  }
  if (window.__timer) window.__timer.stop()
  window.__timer = d3.timer(trainAndRenderStep)
}


var s = 17
var state = {
  batchIndex: 0
}

function initChart(params, config) {
  var appSel = d3.select('.chart-container').html('')
  var batch = util.generateStaticBatch(0, config)

  var activations = transformer.computeTransformer(params, batch.inputs)
  activations.layers.forEach(d => d.isBatch = true)

  var updateSel = appSel.append('div')
  var inputsSel = appSel.append('div.input-container')
  inputsSel.append('div')
    .append('b').text('Input Strings').parent().append('div')
    .appendMany('div.batch-input', batch.examples)
    .text(d => d.inputStr + ' [M]')
    .on('mouseover', d => {
      state.batchIndex = d.i

      render()
    })
  var outputSoftmax = inputsSel.append('div')
    .append('b').text('Output Softmax').parent().append('div')
    .appendMany('div.batch-input', batch.examples)
    .text(d => d.inputStr)
    .on('mouseover', d => {
      state.batchIndex = d.i

      render()
    })

  var gridSel = appSel.append('div.grid-container')

  var weightsState = { title: 'Model Weights', layers: params.layers, gridSel, colorS: .5 }
  drawVisType(weightsState)

  var activationsState = { title: 'Activations', layers: activations.layers, gridSel, colorS: .5, isShowBatch: 1 }
  drawVisType(activationsState)

  var botGridSel = appSel.append('div.grid-container.gradient-container')
  var gradientLayers = params.layers.map(d => Object.assign({}, d)) // shallow copy
  var gradientState = { title: 'Gradients', layers: gradientLayers, gridSel: botGridSel, colorS: .01, isGradient: true }
  drawVisType(gradientState)

  var height = Math.max(weightsState.layerSel.node().offsetHeight, activationsState.layerSel.node().offsetHeight)
  appSel.selectAll('.layer').st({ height })

  var prevBatchTrainStep
  function render(batchTrainStep = prevBatchTrainStep) {
    prevBatchTrainStep = batchTrainStep
    // console.log(batchTrainStep)

    var activations = transformer.computeTransformer(batchTrainStep.params, batch.inputs)
    var { softmax, loss } = util.transformerSoftmaxAndLoss(activations, config.vocab.tokenEmb.embeddings, batch.targets)
    var softmaxFloats = softmax.tensor.arraySync()
    loss = loss.dataSync()[0] / config.taskConfig.batchSize

    weightsState.render(batchTrainStep.params.layers)
    activationsState.render(activations.layers)
    gradientState.render(batchTrainStep.gradParams.layers)

    inputsSel.selectAll('.batch-input').classed('active', d => state.batchIndex == d.i)
    outputSoftmax.html(d => {
      var vals = d3.range(3).map(i => softmaxFloats[d.i][i])
      var maxVal = d3.max(vals)
      return vals.map((d, i) =>
        `<span class='${d == maxVal ? 'is-max' : ''}'>${d3.format('.3f')(d)}${i == 2 ? '' : ','}</span>`).join(' ')
    })

    updateSel.html(`
      <b>Training Status</b>
      <p>Step index: ${config.stepIndex}
      <p>Loss: ${d3.format('.5f')(loss)}
    `)
  }

  return { render }
}

// sets up weights, gradients and activation vis
function drawVisType(visState) {
  var sel = visState.gridSel.append('div')

  var sliderScale = d3.scalePow().range([.01, 8]).exponent(2)
  sel.append('div.vis-state-control').html(`
    <b>${visState.title}</b>
    <span>color max <val></val></span>
    <input type=range min=0 max=1 step=.0001 value=${sliderScale.invert(visState.colorS)}></input>
    ${visState.title == 'Activations' ?
      `<span>show batch</span><input type=checkbox ${visState.isShowBatch ? 'checked' : ''}>` : ''
    }
  `)
  var updateColorVal = () => sel.select('val').text(d3.format('.2f')(visState.colorS))
  updateColorVal()

  var slideSel = sel.select('input[type="range"]')
    .on('input', function () {
      visState.colorS = sliderScale(this.value)
      updateColorVal()
      window.chart.render()
    })
  var checkboxSel = sel.select('input[type="checkbox"]')
    .on('input', function () {
      visState.isShowBatch = checkboxSel.property('checked')
      window.chart.render()
    })

  visState.layerSel = sel.appendMany('div.layer', visState.layers)
    .each(function (d, i) { drawLayer(d, i, this, visState) })

  visState.render = layers => {
    visState.layerSel.each((d, i) => d.render(layers[i], i))
  }

  if (visState.title != 'Activations') return

  sel.append('div.anno-label').lower().translate([-45, 78])
    .append('div').text('← Token Pos').st({ transform: 'rotate(-90deg)' })

  sel.append('div.anno-label').lower()//.translate([-45, 78])
    .st({ right: -105, bottom: 5 })
    .append('div').text('← [MASK] Output')
}

function drawLayer(layer, layerIndex, node, visState) {
  var sel = d3.select(node)
  var isBatch = layer.isBatch

  var layerRenderFns = {}

  sel.appendMany('div', util.flattenLayerParams(layer)).each(drawMatrix)
    .st({ display: 'inline-block', padding: 2 })

  function drawMatrix({ key, value }) {
    // var isLogging = key == 'ff1 b'

    var gtensor = value
    var ppKey = key.replace('Values', 'Vals').replace('Layer', '').replace('attended', 'att')

    var shape = gtensor.tensor.shape.slice(-2)
    if (shape.length == 1) shape = [1, shape[0]]

    var sel = d3.select(this).st({ position: 'relative' })
      .call(d3.attachTooltip)
      .on('mouseover', () => {
        var ttSel = d3.select('.tooltip').html('')
        ttSel.append('div').append('b').text(ppKey)
        ttSel.append('div').text(gtensor.dimNames.join(' ✕ '))
        // TODO match matrix shape / color?

        if (layer.isBatch) {
          var batchSel = ttSel.appendMany('div.batch', [gtensor.unstack('batch')[state.batchIndex]])
          batchSel.append('div.num-block').appendMany('span', d => d.tensor.dataSync())
            .text(d => d3.format('+.5f')(d) + ', ')
        } else {
          ttSel.append('div.num-block')
            .appendMany('span', gtensor.tensor.dataSync())
            .text(d => d3.format('+.5f')(d) + ', ')
        }
      })

    sel.append('div').st({ position: 'absolute', top: -13, fontSize: 12, color: '#666' })
      .text(ppKey)

    // TODO: align dims better?
    // var maxDim = Math.max(shape[1] || 0, shape[0] || 0)*s
    var { ctx, canvasSel, svgSel } = isBatch && key != 'attendedValues' ? util.addCanvas(sel, shape[1] * s, shape[0] * s) : util.addCanvas(sel, shape[0] * s, shape[1] * s)

    // var {ctx, canvasSel} = util.addCanvas(sel, shape[1]*s, shape[0]*s)

    var drag = d3.drag()
      .subject(function () {
        var [px, py] = d3.mouse(this)
        var arr = [px, py].map(d => Math.floor(d / s))//.reverse()
        if (key.includes('_b')) arr.reverse()
        var buffer = gtensor.tensor.bufferSync()
        if (gtensor.tensor.shape.length == 1) arr.pop()
        var initVal = buffer.get(...arr)

        svgSel.translate([px, py].map(d => Math.floor(d / s) * s))
        return { px, py, arr, buffer, initVal }
      })
      .on('drag', function (a, b, c) {
        var { x, subject: { px, arr, buffer, initVal } } = d3.event
        var dx = x - px

        buffer.set(initVal + dx / 100, ...arr)
        gtensor.tensor = buffer.toTensor()
        window.chart.render(window.calcTrainingStep())

        textSel.text(d3.format('.2f')(initVal + dx / 100))
      })
      .on('start', () => {
        d3.select('body').classed('is-dragging', 1)
        sel.classed('is-dragging-sel', 1)
      })
      .on('end', () => {
        d3.select('body').classed('is-dragging', 0)
        sel.classed('is-dragging-sel', 0)
      })

    if (visState.title == 'Model Weights') {
      svgSel.append('rect')
        .at({ width: s, height: s, fill: 'none', stroke: 'red', strokeWidth: 2 })
      var textSel = svgSel.append('text')
        .at({ textAnchor: 'middle', y: s, dy: '1em', fill: 'red', x: s / 2, fontSize: 10 })
        .text('.012')

      canvasSel.call(drag)
    }

    var color = visState.isGradient ?
      d => d3.interpolatePuOr((-d + visState.colorS) / visState.colorS / 2) :
      d => d3.interpolatePuOr((d + visState.colorS) / visState.colorS / 2)

    function render2d(gtensorUpdate, keyUpdate) {
      // if (key != 'keyM' || layerIndex != 0) return
      // console.table(gtensor.tensor.arraySync())

      gtensor = gtensorUpdate
      var rawTensor = gtensor.tensor.dataSync()
      for (var i = 0; i < rawTensor.length; i++) {
        var x = i % shape[1]
        var y = Math.floor(i / shape[1])

        ctx.beginPath()
        ctx.fillStyle = color(rawTensor[i])
        ctx.rect(y * s, x * s, s - 1, s - 1)
        ctx.fill()
      }
    }

    var batchSize = shape[0] * shape[1]
    function renderBatch(gtensorUpdate) {
      visState.isShowBatch ? render3dBatch(gtensorUpdate) : render3dBatchSlice(gtensorUpdate)
    }
    function render3dBatch(gtensorUpdate) {
      gtensor = gtensorUpdate
      var rawTensor = gtensor.tensor.dataSync()
      for (var i = 0; i < rawTensor.length; i++) {
        var batchIndex = Math.floor(i / batchSize)

        var x = (i % batchSize) % shape[1]
        var y = Math.floor(i / shape[1]) % shape[0]

        // TODO: don't assume batch size of 16
        var bx = (batchIndex % 4) / 4
        var by = Math.floor(batchIndex / 4) / 4

        ctx.beginPath()
        ctx.fillStyle = color(rawTensor[i])
        ctx.rect((x + bx) * s, (y + by) * s, (s - 4) / 4, (s - 4) / 4)
        ctx.fill()
      }
    }

    function render3dBatchSlice(gtensorUpdate) {
      gtensor = gtensorUpdate
      var rawTensor = gtensor.tensor.dataSync()

      const iOffset = shape[0] * shape[1] * state.batchIndex
      for (var i = 0; i < shape[0] * shape[1]; i++) {
        var x = i % shape[1]
        var y = Math.floor(i / shape[1])

        if (key == 'attendedValues') [y, x] = [x, y]

        ctx.beginPath()
        ctx.fillStyle = color(rawTensor[i + iOffset])
        ctx.rect(x * s, y * s, s - 1, s - 1)
        ctx.fill()
      }
    }

    layerRenderFns[key] = isBatch ? renderBatch : render2d
  }

  function render(layer, layerIndex) {
    var matrices = util.flattenLayerParams(layer)
    matrices.forEach((matrix, i) => {
      layerRenderFns[matrix.key](matrix.value, matrix.key)
    })
  }

  // TODO: switch to returned fn?
  layer.render = render
}















if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    try {
      if (newModule) {
        console.clear()
        newModule.initAB()
      }
    } catch (e) {
      console.log(e)
    }
  })
}


