window.init = async function(){
  var state = window.state = window.visState = window.visState || {
    slug: 'add-v1',
    filter: {src: {}, dst: {}},
    experimentIndex: 100,
    topN: 4
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
  window.initLogits({state})
  
  state.render.filter()

  state.template = state.data.bySrc[0]
  state.render.template()
  state.render.experiment()

  function fmtData(){
    var {data} = state

    console.log(data.experiments[0])

    data.flat = []
    data.experiments.forEach((e, i) => {
      var lines = e.prompt_src.replaceAll('.', '\n').split('\n')
      if (e.template_src == 'What is {} plus {}?\n'){
        e.src = 'What is {} plus {}?\n'
      } else if (e.template_src == 'Calculate {} + {}.\n'){
        e.src = 'Calculate {} + {}.\n'
      } else{
        e.src = lines[0]
      }

      e.dst = e.prompt_dst
      e.experimentIndex = i

      e.ranks.forEach((rank, layer) => data.flat.push({e, rank, layer}))
    })

    data.byLayer = d3.nestBy(data.flat, d => d.layer)

    // filter data set up
    data.bySrc = d3.nestBy(data.flat, d => d.e.src)
    data.byDst = d3.nestBy(data.flat, d => d.e.dst)
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

d3.select('body').selectAppend('div.tooltip.tooltip-hidden')
