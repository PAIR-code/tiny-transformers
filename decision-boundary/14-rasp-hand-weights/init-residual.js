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

window.initResidual = function(model){

  var resSel = d3.select('.residual').html('')
    .st({marginLeft: 100, width: 1400, marginTop: 5})
  var color = d3.scaleSequential(d3.interpolatePlasma).domain([0, 1])
  var bwColor = d => Math.abs(d - 0) < 1e-6 ? '#eee' : d == 1 ? '#000' : '#f0f'

  var blockSel = resSel.appendMany('div', model.weights.layers)
    .st({display: 'inline-block'})
    .on('mouseover', layer => window.initLayerWeights(model, layer))

  var layerResiduals = null
  var renderFns = []
  window.renderAll.fns.push(() => {
    tf.tidy(() => {
      var activations = model._model([modelInput.curInput])

      layerResiduals = activations.layerActivations.map(d => d.hOut.arraySync()[0])

      window.lastActivations = {}
      d3.entries(_.last(activations.layerActivations)).forEach(({key, value}) => {
        lastActivations[key] = value.arraySync()[0]
      })

      renderFns.forEach(d => d())
    })
  })

  blockSel.each(drawBlock)
  function drawBlock(layer, layerIndex){
    var sw = 15
    var sh = 15
    var {sequence_length, model_size} = model.hyper

    var c = d3.conventions({
      sel: d3.select(this),
      width: sw*sequence_length,
      height: sh*model_size,
      margin: {right: 10},
    })

    c.svg.append('text')
      .text(layer.name + (layerIndex ? ' (' + layer.type + ')' : ''))
      .at({textAnchor: 'middle', fontSize: 10, textAnchor: 'middle', x: c.width/2, y: -3})

    var rectData = d3.cross(d3.range(sequence_length), d3.range(model_size))
      .map(([tokenIndex, resIndex]) => ({v: 0, tokenIndex, resIndex}))
    rectData.forEach(d => {
      d.resIndexName = model.hyper.indToName[d.resIndex].key
      d.resIndexOffset = model.hyper.indToName[d.resIndex].j
    })

    var rectSel = c.svg.appendMany('rect', rectData)
      .translate(d => [sw*d.tokenIndex, sh*d.resIndex])
      .at({width: sw - .5, height: sh - .5})
      .call(d3.attachTooltip)

    renderFns.push(() => {
      if (!layerResiduals) return

      var data = layerResiduals[layerIndex]
      rectData.forEach(d => d.v = data[d.tokenIndex][d.resIndex])
      rectSel.at({
        fill: d => {
          var m = model.hyper.indToName[d.resIndex]

          if (m.key.includes('_inv')){
            return bwColor(d.v > 0 ? 1 : 0)
          }
          if (m.key.includes('one_hot') || m.key.includes('is_num')){
            return bwColor(d.v)
          } else if (m.key.includes('_num')){
            return color(d.v/9)
          } else if (m.key.includes('_count')){
            return color(d.v/4)
          } else if (m.key.includes('left_prob')){
            return color(d.v)
          }
          return bwColor(d.v)
        }
      })
    })

    if (layerIndex) return
    c.svg.appendMany('text', d3.entries(model.hyper.namedIndices))
      .text(d => d.key)
      .translate(d => [-5, sh*d.value[0] + sh*.5])
      .at({textAnchor: 'end', fontSize: 10, dy: '.33em'})

  }

}


window.init?.()