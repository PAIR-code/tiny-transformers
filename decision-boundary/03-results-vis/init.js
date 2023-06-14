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

console.clear()


d3.select('.chart').html(`
  <div class='section'>
    <h3>Model input</h3>
    <div class='input'></div>
  </div>

  <div class='section'>
    <h3>Predictions</h3>
    <div class='predictions'></div>
  </div>
`)


window.init = async function(){
  window.predictionChart = await initPredictionChart()

  var modelInput = await initModelInput(_.throttle(predictionChart.render, 100))
  // window.modelInput = await initModelInput(attentionGrid.render)
}
init()


async function initPredictionChart(){
  var hyper = await util.getFile('hyper.json')

  var c = d3.conventions({
    sel: d3.select('.predictions').html('').append('div'),
    height: 200,
    width: 200,
    margin: {left: 50, bottom: 30}
  })

  c.y.domain([0, 1])
  c.x.domain([0, hyper.n_num_tokens - 1])

  c.yAxis.tickFormat(d3.format('.0%'))

  d3.drawAxis(c)
  util.ggPlot(c, 0)
  util.addAxisLabel(c, '', 'Left Token Prediction', 0, -30)


  var circleSel = c.svg.appendMany('circle', d3.range(hyper.n_num_tokens))
    .at({
      r: 2, 
      cx: c.x,
      stroke: '#000',
      fillOpacity: 0,
    })



  async function render(input){
    var lastPos = _.last(input)

    var logits = await util.getFile('results_spread.npy', [input])
    console.log(logits, circleSel.size())
    circleSel
      .at({cy: i => c.y(logits.data[i*2])})
      .classed('is-last', i => i == lastPos)
  }

  return {render}
}




async function initModelInput(onChange){
  var hyper = await util.getFile('hyper.json')

  var rv = {
    boundary: window.modelInput?.boundary || {v: 30},
    xPositions: window.modelInput?.xPositions || d3.range((hyper.sequence_length + 1)/2)
      .map(i => ({i: i*2, v: Math.round(Math.random()*hyper.n_num_tokens)})),
    onChange: onChange || (d => d),
  }
  _.last(rv.xPositions).isLast = true

  rv.calcInput = function(){
    var input = rv.xPositions
      .map(d => [d.v, d.v < rv.boundary.v ? hyper.n_num_tokens : hyper.n_num_tokens + 1])

    input = _.flatten(input)
    input.pop() // Inputs have final prediction chopped off
    return input
  }

  var c = d3.conventions({
    sel: d3.select('.input').html('').append('div'),
    height: 200,
    width: 200,
    margin: {left: 50, bottom: 30}
  })

  c.y.domain([0, hyper.sequence_length - 1])
  c.x.domain([0, hyper.n_num_tokens - 1])

  d3.drawAxis(c)
  util.ggPlot(c, 0)
  util.addAxisLabel(c, '', 'Input Index')

  var xPosSel = c.svg.appendMany('circle.x-draggable', rv.xPositions)
    .at({
      cy: d => c.y(d.i),
      r: 3,
      strokeWidth: 1,
      stroke: '#000'
    })
  xPosSel.filter(d => d.isLast).st({fill: '#f0f'})

  var boundarySel = c.svg.append('path.x-draggable')
    .at({strokeWidth: 4, d: `M 0 0 V ${c.height}`, stroke: '#000', opacity: .3})
    .datum(rv.boundary)

  var drag = d3.drag()
    .on('drag', function(d){

      d.v = Math.round(d3.clamp(0, c.x.invert(d3.mouse(c.svg.node())[0]), hyper.n_num_tokens - 1))
      render()
    })

  var xDraggableSel = c.svg.selectAll('.x-draggable')
    .call(drag).st({cursor: 'pointer'})

  function render(){
    xPosSel
      .at({fill: d => d.v < rv.boundary.v ? 'steelblue' : 'orange'})

    xDraggableSel.translate(d => c.x(d.v), 0)

    rv.onChange(rv.calcInput())
  }

  render()


  return rv
}


// var input = [18, 101, 92, 101, 8, 100, 87, 101, 58, 101, 60, 101, 3, 100, 71, 101, 48, 101, 95]
// var results = await util.getFile('results.json', [input])
// var attn_weights = await util.getFile('attn_weights.npy', [input])


// hyper = {
//   n_num_tokens: 100,
//   batch_size: 16,
//   sequence_length: 19,
//   learning_rate: 0.00001,
//   grad_clip_value: 1,
//   log_every: 100,
//   save_every: 4000,
//   max_steps: 32000,
//   seed: 42,
//   num_layers: 8,
//   num_heads: 4,
//   model_size: 32,
//   key_size: 8,
//   dropout_rate: 0,
//   vocab_size: 103,
//   pad_token: 102
// }