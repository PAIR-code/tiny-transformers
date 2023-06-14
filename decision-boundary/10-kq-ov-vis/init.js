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

window.visState = {
  colorS: 5,
  sweepSlug: 'sweep_6400k_regularization_models',
  modelSlug: '2023-02-24-16h21m46s',
  
  // sweepSlug: 'batch_64models',
  // modelSlug: '2023-03-29-04h24m59s',

  // modelSlug: '2023-03-28-19h54m06ss',
  // modelSlug: '2023-03-28-17h41m01s' // 7 seq, 1L, 1H
}

var sliderScale = d3.scalePow().range([.01, 16]).exponent(2)
var sel = d3.select('.slider').html(`
  <span>Color min <val></val></span>
  <span>Color max <val></val></span>
  <input type=range min=0 max=1 step=.0001 value=${sliderScale.invert(visState.colorS)}></input>
`)
sel.select('input[type="range"]')
  .on('input', function () {
    visState.colorS = sliderScale(this.value)
    // updateColorVal()
    renderAll()
  })
window.color = d => d3.interpolateRdBu((-d + visState.colorS) / visState.colorS / 2)
window.renderAll = () => {
  sel.selectAll('val')
    .data([-visState.colorS, visState.colorS])
    .text((d, i) => d3.format('.2f')(d))
    .st({background: color, padding: 5, color: '#fff'})

  renderAll.fns.forEach(d => d.render())
}


async function initModelList(){
  var sweep_slug = 'sweep_loss_only_last_v_all_'
  var hyper_sweep = {
    "seed": [1, 2, 3, 4, 5, 6, 7, 8],
    "loss_only_last": [true, false],
    "vocab_embedding": ["trained_untied", "trained"],
  }

  var models = await util.getFile(`../05-sweep-vis/data__${sweep_slug}models.json`)

  var byCat = d3.nestBy(models, d => [
    (d.hyper.loss_only_last ? 'loss_only_last' : 'loss_all'),
    d.hyper.vocab_embedding
  ].join(' - '))
  byCat.reverse()
  var modelButtonSel = d3.select('.model-list').html('')
    .appendMany('div', byCat)
    .append('b').text(d => d.key)
    .parent()
    .append('div').appendMany('span.model-button', d => d).text(d => d.hyper.seed)
    .on('click', d => {
      modelButtonSel.classed('active', e => d == e)

      visState.sweepSlug = sweep_slug + 'models'
      visState.modelSlug = d.slug
      init()
    })

}
initModelList()


window.init = async function(){
  // console.clear()
  renderAll.fns = []

  const model = await window.initModel()
  const predictionChart = window.initPredictionChart(model)
  modelInput = window.initModelInput(model.hyper, _.throttle(predictionChart.render, 10))

  window.initKqCircuit(model)
  window.initOvCircuit(model)

  window.renderAll()
}
window.init()



