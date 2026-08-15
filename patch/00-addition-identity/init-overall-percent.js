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

window.initOverallPercent = function({state}){
  var c = d3.conventions({
    sel: d3.select('.overall-percent').html(''),
    height: 100,
    width: 300,
    margin: {bottom: 30},
  })

  c.svg.append('text.chart-title')
    .text('How often does the destination patching argmax match the source argmax? ')
    .text('Overall argmax matching frequency')

  c.x.domain([0, 26])
  c.yAxis.tickFormat(d3.format('.0%')).tickValues([0, .25, .5, .75, 1])
  d3.drawAxis(c)
  util.ggPlot(c)
  util.addAxisLabel(c, 'Layer', 'Percent Rank 0')

  var lineSel = c.svg.append('path')
    .at({stroke: '#000', strokeWidth: 2, fill: 'none'})

  var line = d3.line()
    .x(d => c.x(d.layer))
    .y(d => c.y(d.rank0Percent))

  state.render.filter.fns.push(() => {
    lineSel.at({d: line(state.data.byLayer)})
  })
}

window.init?.()
