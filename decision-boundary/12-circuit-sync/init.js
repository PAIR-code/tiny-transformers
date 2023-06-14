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
  "colorS": 5,
  "sweepSlug": "sweep_1_layer_v3_models",
  "modelSlug": "2023-04-18-17h35m28s"
}


window.init = async function(){
  console.clear()

  window.renderAll = initRenderAll()
  window.color = initColor()

  window.model = await window.initModel()
  window.modelInput = window.initModelInput(model.hyper)
  window.initPredictionChart(model)

  window.kqCircuits = window.initKqCircuit(model, d3.select('.kq-circuit'))
  window.initKqCircuit(model, d3.select('.kq-circuit-2'))
  
  window.initOvSimple(model)
  window.initOvCircuit(model)
  window.initOvDif(model)

  window.initKqovCircuit(model, d3.select('.kqov-circuit'))
  window.initKqovDif(model)

  renderAll.color()
  renderAll.input()
}
window.init()





async function drawModels(){
  var sel = d3.select('.model-list').html('').st({marginLeft: 0, marginTop: 25})

  // drawQuickSweep()
  // drawSlowSweep()
  // drawHeadSweep()
  drawSlowSweepv3()
  setTimeout(drawHeadSweep, 500)
  setTimeout(drawQuickSweep, 1000)

  function fmtMAE(d){ return d3.format('.3f')(d.metrics.MAE).replace('0.', '.')}

  async function drawQuickSweep(){
    var sweepSlug = 'sweep_1_layer_200k_v2_models'
    var models = (await util.getFile(`../05-sweep-vis/data__${sweepSlug}.json`))
      // .filter(d => d.hyper.has_residual)
    models.forEach(d => d.sweepSlug = sweepSlug)

    var byGroup = d3.nestBy(models, d => [
        'softmax: ' + d.hyper.has_softmax,
        'residual: ' + d.hyper.has_residual,
        d.hyper.vocab_embedding == 'trained_untied' ? 'tied vocab: F' : 'tied vocab: T',
      ].join(' // ').replaceAll('true', 'T').replaceAll('false', 'F'))
    byGroup = _.sortBy(byGroup, d => d.key).reverse()

    var modelButtonSel = sel.append('div').append('h4').text('Softmax/Residual/Tied 200k Sweep').parent()
      .appendMany('div', byGroup)
      .text(d => d.key)
      .append('div').appendMany('div.model-button', d => d.slice(0, 4))
      .html(fmtMAE)
      .on('click', d => {
        visState.sweepSlug = d.sweepSlug
        visState.modelSlug = d.slug

        d3.selectAll('.model-button').classed('active', d => d.slug == visState.modelSlug)
        init()
      })
      .classed('active', d => d.slug == visState.modelSlug)
  }

  async function drawSlowSweepv3(){
    var sweepSlug = 'sweep_1_layer_v3_models'
    var models = (await util.getFile(`../05-sweep-vis/data__${sweepSlug}.json`))
      // .filter(d => d.hyper.has_residual)
    models.forEach(d => d.sweepSlug = sweepSlug)

    var byGroup = d3.nestBy(models, d => [
        'softmax: ' + d.hyper.has_softmax,
        'residual: ' + d.hyper.has_residual,
        d.hyper.vocab_embedding == 'trained_untied' ? 'tied vocab: F' : 'tied vocab: T',
      ]
      .join(' // ').replaceAll('true', 'T').replaceAll('false', 'F'))
    byGroup = _.sortBy(byGroup, d => d.key).reverse()

    var modelButtonSel = sel.append('div').append('h4').text('Softmax/Residual/Tied 1600k Sweep').parent()
      .appendMany('div', byGroup)
      .html(d => d.key)
      .append('div').appendMany('div.model-button', d => d.slice(0, 4))
      .html(fmtMAE)
      .on('click', d => {
        visState.sweepSlug = d.sweepSlug
        visState.modelSlug = d.slug

        d3.selectAll('.model-button').classed('active', d => d.slug == visState.modelSlug)
        init()
      })
      .classed('active', d => d.slug == visState.modelSlug)
  }

  async function drawSlowSweep(){
    var sweepSlug = 'sweep_1_layer_v2models'
    var models = (await util.getFile(`../05-sweep-vis/data__${sweepSlug}.json`))
      .filter(d => d.hyper.has_residual)
    models.forEach(d => d.sweepSlug = sweepSlug)

    var byGroup = d3.nestBy(models, d => [
        // 'residual: ' + d.hyper.has_residual,
        'softmax: ' + d.hyper.has_softmax,
        d.hyper.vocab_embedding == 'trained_untied' ? 'tied vocab: F' : 'tied vocab: T',
      ]
      .join(' // ').replaceAll('true', 'T').replace('false', 'F'))
    byGroup = _.sortBy(byGroup, d => d.key).reverse()

    var modelButtonSel = sel.append('div').append('h4').text('Softmax/Residual/Tied 1600k Sweep').parent()
      .appendMany('div', byGroup)
      .html(d => d.key)
      .append('div').appendMany('div.model-button', d => d.slice(0, 4))
      .html(fmtMAE)
      .on('click', d => {
        visState.sweepSlug = d.sweepSlug
        visState.modelSlug = d.slug

        d3.selectAll('.model-button').classed('active', d => d.slug == visState.modelSlug)
        init()
      })
      .classed('active', d => d.slug == visState.modelSlug)
  }


  async function drawHeadSweep(){
    var sweepSlug = 'batch_64models'
    var models = await util.getFile(`../05-sweep-vis/data__${sweepSlug}.json`)
    models.forEach(d => d.sweepSlug = sweepSlug)

    var validSlugs = ['2023-03-29-01h15m48s', '2023-03-29-04h24m59s', '2023-03-28-22h06m20s', '2023-03-29-07h32m22s']
    models = models.filter(d => validSlugs.includes(d.slug))

    var byGroup = d3.nestBy(models, d => 'num_heads: ' + d.hyper.num_heads)
    byGroup = _.sortBy(byGroup, d => d.key).reverse()

    var modelButtonSel = sel.append('div').append('h4').text('Num Head Sweep').parent()
      .appendMany('div', byGroup)
      .text(d => d.key)
      .append('div').appendMany('div.model-button', d => d)
      // .html(d => 'MAE<br>' + d3.round(d.metrics.MAE, 3))
      .html(fmtMAE)
      .on('click', d => {
        visState.sweepSlug = d.sweepSlug
        visState.modelSlug = d.slug

        d3.selectAll('.model-button').classed('active', d => d.slug == visState.modelSlug)
        init()
      })
      .classed('active', d => d.slug == visState.modelSlug)
  }



}
drawModels()


