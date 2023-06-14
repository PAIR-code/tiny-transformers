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

window.initCheckpointVis = async function(model){
  var sx = 5
  var sy = 8

  var rv = {render}
  window.renderAll.fns.push(rv)

  var sweep_slug = model.sweepModels.sweep_slug
  var {data, shape} = await util.getFile(`${sharedUtil.getRoot()}/decision_boundary/${sweep_slug}models/${model.slug.name}/token_embedding_matrix.npy`)

  var c = d3.conventions({
    sel: d3.select(this),
    width:  shape[1]*sx,
    height: shape[2]*sy,
    layers: 'cs',
  })

  var ctx = c.layers[0]

  var scrubX = d3.scaleLinear().domain([0, shape[0] - 1]).clamp(1).range([0, c.width])


  c.x.range([0, sx*99]).domain([0, 99])
  d3.drawAxis(c)
  c.svg.select('.y').remove()
  c.svg.select('.x').translate([Math.floor(sx/2), c.height])

  c.svg.append('rect')
    .at({width: c.width, height: c.height, fillOpacity: 0})
    .on('mousemove', function(){
      visState.stepIndex = Math.round(scrubX.invert(d3.mouse(this)[0]))
      renderAll()
    })

  var typeLabelSel = c.svg.append('text')
    .at({y: -5, fontSize: 12})
    .text(model.vocab_embedding)
    .st({fill: modelColor(model.vocab_embedding)})

  var stepLabelSel = c.svg.append('text')
    .at({textAnchor: 'end', x: c.width - 15, y: -5, fontSize: 12})

  render()

  function render(){
    if (!model.isActive) return

    stepLabelSel.text('Step ' + d3.format('06,')(visState.stepIndex*1000))

    var offset = shape[1]*shape[2]*visState.stepIndex
    for (var i = 0; i < shape[1] - 1; i++){
      for (var j = 0; j < shape[2]; j++){
        var index = offset + shape[2]*i + j

        ctx.beginPath()
        ctx.fillStyle = color(data[index])
        ctx.rect((i > 99 ? i + 2: i)*sx, j*sy, sx, sy)
        ctx.fill()
      }
    }
  }
}


if (window.init) window.init()