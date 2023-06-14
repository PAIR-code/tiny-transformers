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

window.initModelVis = function(model){


  var s = 2
  var pad = s*2.5

  var maxV = 5

  var c = d3.conventions({
    sel: d3.select('.model-vis').html('').append('div'),
    height: 99*s,
    width: 99*s,
    margin: {left: 50, bottom: pad*10, right: pad*10, top: 80},
    layers: 's',
  })

  c.y.domain([-maxV, maxV]).nice()
  c.x.domain([0, 99])

  var lTick = 100 + pad*1.5
  var rTick = 100 + pad*2.5
  c.xAxis
    .tickValues([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, lTick, 100 + pad*2.5])
    .tickFormat(d => d < 100 ? d : d == lTick ? 'L' : 'R')
  c.yAxis.ticks(5)

  d3.drawAxis(c)
  c.svg.selectAll('.y text')
    .text(d => d ? '+' + Math.abs(d) + ' ' + (d < 0 ? 'L' : 'R') : 0)
    .st({fill: d => d == 0 ? '' : color.lr[d < 0]})

  util.ggPlot(c, false)
  util.addAxisLabel(c, 'Key Token', 'Diff in L/R Direction', 28)

  c.svg.append('text').text('Query Token: ' + nextPosition)
    .at({dy: -5, textAnchor: 'middle', x: c.width/2, fontFamily: 'sans-serif'})

  var byKey = d3.range(102).map(key => ({key, dif: Math.random()*10}))

  function xPos(i){
    var x = c.x(i)
    if (i == 100) x += pad*2
    if (i == 101) x += pad*5
    return x
  }

  var lineSel = c.svg.appendMany('path.kqov-dif-path', byKey)
    .at({strokeWidth: 1})
    .translate(d => xPos(d.key), 0)

  var circleSel = c.svg.appendMany('circle', byKey)
    .translate(d => xPos(d.key), 0)
    .at({r: d => d.key > 99 ? 2 : 1})
    .call(d3.attachTooltip)

  function render(){
    var w1 = modelWeights.w1.arraySync()
    var curQuery = _.last(modelInput.curInput)
    byKey.forEach(d => d.dif = w1[d.key])
    window.querySlice = byKey.map(d => d.dif)

    circleSel.at({
      cy: d => c.y(d.dif),
      fill: d => color.lr[d.dif < 0],
    })

    lineSel.at({
      d: d => `M 0 ${c.y(0)} V ${c.y(d.dif)}`,
      stroke: d => color.lr[d.dif < 0],
    })
    .classed('active', d => modelInput.curInput.includes(d.key))
  }
  window.renderAll.inputFns.push(render)

  var yPosFn = () => c.height
  util.addInputCircles(c, yPosFn, false, lTick, rTick)
}


window.init?.()
