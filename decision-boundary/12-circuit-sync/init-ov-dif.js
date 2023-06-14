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

window.initOvDif = function(model){
  const n_num_tokens = model.hyper.n_num_tokens

  const {embeddingMatrix, unembeddingMatrix, keyW, queryW, valueW, linearW} = model.params
  const hyper = model.hyper

  const valueHeads = valueW
    .reshape([hyper.model_size, hyper.num_heads, hyper.key_size])
    .split(model.hyper.num_heads, 1)
    .map(d => d.squeeze([1]))

  const linearHeads = linearW.split(model.hyper.num_heads, 0)

  // First dim is value
  const ovCircuits = d3.range(hyper.num_heads)
    .map(i => embeddingMatrix
      .matMul(valueHeads[i])
      .matMul(linearHeads[i])
      .matMul(unembeddingMatrix.transpose())
    )

  ovCircuits.forEach(ovCircuit => {
    var grid = ovCircuit.slice([0, 100], [103, 2]).arraySync()
    ovCircuit.maxV = d3.max(grid.flat().map(d => Math.abs(d)))
  })

  var headSel = d3.select('.ov-dif').html('')
    .appendMany('div', ovCircuits)
    .st({display: 'inline-block'})
    .each(drawCircuit)

  function drawCircuit(ovCircuit, headIndex){

    var s = 2
    var pad = s*2.5
    var grid = ovCircuit.arraySync()

    var dataLR = d3.cross([0, 1], d3.range(102)).map(([a, b]) => {
      var isLeftOutput = !a
      var key = b

      return {isLeftOutput, key, v: 0}
    })
    dataLR.forEach(d => {
      d.v = grid[d.key][d.isLeftOutput ? 100 : 101]
    })
    var maxV = d3.max(ovCircuits, d => d.maxV)

    const c = d3.conventions({
      sel: d3.select(this).html('').append('div'),
      height: 99*s,
      width: 99*s,
      margin: {left: 20, bottom: pad*10, right: pad*10},
      layers: 's',
    })


    c.y.domain([-maxV, maxV]).nice()
    c.x.domain([0, 99])

    c.svg.append('text').text('Head ' + headIndex)
      .at({textAnchor: 'middle', x: c.width/2, y: -2})

    var lTick = 100 + pad*1.5
    var rTick = 100 + pad*2.5
    c.xAxis
      .tickValues([0, 20, 40, 60, 80, lTick, 100 + pad*2.5])
      .tickFormat(d => d < 100 ? d : d == lTick ? 'L' : 'R')
    c.yAxis.ticks(5)

    d3.drawAxis(c)
    c.svg.selectAll('.y text')
      .text(d => d ? '+' + Math.abs(d) + ' ' + (d < 0 ? 'L' : 'R') : 0)
      .st({fill: d => d == 0 ? '' : color.lr[d < 0]})

    util.ggPlot(c, false)
    util.addAxisLabel(c, 'Key Token', 'Diff in L/R Direction', 28)

    if (headIndex) c.svg.select('.y .axis-label').remove()

    var byKey = d3.nestBy(dataLR, d => d.key)

    function xPos(i){
      var x = c.x(i)
      if (i == 100) x += pad*2
      if (i == 101) x += pad*5
      return x
    }


    var lineSel = c.svg.appendMany('path', byKey)
      .at({strokeWidth: 1})
      .translate(d => xPos(d.key), 0)

    var circleSel = c.svg.appendMany('circle', byKey)
      .translate(d => xPos(d.key), 0)
      .at({r: d => d.key > 99 ? 4 : 2})
      .call(d3.attachTooltip)

    function render(){
      circleSel.at({
        cy: d => c.y(d[1].v - d[0].v),
        fill: d => color.lr[d[0].v > d[1].v],
      })

      lineSel.at({
        d: d => `M 0 ${c.y(0)} V ${c.y(d[1].v - d[0].v)}`,
        stroke: d => color.lr[d[0].v > d[1].v],
      })
    }
    window.renderAll.colorFns.push(render)

    var yPosFn = () => c.height
    util.addInputCircles(c, yPosFn, false, lTick, rTick)
  }

}


window.init?.()
