window.visState = window.visState || {
  // xm_dense_checkpoints
  hyper_shared: {"task": "modular_addition", "n_tokens": 113, "percent_train": 0.3, "embed_size": 32, "hidden_size": 64, "tied_embedding": true, "learning_rate": 0.001, "weight_decay": 0.1, "b1": 0.9, "b2": 0.98, "log_every": 20, "save_every": 100, "max_steps": 100000, "seed": 22, "sweep_slug": "xm_dense_checkpoints"},
  
  // xm_dense_53_n_digts_16_32
  // hyper_shared: {"task": "modular_addition", "n_tokens": 53, "percent_train": 0.3, "embed_size": 16, "hidden_size": 32, "tied_embedding": true, "learning_rate": 0.003, "weight_decay": 0.3, "b1": 0.9, "b2": 0.98, "log_every": 20, "save_every": 100, "max_steps": 100000, "seed": 37, "sweep_slug": "xm_dense_53_n_digts_16_32"},
  
  // xm_dense_53_n_digts_8_32
  // hyper_shared: {"task": "modular_addition", "n_tokens": 53, "percent_train": 0.3, "embed_size": 8, "hidden_size": 32, "tied_embedding": true, "learning_rate": 0.003, "weight_decay": 0.03, "b1": 0.9, "b2": 0.98, "log_every": 20, "save_every": 100, "max_steps": 100000, "seed": 23, "sweep_slug": "xm_dense_53_n_digts_8_32"},

  // xm_dense_29_n_digits_8_32
  // hyper_shared: {"task": "modular_addition", "n_tokens": 29, "percent_train": 0.3, "embed_size": 8, "hidden_size": 32, "tied_embedding": true, "learning_rate": 0.003, "weight_decay": 0.3, "b1": 0.9, "b2": 0.98, "log_every": 20, "save_every": 100, "max_steps": 100000, "seed": 12, "sweep_slug": "xm_dense_29_n_digts_8_32"},
  
  stepIndex: 105,
}


window.initRenderAll = function(){
  var rv = {modelFns: [], stepFns: []}

  d3.entries(rv).forEach(({key, value}) => {
    rv[key.replace('Fns', '')] = async () => {
      if (key == 'modelFns'){
        visState.model.embedding = await util.getFile(visState.model.slug + '/embedding.npy')
        visState.model.output = await util.getFile(visState.model.slug + '/output.npy')
        visState.model.hidden = await util.getFile(visState.model.slug + '/hidden.npy')
        console.log('loaded model checkpoints')
      }

      value.forEach(d => d())
    }
  })

  return rv
}


window.init = async function(){
  console.clear()

  visState.models = await util.getFile(`../00-sweep/data__hypers_${visState.hyper_shared.sweep_slug}.csv`)

  window.renderAll = initRenderAll()

  var lineChartSel = d3.select('.line-charts').html('')
    .appendMany('div', visState.models).st({display: 'inline-block', cursor: 'pointer'})
    .on('click', model => {
      visState.model = model
      renderAll.model()
    })
    .each(function(model){
      initLineChart({sel: d3.select(this), model, isBig: 0})
    })



  renderAll.modelFns.push(() => {
    lineChartSel.classed('active', d => d == visState.model)

    initLineChart({sel: d3.select('.big-line-chart'), model: visState.model, isBig: 1})

    initTopPrediction()
    initTopPredictionFlat()
    initEmbedVis('embedding')
    initEmbedVis('hidden')
    initEmbedVis('output')

    initEmbedLineVis()
    initEmbedPCA()
    initEmbedPCA3d()
  })


  visState.model = visState.model || visState.models[24]
  await renderAll.model()
  renderAll.step()


  d3.select(window).on('keydown', () => {
    if (d3.event.keyCode == 37) visState.stepIndex += d3.event.shiftKey ? -10 : -1
    if (d3.event.keyCode == 39) visState.stepIndex += d3.event.shiftKey ? +10 : +1

    visState.stepIndex = d3.clamp(0, visState.stepIndex, 1000 - 1)
    renderAll.step()
  })
}
init()


