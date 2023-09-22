console.clear()

window.init = async function(){
  var state = window.visState = window.visState || {
    slug: 'add-v0',
  }
  state.render = util.initRender(['filter', 'template', 'experiment'])

  // load data and format
  var data = state.data = state.data || {
    experiments: await util.getFile('experiments.json'),
    vocabList: await util.getFile('vocab_list.json'),
  }
  console.log(state.data.vocabList[10])

  data.flat = []
  data.experiments.forEach(e => {
    e.ranks.forEach((rank, layer) => data.flat.push({e, rank, layer}))
  })

  data.byLayer = d3.nestBy(data.flat, d => d.layer)
  data.byLayer.forEach(d => d.layer = d[0].layer)

  state.render.filter.fns.push(() => {
    data.byLayer.forEach(layer => {
      layer.rank0Percent = d3.mean(layer, d => d.isFiltered ? NaN : d.rank == 0)
    })
  })

  window.initOverallPercent({state, sel: d3.select('.overall-percent').html('')})
  

  state.render.filter()
}



window.init()

