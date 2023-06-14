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

window.initKqCircuit = function(model, sel){
  var n_num_tokens = model.hyper.n_num_tokens

  var {embeddingMatrix, keyW, queryW, valueW, linearW} = model.params
  var hyper = model.hyper

  var keyHeads = keyW
    .reshape([hyper.model_size, hyper.num_heads, hyper.key_size])
    .split(model.hyper.num_heads, 1)
    .map(d => d.squeeze([1]))

  var queryHeads = queryW
    .reshape([hyper.model_size, hyper.num_heads, hyper.key_size])
    .split(model.hyper.num_heads, 1)
    .map(d => d.squeeze([1]))

  // First dim is query
  var kqCircuits = d3.range(hyper.num_heads)
    .map(i => embeddingMatrix
      .matMul(queryHeads[i])
      .matMul(keyHeads[i].transpose())
      .matMul(embeddingMatrix.transpose())
    )

  var headSel = sel.html('')
    .appendMany('div.graphic', kqCircuits)
    .st({display: 'inline-block'})
    .each(drawCircuit)

  function drawCircuit(kqCircuit, headIndex){
    var rv = kqCircuit.rv = {}

    var s = 2
    var pad = s*2.5

    var sel = d3.select(this)
    var c = d3.conventions({
      sel: d3.select(this).append('div'),
      height: 99*s,
      width: 99*s,
      margin: {left: 20, bottom: 80, right: 60},
      layers: 'cs',
    })

    var rawAttnSel = sel.append('div')
      .append('div').st({fontSize: 11, marginLeft: 3}).html('Raw Attention')
      .parent()
      .appendMany('div.token-inline', d3.range(model.hyper.sequence_length))
      .st({width: 30})

    var normalizedAttnSel = sel.append('div')
      .st({whiteSpace: 'nowrap', width: c.totalWidth - 14})
      .append('div').st({fontSize: 11, marginLeft: 3, marginTop: 10}).html('Normalized Attention')
      .parent()
      .appendMany('div.token-inline', d3.range(model.hyper.sequence_length))
      .st({width: 30})

    c.svg.append('text').text('Head ' + headIndex)
      .at({textAnchor: 'middle', x: c.width/2, y: -2})

    c.x.domain([0, 99])
    c.y.domain([99, 0])

    c.svg.append('text').text('Head ' + headIndex)
      .at({textAnchor: 'middle', x: c.width/2, y: -2})

    var lTick = 100 + pad*1.5
    var rTick = lTick + pad
    c.xAxis
      .tickValues([0, 20, 40, 60, 80, lTick, rTick])
      .tickFormat(d => d < 100 ? d : d == lTick ? 'L' : 'R')
    c.yAxis
      .tickValues([0, 20, 40, 60, 80, lTick, rTick])
      .tickFormat(d => d < 100 ? d : d == lTick ? 'L' : 'R')

    d3.drawAxis(c)
    c.svg.select('.x').translate(c.height + 35, 1)
    util.addAxisLabel(c, 'Key Token', 'Query Token', 28)

    if (headIndex) c.svg.select('.y .axis-label').remove()

    var ctx = c.layers[0]
    function renderModel(){
      rv.grid = kqCircuit.arraySync()
      rv.grid.forEach((row, i) => {
        row.forEach((v, j) => {
          if (i > 101 || j > 101) return // skip pad token

          var dj = j
          var height = s
          if (j == 100) dj += pad
          if (j == 101) dj += pad*2
          if (j >= 100) height = pad*2 - 1

          var di = i
          var width = s
          if (i == 100) di += pad
          if (i == 101) di += pad*2
          if (i >= 100) width = pad*2 - 1

          ctx.beginPath()
          ctx.fillStyle = model.hyper.has_softmax ? color.seqScale(v) : color.divScaleLR(v)
          ctx.rect(dj*s, di*s, height, width)
          ctx.fill()
        })
      })
    }
    window.renderAll.colorFns.push(renderModel)

    function renderInput(){
      rv.inputs = modelInput.curInput.map((v, i) => {
        var rawAttn = rv.grid[modelInput.xPositions.at(-1).v][v]

        var label = v == 100 ? 'L' : v == 101 ? 'R' : v
        return {v, i, rawAttn, label}
      })

      util.softmax(rv.inputs.map(d => d.rawAttn)).forEach((softmax, i) => {
        rv.inputs[i].softmax = softmax
      })

      rawAttnSel.data(rv.inputs)
        .html(d => `<span>${d.label}</span><br>${d3.format('+.2f')(d.rawAttn)}`)
      normalizedAttnSel.data(rv.inputs)
        .html(d => `<span>${d.label}</span><br>${d3.format('.3f')(d.softmax).replace('0.', '.')}`)
        .st({marginLeft: 0, marginRight: 1, width: d => d.softmax*92 + '%'})
        .st({overflow: 'hidden',})
    }
    window.renderAll.inputFns.push(renderInput)

    var yPosFn = () => c.y(modelInput.xPositions.at(-1).v)
    util.addInputCircles(c, yPosFn, true, lTick, rTick)


    kqCircuit.rv = rv
  }

  return kqCircuits
}


window.init?.()
