/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

window.initEmbedVis = async function(type){
  var sx = 10
  var sy = 10

  var data = visState.model[type].flat()
  var shape = [visState.model[type].length, visState.model[type][0].length]

  var c = d3.conventions({
    sel: d3.select('.' + type).html(''),
    width:  shape[0]*sx,
    height: shape[1]*sy,
    layers: 'cs',
  })

  var ctx = c.layers[0]
  c.x.range([0, sx*shape[0]]).domain([0, shape[0]])
  c.y.range([0, sy*shape[1]]).domain([0, shape[1]])

  c.yAxis.ticks(2)
  c.xAxis.ticks(2)
  // d3.drawAxis(c)
  // c.svg.select('.x').translate([Math.floor(sx/2), c.height])
  // c.svg.select('.y').translate(Math.floor(sy/2), 1)

  var typeLabelSel = c.svg.append('text')
    .at({y: -5, fontSize: 12})
    .text(type)

  var color = d => d3.interpolateRdBu((-d + 1.5) / 1.5 / 2)

  renderAll.modelFns.push(render)

  function render(){
    var offset = 0
    for (var i = 0; i < shape[0]; i++){
      for (var j = 0; j < shape[1]; j++){
        var index = offset + shape[1]*i + j

        ctx.beginPath()
        ctx.fillStyle = color(data[index])
        ctx.rect(i*sx, j*sy, sx, sy)
        ctx.fill()
      }
    }
  }
  render()
}


if (window.init) window.init()