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

window.initKqovCircuit = function(model, sel){
  var n_num_tokens = model.hyper.n_num_tokens

  var {embeddingMatrix, unembeddingMatrix, keyW, queryW, valueW, linearW} = model.params
  var hyper = model.hyper

  var keyHeads = keyW
    .reshape([hyper.model_size, hyper.num_heads, hyper.key_size])
    .split(model.hyper.num_heads, 1)
    .map(d => d.squeeze([1]))

  var queryHeads = queryW
    .reshape([hyper.model_size, hyper.num_heads, hyper.key_size])
    .split(model.hyper.num_heads, 1)
    .map(d => d.squeeze([1]))

  var valueHeads = valueW
    .reshape([hyper.model_size, hyper.num_heads, hyper.key_size])
    .split(model.hyper.num_heads, 1)
    .map(d => d.squeeze([1]))

  var linearHeads = linearW.split(model.hyper.num_heads, 0)

  // First dim is query
  var circuits = d3.range(hyper.num_heads).map(i => {
    var kq = embeddingMatrix
      .matMul(queryHeads[i])
      .matMul(keyHeads[i].transpose())
      .div(Math.sqrt(hyper.key_size))
      .matMul(embeddingMatrix.transpose())

    var ov = embeddingMatrix
      .matMul(valueHeads[i])
      .matMul(linearHeads[i])
      .matMul(unembeddingMatrix.transpose())

    var lVals = ov.slice([0, 100], [-1, 1])
    var rVals = ov.slice([0, 101], [-1, 1])
    var difVals = rVals.sub(lVals).transpose()

    var circuit = kq.mul(difVals)

    return circuit
  })


  var headSel = sel.html('')
    .appendMany('div.graphic', circuits)
    .st({display: 'inline-block'})
    .each(drawCircuit)

  function drawCircuit(circuit, headIndex){
    var rv = circuit.rv = {}


    var grid = circuit.arraySync()
    var dataLR = d3.cross([0, 1], d3.range(102)).map(([a, b]) => {
      var isLeftOutput = !a
      var key = b

      return {isLeftOutput, key, v: 0}
    })
    dataLR.forEach(d => {
      d.v = grid[d.key][d.isLeftOutput ? 100 : 101]
    })
    var byKey = d3.nestBy(dataLR, d => d.key)


    var s = 2
    var pad = s*2.5

    var sel = d3.select(this)
    var c = d3.conventions({
      sel: d3.select(this).append('div'),
      height: 99*s,
      width: 99*s,
      margin: {left: 20, bottom: 60, right: 60},
      layers: 'cs',
    })

    var rawAttnSel = sel.append('div')
      .append('div').st({fontSize: 11, marginLeft: 3}).html('Tokens')
      .parent()
      .appendMany('div.token-inline', d3.range(model.hyper.sequence_length))
      .st({width: 30})

    var sumSel = sel.append('div')
      .append('div').st({fontSize: 11, marginLeft: 3, marginTop: 20})

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
      .tickValues([0, 20, 40, 60, 80])

    d3.drawAxis(c)
    c.svg.select('.x').translate(c.height + s, 1)
    util.addAxisLabel(c, 'Key Token', 'Query Token', 28)

    if (headIndex) c.svg.select('.y .axis-label').remove()

    var ctx = c.layers[0]
    function renderModel(){
      rv.grid = circuit.arraySync()
      rv.grid.forEach((row, i) => {
        row.forEach((v, j) => {
          if (i > 101 || j > 101) return // skip pad token
          if (i > 99) return

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
          ctx.fillStyle = color.divScaleLR(v)
          ctx.rect(dj*s, di*s, height, width)
          ctx.fill()
        })
      })
    }
    window.renderAll.colorFns.push(renderModel)

    function renderInput(){
      var softmax = model.tidy([modelInput.curInput]).arraySync()[0][6]
      var actual = [softmax[100], softmax[101]]

      var logits = tf.tidy(() => {
        var allLogits = model._model([modelInput.curInput]).logits.arraySync()[0][6]
        return [allLogits[100], allLogits[101]]
      })
      var sumApprox = logits[1] - logits[0]


      rv.inputs = modelInput.curInput.map((v, i) => {
        var rawAttn = rv.grid[modelInput.xPositions.at(-1).v][v]

        var label = v == 100 ? 'L' : v == 101 ? 'R' : v
        return {v, i, rawAttn, label}
      })

      rawAttnSel.data(rv.inputs)
        .html(d => `<span>${d.label}</span><br>${d3.format('+.2f')(d.rawAttn)}`)
   
      var fmt = d3.format('.2f')
      var sum = d3.sum(rv.inputs, d => d.rawAttn)//2/Math.sqrt(2)
      sumSel.html(`
        <div>Sum: ${fmt(sum)}</div>
        <div>Softmax: ${util.softmax([0, sum]).map(fmt).join(', ')}</div>

        <div style='display: none'>
          <br>
          <div><b>Actual</b></div>
          <div>Logits: ${logits.map(fmt).join(', ')}</div>
          <div>sumApprox: ${fmt(sumApprox)}</div>
          <div>Softmax sumApprox: ${util.softmax([0, sumApprox]).map(fmt).join(', ')}</div>
          <div>Softmax: ${actual.map(fmt).join(', ')}</div>

          <br>
          <div><b>Sum diffs</b></div>
          <div>Ratio: ${sum/sumApprox}</div>
          <div>Diff: ${sum - sumApprox}</div>
        </div>
      `)

    }
    window.renderAll.inputFns.push(renderInput)

    var yPosFn = () => c.y(modelInput.xPositions.at(-1).v)
    util.addInputCircles(c, yPosFn, true, lTick, rTick)


    circuit.rv = rv
  }

  return circuits
}


window.init?.()
