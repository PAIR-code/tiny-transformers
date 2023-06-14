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
  const n_num_tokens = model.hyper.n_num_tokens

  const c = d3.conventions({
    sel: d3.select('.predictions').html('').append('div'),
    height: 200,
    width: 200,
    margin: {left: 50, bottom: 30}
  })

  c.y.domain([0, 1])
  c.x.domain([0, n_num_tokens - 1])

  c.yAxis.tickFormat(d3.format('.0%')).tickValues([0, .25, .5, .75, 1])

  d3.drawAxis(c)
  util.ggPlot(c, 0)
  util.addAxisLabel(c, '', 'Left Token Prediction', 0, -30)

  const circleSel = c.svg.appendMany('circle', d3.range(n_num_tokens))
    .at({
      r: 2, 
      cx: c.x,
      stroke: '#000',
      fillOpacity: 0,
    })

  async function render(input){
    const lastPos = _.last(input)
    const inputCopy = []
    const batch = d3.range(100).map(i => {
      const rv = input.slice()
      rv[model.hyper.sequence_length - 1] = i
      return rv
    })

    const leftPredictions = model.tidy(batch)
      .slice([0, 6, 100], [100, 1, 1])
      .dataSync()

    circleSel
      .at({cy: i => c.y(leftPredictions[i])})
      .classed('is-last', i => i == lastPos)
  }

  return {render}
}


window.init?.()
