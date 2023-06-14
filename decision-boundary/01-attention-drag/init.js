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
  <h3>Model input</h3>
  <div class='input'></div>

  <h3>Attention Weights Grid</h3>
  <div class='attn-weights-grid'></div>
`)


window.init = async function(){

  window.attentionGrid = await initAttentionGrid()
  var modelInput = await initModelInput(_.throttle(attentionGrid.render, 500))
  // window.modelInput = await initModelInput(attentionGrid.render)
}
init()


async function initAttentionGrid(){
  var {num_layers, num_heads, sequence_length} = await util.getFile('hyper.json')


  var s = 4
  var grids = d3.cross(d3.range(num_layers), d3.range(num_heads))
    .map(([layerIndex, headIndex]) => ({layerIndex, headIndex}))

  var gridSel = d3.select('.attn-weights-grid').html('')
    .appendMany('div.attention-layer', d3.nestBy(grids, d => d.headIndex))
    .appendMany('div.attention-head', d => d).st({display: 'inline-block'})

  gridSel.each(function(grid){
    var c = d3.conventions({
      sel: d3.select(this),
      width:  s*(sequence_length),
      height: s*(sequence_length),
      margin: {left: 5, right: 5, bottom: 0, top: 15}
    })
    c.svg.append('rect').at({width: c.width, height: c.height, fill: '#e3e3e3'})

    c.svg.append('g.axis').at({fontSize: 12}).append('text')
      .text('L' + grid.layerIndex).at({y: -3})
      .parent().append('text')
      .text('H' + grid.headIndex).at({y: -3, x: c.width - s, textAnchor: 'end'})
  
    var tokenCross = d3.cross(d3.range(sequence_length), d3.range(sequence_length))
      .filter(([tokenI, tokenJ]) => tokenI <= tokenJ)
    var {headIndex, layerIndex} = grid
    tokenCross.forEach(d => {
      var [tokenI, tokenJ] = d
      d.i = tokenI + sequence_length*(tokenJ + sequence_length*(layerIndex + num_layers*headIndex))
      d.v = 0
    })
    var rectSel = c.svg.appendMany('rect', tokenCross)
      .translate(d => d.map(e => e*s))
      .at({width: s - .2, height: s - .2})
      .call(d3.attachTooltip)
    
    grid.render = function(attn_weights){
      tokenCross.forEach(d => d.v = attn_weights.data[d.i])

      // d3.nestBy(tokenCross, d => d[1]).forEach(row => {
      //   var rowMaxV = d3.max(row, d => d.v)
      //   row.forEach(d => d.v = d.v/rowMaxV)
      // })
      // tokenCross.forEach(d => d.v = attn_weights.data[d.i]/(sequence_length - d[1]))

      rectSel.at({fill: d => d3.interpolateTurbo(d.v*3)})
    }
  })


  async function render(input){
    // var attn_weights = await util.getFile('attn_logits.npy', [input])
    var attn_weights = await util.getFile('attn_weights.npy', [input])
    grids.forEach(d => d.render(attn_weights))
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