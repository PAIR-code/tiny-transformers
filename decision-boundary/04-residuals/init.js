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
d3.select('body').selectAppend('div.tooltip.tooltip-hidden')


var visState = window.visState = window.visState || {
  colorS: .5,
}
var sliderScale = d3.scalePow().range([.01, 8]).exponent(2)


var sel = d3.select('.chart').html(`
  <h3>Model input</h3>
  <div class='input'></div>

  <h3>Residuals</h3>
  <div class='residuals'></div>

  <h3>Slider Scale</h3>
  <span>Color max <val></val></span>
  <input type=range min=0 max=1 step=.0001 value=${sliderScale.invert(visState.colorS)}></input>
`)


var updateColorVal = () => sel.select('val').text(d3.format('.2f')(visState.colorS))
updateColorVal()

var slideSel = sel.select('input[type="range"]')
  .on('input', function () {
    visState.colorS = sliderScale(this.value)
    updateColorVal()
    window.predictionChart.render()
  })


var color = d => d3.interpolatePuOr((-d + visState.colorS) / visState.colorS / 2)
var color = d => d3.interpolateTurbo(d/visState.colorS)





window.init = async function(){
  window.predictionChart = await initResidualsChart()

  var modelInput = await initModelInput(_.throttle(predictionChart.render, 300))
}
init()


async function initResidualsChart(){
  var hyper = await util.getFile('hyper.json')
  console.log(hyper)

  var tokens = d3.range(hyper.sequence_length).map(index => ({index}))

  var tokenSel = d3.select('.residuals').html('')
    .appendMany('div.token', tokens)
    .st({display: 'inline-block'})


  var s = 8

  tokenSel.each(function(token){
    var c = d3.conventions({
      sel: d3.select(this),
      width: s*5*hyper.num_layers,
      height: s*hyper.model_size/2,
      margin: {left: 0, bottom: 10, top: 0, right: 10}
    })
    c.svg.st({opacity: token.index % 2 ? .2 : 1})

    var attnTypes = ['h', 'h_post_attn', 'h_post_mlp']
    token.rectData = d3.cross(d3.cross(d3.range(hyper.model_size), d3.range(3)), d3.range(hyper.num_layers)).map(d => {
      var [[neuronIndex, attnIndex], layerIndex] = d
      var attnType = attnTypes[attnIndex]
      var v = 0
      return {neuronIndex, attnIndex, layerIndex, attnType, v: 0}
    }) 

    token.rectSel = c.svg.appendMany('rect', token.rectData)
      .translate(d => [(s + 2)*d.attnIndex + (s + 1)*4*d.layerIndex, s*d.neuronIndex/2])
      .at({width: s - 0, height: s/2 - .2})
      .call(d3.attachTooltip)
  })


  async function render(input){
    input = input || visState.input
    visState.input = input
    var results = await util.getFile('results.json', [input])

    tokens.forEach(token => {
      token.rectData.forEach(d => {
        d.v = results.all_layer_activations[d.layerIndex][d.attnType][0][token.index][d.neuronIndex]
      })
      token.rectSel.at({fill: d => color(d.v)})
    })

    // console.log(results)
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

  rv.calcInput = function(){
    var input = rv.xPositions
      .map(d => [d.v, d.v < rv.boundary.v ? hyper.n_num_tokens : hyper.n_num_tokens + 1])

    input = _.flatten(input)
    input.pop() // Inputs have final prediction chopped off
    return input
  }

  var c = d3.conventions({
    sel: d3.select('.input').html('').append('div'),
    height: 100,
    width: 200,
    margin: {left: 50, bottom: 30}
  })

  c.y.domain([0, hyper.sequence_length])
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
      .at({fill: d => d.v < rv.boundary.v ? 'orange' : 'steelblue'})

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