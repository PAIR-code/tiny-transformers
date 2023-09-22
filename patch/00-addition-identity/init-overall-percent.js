window.initOverallPercent = function({state, sel}){
  var c = d3.conventions({
    sel: sel.append('div'),
    height: 100,
    width: 300
  })

  c.svg.append('text.chart-title')
    .text('Percent')

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
