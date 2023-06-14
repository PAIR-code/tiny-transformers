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

window.initPredictionChart = function(model){
  var {n_num_tokens, sequence_length} = model.hyper

  var posTokens = d3.range(sequence_length)
    .filter(i => i % 2 == 0)
    .map(i => ({i, isTargetToken: i == sequence_length - 1}))
    .reverse()

  var sel = d3.select('.predictions').html('')
    .appendMany('div', posTokens)
    .each(drawPredictionChart)

  function drawPredictionChart(posToken){
    var c = d3.conventions({
      sel: d3.select(this).append('div'),
      height: 80,
      width: 200,
      margin: {left: 50, bottom: 30}
    })

    c.y.domain([0, 1])
    c.x.domain([0, n_num_tokens - 1])

    c.yAxis.tickFormat(d3.format('.0%')).tickValues([0, .25, .5, .75, 1])

    d3.drawAxis(c)
    util.ggPlot(c, 0)
    util.addAxisLabel(c, 'Token ' + posToken.i/2 + ' Position', 'Final Token — % Left', 30, -30)

    c.svg
      .classed('is-target-token', posToken.isTargetToken)


    var circleSel = c.svg.appendMany('circle', d3.range(n_num_tokens))
      .at({
        r: 3, 
        cx: c.x,
        stroke: '#999',
        fillOpacity: 0,
      })

    var posTokenSel = c.svg.appendMany('path', posTokens)
      .at({
        stroke: d => d.isTargetToken ? '#0ff' : '#000',
        d: 'M 0 0 V ' + c.height,
        strokeWidth: d => d.i == posToken.i ? 1 : 1,
      })

    async function render(){
      var input = modelInput.curInput
      var lastPos = _.last(input)
      var batch = d3.range(100).map(i => {
        var rv = input.slice()
        rv[posToken.i] = i
        return rv
      })

      var leftPredictions = model.tidy(batch)
        .slice([0, 6, 100], [100, 1, 1])
        .dataSync()

      circleSel
        .at({cy: i => c.y(leftPredictions[i])})
        .classed('is-last', i => i == input[posToken.i])

      posTokenSel.translate(d => c.x(input[d.i]), 0)
    }

    window.renderAll.inputFns.push(_.throttle(render, 10))
  }

}


window.init?.()
