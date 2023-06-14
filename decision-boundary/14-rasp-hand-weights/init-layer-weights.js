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

window.initLayerWeights = function(model, layer){
  var color = d3.scaleSequential(d3.interpolatePlasma).domain([0, 1])
  var bwColor = d => Math.abs(d - 0) < 1e-6 ? '#eee' : d == 1 ? '#000' : '#f0f'

  var sel = d3.select('.layer-weights').html('')
    .st({marginLeft: 100, width: 1400, marginTop: 5})

  sel
    .appendMany('div', d3.entries(layer.params))
    .st({display: 'inline-block'})
    .each(drawBlock)

  var weightRectSel = sel.selectAll('rect.weight-rect')

  function drawBlock(params){
    var paramsKey = params.key
    var weightMatrix = params.value

    var dimNames = {
      queryW: ['res', 'hidden_qk'],
      keyW: ['res', 'hidden_qk'],
      valueW: ['res', 'hidden_ov'],
      linearW: ['hidden_ov', 'res'],
      hiddenW: ['res', 'hidden_mlp'],
      outputW: ['hidden_mlp', 'res'],
    }[paramsKey]

    var sw = 5
    var sh = 5

    var nCols = weightMatrix.length
    var nRows = weightMatrix[1].length

    var c = d3.conventions({
      sel: d3.select(this),
      width: sw*nCols,
      height: sh*nRows,
      margin: {right: 10},
    })

    c.svg.append('text').text(paramsKey)
      .at({textAnchor: 'middle', fontSize: 10, textAnchor: 'middle', x: c.width/2, y: -3})

    var rectData = d3.cross(d3.range(nCols), d3.range(nRows))
      .map(([i, j]) => ({v: weightMatrix[i][j], i, j}))

    rectData.forEach(d => {
      d.resIndex = dimNames[0] == 'res' ? d.i : d.j
      d.resIndexName = model.hyper.indToName[d.resIndex].key
      d.resIndexOffset = model.hyper.indToName[d.resIndex].j

      d.hiddenName = dimNames.filter(d => d != 'res')[0]
      d.hiddenIndex = dimNames[0] == 'res' ? d.j : d.i
    })

    c.svg.appendMany('rect.weight-rect', rectData)
      .translate(d => [sw*d.i, sh*d.j])
      .at({width: sw - .5, height: sh - .5})
      .call(d3.attachTooltip)
      .st({fill: d => bwColor(d.v)})
      .on('mouseover', d => {
        weightRectSel
          .classed('is-hidden-match', e => d.hiddenName == e.hiddenName && d.hiddenIndex == e.hiddenIndex)
        weightRectSel
          .classed('is-res-match', e => d.resIndex == e.resIndex)
      })
  }

}


window.init?.()