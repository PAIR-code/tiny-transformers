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
  sweepSlug: 'batch_64models',
  modelSlug: '2023-03-29-01h15m48s',
}

var sliderScale = d3.scalePow().range([.01, 256]).exponent(2)
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
window.color = d => d3.interpolateRdBu((-d + visState.colorS) / visState.colorS / 2)
window.renderAll = () => {
  sel.selectAll('val')
    .data([-visState.colorS, visState.colorS])
    .text((d, i) => d3.format('.2f')(d))
    .st({background: color, padding: 5, color: '#fff'})

  renderAll.fns.forEach(d => d.render())
}





window.init = async function(){
  // console.clear()
  renderAll.fns = []

  const model = await window.initModel()
  const predictionChart = window.initPredictionChart(model)
  modelInput = window.initModelInput(model.hyper, _.throttle(predictionChart.render, 10))

  window.initKqCircuit(model)
  window.initOvSimple(model)
  window.initOvCircuit(model)

  window.renderAll()
}
window.init()







!(function(){
  var sweepSlug = 'batch_64models'
  d3.loadData(`../05-sweep-vis/data__${sweepSlug}.json`, (err, res) => {
    var models = res[0]
    models = models.map(d => {
      var rv = {...d, ...d.hyper, ...d.metrics}
      rv.slug = d.slug
      return rv
    })

    var validSlugs = ['2023-03-29-01h15m48s', '2023-03-29-04h24m59s', '2023-03-28-22h06m20s', '2023-03-29-07h32m22s']
    models = models.filter(d => validSlugs.includes(d.slug))
    models = _.sortBy(models, d => d.num_heads)
    models = _.sortBy(models, d => d.num_layers)
    models = _.sortBy(models, d => -d.sequence_length)

    var sel = d3.select(`.model-list`).html('')
    var modelButtonSel = sel.append('div')
      .st({width: 900})
      .appendMany('div', d3.nestBy(models, d => d.sequence_length))
      // .st({marginBottom: 40}).append('h3').text(d => 'sequence_length ' + d.key).st({fontWeight: 800})
      // .parent()
      .appendMany('div.model-button', d => d)
      .st({display: 'inline-block', width: 200, marginBottom: 20, padding: 5, outline: '1px solid #ccc', margin: 5})
      .each(function(d){
        d.MAE = d3.round(d.MAE, 4)
        var keys = ['num_layers', 'num_heads', 'MAE']
        d3.select(this).html(keys.map(key => `<div>${key}: <b>${d[key]}</b></div>`).join(''))
      })
      .on('click', d => {
        visState.sweepSlug = sweepSlug
        visState.modelSlug = d.slug

        modelButtonSel.classed('active', d => d.slug == visState.modelSlug)

        init()
      })
      .classed('active', d => d.slug == visState.modelSlug)
  })
})()