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
  outputTokenIndex: 6 
}
var sliderScale = d3.scalePow().range([.01, 16]).exponent(2)

var sel = d3.select('.chart').html(`
  <h3>Model input</h3>
  <div class='input'></div>

  <h3>Internal State</h3>
  <div class='internal'></div>


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
    renderAll()
  })


var color = d => d3.interpolatePuOr((-d + visState.colorS) / visState.colorS / 2)
// var color = d => d3.interpolateTurbo(d/visState.colorS)

async function renderAll(input){
  input = input || visState.input
  visState.input = input

  var results = await util.getFile('results.json', [input])
  // console.log(results.all_layer_activations[0])

  window.internalChart.render(results)
}

window.init = async function(){
  window.internalChart = await initInternalChart()

  var modelInput = await initModelInput(_.throttle(renderAll, 300))
}
init()




async function initInternalChart(){
  var hyper = await util.getFile('hyper.json')

  var s = 8
  var zPad = 2
  var zHeight = hyper.key_size*s

  
  var charts = [
    {key: 'h',            dim: 'TD_', x: 0, y: 1, z: 2, name: 'input'},
    {key: 'key_heads',    dim: 'THK', x: 0, y: 2, z: 1, name: 'key'},
    {key: 'query_heads',  dim: 'THK', x: 0, y: 2, z: 1, name: 'query'},
    {key: 'attn_weights', dim: 'HTT', x: 1, y: 2, z: 0, name: 'attn_weights'},
    {key: 'attn_logits',  dim: 'HTT', x: 1, y: 2, z: 0, name: 'attn_logits'},
    {key: 'value_heads',  dim: 'THK', x: 0, y: 2, z: 1, name: 'value'},
    {key: 'attn_wv',      dim: 'TD_', x: 0, y: 1, z: 2, name: 'attn_wv'},
    {key: 'h_post_attn',  dim: 'TD_', x: 0, y: 1, z: 2, name: 'h_post_attn'},
    {key: 'h_post_mlp',   dim: 'TD_', x: 0, y: 1, z: 2, name: 'h_post_mlp'},
  ]

  var chartSel = d3.select('.internal').html('')
    .appendMany('div', charts)
    .st({display: 'inline-block'})

  chartSel.each(function(chart){
    var dimSize = {
      'T': hyper.sequence_length, 
      'D': hyper.model_size, 
      'H': hyper.num_heads,
      'K': hyper.key_size,
      '_': 1,
    }

    var nx = dimSize[chart.dim[chart.x]] 
    var ny = dimSize[chart.dim[chart.y]] 
    var nz = dimSize[chart.dim[chart.z]] 

    var c = d3.conventions({
      sel: d3.select(this),
      width: s*nx,
      height: (s*ny + s*zPad)*nz,
      margin: {left: 0, bottom: 10, top: 30, right: 30}
    })
    c.svg.st({opacity: chart.index % 2 ? .2 : 1})
    c.svg.append('text').text(chart.name || chart.key).at({dy: -5, x: c.width/2, textAnchor: 'middle'})

    var permute = d3.range(3).map(d => [chart.x, chart.y, chart.z].indexOf(d))
    chart.rectData = d3.cross(d3.range(nx), d3.cross(d3.range(ny), d3.range(nz))).map(d => {
      var [xi, [yi, zi]] = d
      var ijk = d3.permute([xi, yi, zi], permute)
      return {xi, yi, zi, ijk, v: 0}
    }) 


    chart.rectSel = c.svg.appendMany('rect', chart.rectData)
      .translate(d => [s*d.xi, s*d.yi + (s*zPad + zHeight)*d.zi])
      .at({width: s - .1, height: s - .1})
      .call(d3.attachTooltip)

    chart.render = results => {
      // assumptions: batch size of one, only a single layer
      var arr = results.all_layer_activations[0][chart.key][0]

      if (chart.dim.includes('_')){
        chart.rectData.forEach(d => d.v = arr[d.ijk[0]][d.ijk[1]])
      } else {
        chart.rectData.forEach(d => d.v = arr[d.ijk[0]][d.ijk[1]][d.ijk[2]])
      }

      if (!['h', 'query_heads', 'value_heads'].includes(chart.key)){
        chart.rectData.forEach(d => d.xi != visState.outputTokenIndex ? d.v = 0 : 0)
      }
      if (chart.key == 'h_post_mlp'){
        chart.rectData.forEach(d => d.yi == 0 || d.yi > 2 ? d.v = 0 : 0)
      }

      chart.rectSel.at({fill: d => d.v == 0 ? '#f9f9f9' : color(d.v)})
    }
  })


  async function render(results){
    charts.forEach(chart => {
      chart.render(results)
    })
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
  c.yAxis.ticks(5)
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
    .on('click', d => {
      if (d3.event.shiftKey){
        visState.outputTokenIndex = d.i
        console.log(visState)
        renderAll()
      }
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