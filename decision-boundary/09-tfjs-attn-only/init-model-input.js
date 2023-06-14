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

function initModelInput(hyper, onChange){
  const rv = {
    boundary: window.modelInput?.boundary || {v: 30},
    xPositions: window.modelInput?.xPositions || d3.range((hyper.sequence_length + 1)/2)
      .map(i => ({i: i*2, v: Math.round(Math.random()*hyper.n_num_tokens)})),
    onChange: onChange || (d => d),
  }
  _.last(rv.xPositions).isLast = true

  rv.calcInput = function(){
    let input = rv.xPositions
      .map(d => [d.v, d.v < rv.boundary.v ? hyper.n_num_tokens : hyper.n_num_tokens + 1])

    input = _.flatten(input)
    input.pop() // Inputs have final prediction chopped off
    return input
  }

  const c = d3.conventions({
    sel: d3.select('.input').html('').append('div'),
    height: 200,
    width: 200,
    margin: {left: 50, bottom: 30}
  })

  c.y.domain([0, hyper.sequence_length - 1])
  c.x.domain([0, hyper.n_num_tokens - 1])

  c.yAxis.ticks(3)
  d3.drawAxis(c)
  util.ggPlot(c, 0)
  util.addAxisLabel(c, '', 'Input Index')

  const xPosSel = c.svg.appendMany('circle.x-draggable', rv.xPositions)
    .at({
      cy: d => c.y(d.i),
      r: 3,
      strokeWidth: 1,
      stroke: '#000'
    })
  xPosSel.filter(d => d.isLast).st({fill: '#f0f'})

  const boundarySel = c.svg.append('path.x-draggable')
    .at({strokeWidth: 4, d: `M 0 0 V ${c.height}`, stroke: '#000', opacity: .3})
    .datum(rv.boundary)

  const drag = d3.drag()
    .on('drag', function(d){

      d.v = Math.round(d3.clamp(0, c.x.invert(d3.mouse(c.svg.node())[0]), hyper.n_num_tokens - 1))
      render()
    })

  const xDraggableSel = c.svg.selectAll('.x-draggable')
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
window.init?.()
