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
  outputTokenIndex: 6 ,
  stepIndex: 0,
}
var sliderScale = d3.scalePow().range([.01, 16]).exponent(2)


var sel = d3.select('.chart').html(`
  <h3>Vocab Embedding</h3>
  <div class='sweep_init_token_embed_v2_'></div>


  <h1>Only last token loss v. all numeric token loss</h1>
  <div class='sweep_loss_only_last_v_all_'></div>



  <h1>Only last token loss + weight decay + dropout</h1>
  <div class='sweep_loss_only_last_v3_'></div>



  <div class='checkpoints'></div>

  <h3>Slider Scale</h3>
  <span>Color max <val></val></span>
  <input type=range min=0 max=1 step=.0001 value=${sliderScale.invert(visState.colorS)}></input>
`)

sel.select('input[type="range"]')
  .on('input', function () {
    visState.colorS = sliderScale(this.value)
    updateColorVal()
    renderAll()
  })

window.color = d => d3.interpolateRdBu((-d + visState.colorS) / visState.colorS / 2)
// var color = d => d3.interpolatePuOr((-d + visState.colorS) / visState.colorS / 2)
// var color = d => d3.interpolateTurbo(d/visState.colorS)

window.modelColor = d3.scaleOrdinal(d3.schemeCategory10)
modelColor('')

window.renderAll = () => {
  sel.select('val').text(d3.format('.2f')(visState.colorS))

  renderAll.fns.forEach(d => d.render())
}


window.updateActiveModels = model => {
  d3.selectAll('circle.model').each(d => d.isActive = false)

  model.hoverGroup.forEach(d => d.isActive = true)

  d3.selectAll('circle.model')
    .classed('is-active', d => d.isActive)
    .at({r: d => d.isActive ? 5 : 3})

  window.renderAll.fns = []
  d3.select('.checkpoints').html('')
    .appendMany('div', model.hoverGroup)
    .each(initCheckpointVis)
    .st({display: 'inline-block'})
}



window.init = async function(){
  window.initSweepInitTokenEmbed()
  window.init_sweep_loss_only_last_v3_()
  window.init_sweep_loss_only_last_v_all_()

}

init()


