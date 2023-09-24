window.init = async function(){
  var state = window.state = window.visState = window.visState || {
    slug: 'add-v0',
    filter: {src: {}, dst: {}},
  }

  state.render = util.initRender(['filter', 'template', 'experiment'])
  
  state.color = {src: {}, dst: {}}

  state.data = state.data || {
    experiments: await util.getFile('experiments.json'),
    vocabList: await util.getFile('vocab_list.json'),
  }
  fmtData()


  window.initOverallPercent({state})
  window.initFilters({state})
  window.initTemplate({state})
  
  state.render.filter()

  state.template = state.data.bySrc[0]
  state.render.template()

  function fmtData(){
    var {data} = state

    data.flat = []
    data.experiments.forEach((e, i) => {
      e.src = e.prompt_template
      e.dst = e.prompt_dst
      e.experimentIndex = i

      e.ranks.forEach((rank, layer) => data.flat.push({e, rank, layer}))
    })

    data.byLayer = d3.nestBy(data.flat, d => d.layer)

    // filter data set up
    data.bySrc = d3.nestBy(data.flat, d => d.e.src)
    data.byDst = d3.nestBy(data.flat, d => d.e.dst).reverse()
    data.bySrc.hash = {}
    data.byDst.hash = {}

    data.bySrc.forEach((d, i) => {
      d.type = 'src'

      d.color = state.color.src[d.key] = d3.schemeTableau10[i]
      data.bySrc.hash[d.key] = d 

      d.byLayer = d3.nestBy(d, d => d.layer)
    })

    data.byDst.forEach((d, i) => {
      d.type = 'dst'

      var templateIndex = ['4', 'h', 'c'].indexOf(d.key[0]) + 3
      var base = d3.schemeTableau10[templateIndex]
      d.color = state.color.dst[d.key] = d3.color(base).brighter((d.key.split(' ').length - 5)/6)

      data.byDst.hash[d.key] = d 

      d.byLayer = d3.nestBy(d, d => d.layer)
    })
    
    state.color.srcOg = {...state.color.src}
    state.color.dstOg = {...state.color.dst}


    state.render.filter.fns.push(() => {
      data.flat.forEach(d => {
        d.isFiltered = state.filter.src[d.e.src] || state.filter.dst[d.e.dst]
      })

      function updateRank0Percent(array){
        array.layer = array[0].layer
        array.rank0Percent = d3.mean(array, d => d.isFiltered ? NaN : d.rank == 0)
      }

      data.byLayer.forEach(updateRank0Percent)
      data.bySrc.forEach(d => d.byLayer.forEach(updateRank0Percent))
      data.byDst.forEach(d => d.byLayer.forEach(updateRank0Percent))
    })

    state.render.template.fns.push(() => {

    })

  }
}



window.init()

