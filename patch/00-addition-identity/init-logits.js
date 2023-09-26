

window.initLogits = function({state}){
  var sel = d3.select('.logits')
  var chartSel

  state.render.experiment.fns.push(async () => {
    // sel.html('')
    var experiment = state.data.experiments[state.experimentIndex]
    var topTokens = await calcTopTokens(experiment)

    topTokens.forEach(token => {
      token.firstChar = token.str[0]
      var ranked = _.sortBy(token, d => d.rank)
      ranked = _.sortBy(ranked, d => -d.layerIndex)
      token.minRank = ranked[0]

      token.lowestRank = d3.min(token, d => d.rank)
    })
    topTokens = _.sortBy(topTokens, d => d.minRank.rank)
    topTokens = _.sortBy(topTokens, d => d.minRank.layerIndex)
    topTokens = topTokens.filter(d => d.lowestRank < 5) // goes up to 10 w/ csv data

    var colorScale = d3.scaleOrdinal(d3.schemeCategory10)
    var tmpTop = []
    d3.nestBy(topTokens, d => d.firstChar).forEach(charArray => {
      var color = d3.rgb(colorScale(charArray.key))

      charArray.forEach((d, i) => {
        d.color = color.brighter(.15*i)
        tmpTop.push(d)
      })
    })
    topTokens = tmpTop

    sel.html('')
    sel.append('div').text(experiment.prompt_src)
    sel.append('div').text(experiment.prompt_dst)

    chartSel = sel.append('div.chart-container')
      .st({marginTop: 20})

    drawRankChart(topTokens)
    drawLogitChart(topTokens)
    drawPercentChart(topTokens)
    drawLegend(topTokens)

    drawToptokens(experiment)

    setActiveTopToken(topTokens[0])
  })

  function makeC(){
    return d3.conventions({
      sel: chartSel.append('div'),
      height: 200,
      width: 200,
      margin: {right: 30, bottom: 30},
    })
  }

  function drawRankChart(topTokens){
    var c = makeC()
    c.svg.append('text.chart-title-sm').text('Rank')

    c.x.domain([0, 26])
    c.y = d3.scaleLog().domain([1e0, 2e3]).range([0, c.height])
    c.yAxis = d3.axisLeft(c.y).tickValues([1e0, 1e1, 1e2, 1e3])
    d3.drawAxis(c)
    util.ggPlot(c)
    util.addAxisLabel(c, 'Layer', 'Token Rank')

    var line = d3.line()
      .x(d => c.x(d.layerIndex))
      .y(d => c.y(d.rank + 1))

    c.svg.appendMany('path.top-token', topTokens)
      .at({d: d => line(d), stroke: d => d.color, strokeWidth: 1, fill: 'none', opacity: .9})
      .on('mouseover', setActiveTopToken)
  }

  function drawLogitChart(topTokens){
    var c = makeC()
    c.svg.append('text.chart-title-sm').text('Logit')

    c.x.domain([0, 26])
    c.y.domain(d3.extent(topTokens.map(d => d.map(e => e.v)).flat()))
    d3.drawAxis(c)
    util.ggPlot(c)
    util.addAxisLabel(c, 'Layer', 'Logit')

    var line = d3.line()
      .x(d => c.x(d.layerIndex))
      .y(d => c.y(d.v))

    c.svg.appendMany('path.top-token', topTokens)
      .at({d: d => line(d), stroke: d => d.color, strokeWidth: 1, fill: 'none', opacity: .9})
      .on('mouseover', setActiveTopToken)
  }

  function drawPercentChart(topTokens){
    var c = makeC()
    c.svg.append('text.chart-title-sm').text('Percent')

    c.x.domain([0, 26])
    c.yAxis.tickFormat(d3.format('.0%')).tickValues([0, .25, .5, .75, 1])
    d3.drawAxis(c)
    util.ggPlot(c)
    util.addAxisLabel(c, 'Layer', 'Softmax')

    var line = d3.line()
      .x(d => c.x(d.layerIndex))
      .y(d => c.y(d.softmax))

    c.svg.appendMany('path.top-token', topTokens)
      .at({d: d => line(d), stroke: d => d.color, strokeWidth: 1, fill: 'none', opacity: .9})
      .on('mouseover', setActiveTopToken)
  }

  function drawToptokens(experiment){
    var matches = state.data.experiments
      .filter(d => d.src == experiment.src && d.dst == experiment.dst)
    var experimentSel = sel.append('div')
      .appendMany('div', matches)
      .st({display: 'inline-block', width: 120})
      .text(d => d.num_inputs.join(' + ') + ' ' + d.argmax_str.replaceAll('\n', '\\n'))

    console.log(experiment)
  }


  function drawLegend(topTokens){
    var groupSel = chartSel.append('div').appendMany('div.row.top-token', topTokens)
      .st({display: 'block'})
      .on('mouseover', setActiveTopToken)

    groupSel.append('div')
      .st({display: 'inline-block', width: 20, height: '.5em', backgroundColor: d => d.color})

    groupSel.append('div')
      .st({display: 'inline-block', marginLeft: 10})
      .text(d => d.str.replaceAll('\n', '\\n'))
  }

  function setActiveTopToken(topToken){
    sel.selectAll('.top-token').classed('active', d => d == topToken)
  }

    async function calcTopTokens(experiment){
    var indexStr = d3.format('06')(experiment.experimentIndex)

    var outputTop = await util.getFile(`output-top/${indexStr}.csv`)
    outputTop.forEach(d => {
      d.layerIndex = +d.layerIndex
      d.tokenIndex = +d.tokenIndex
      d.v = +d.v
      d.softmax = +d.softmax
      d.rank = +d.rank
    })
    var topTokens = d3.nestBy(outputTop, d => d.tokenIndex)
    topTokens.forEach(d => d.str = state.data.vocabList[d.key])

    return topTokens      


    // window.__logitCache = window.__logitCache || {}
    // if (__logitCache[indexStr]) return __logitCache[indexStr]

    // var logits = await util.getFile(`output_dst_logits/${indexStr}.npy`)

    // var [nLayers, nTokens] = logits.shape
    // var flatLogits = d3.cross(d3.range(nLayers), d3.range(nTokens))
    //   .map(([layerIndex, tokenIndex]) => {
    //     var v = logits.data[layerIndex*nTokens + tokenIndex]

    //     return {layerIndex, tokenIndex, v, rank: 0}
    //   })

    // // TODO: top N to speed up 
    // var byLayer = d3.nestBy(flatLogits, d => d.layerIndex)
    // byLayer.forEach(d => {
    //   _.sortBy(d, d => -d.v).forEach((d, i) => d.rank = i)
    // })
    // state.flatLogits = flatLogits

    // var byToken = d3.nestBy(flatLogits, d => d.tokenIndex)
    // var topTokens = byToken.filter(token => token.some(d => d.rank < state.topN))
    // topTokens.forEach(d => {
    //   d.str = state.data.vocabList[d.key]
    // })

    // window.__logitCache[indexStr] = topTokens
    // return topTokens
  }


}


window.init?.()
