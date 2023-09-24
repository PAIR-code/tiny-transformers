window.initFilters = function({state}){
  var sel = d3.select('.filters').html('')

  var typeSel = sel.appendMany('div', [
    {groups: state.data.bySrc, type: 'src', title: 'Source Templates'},
    {groups: state.data.byDst, type: 'dst', title: 'Destination Prompts'},
  ])

  typeSel.each(drawLineChart)

  var groupSel = typeSel.appendMany('div.row', d => d.groups)
    .on('click', group => {
      state.filter[group.type][group.key] = !state.filter[group.type][group.key]

      state.color[group.type][group.key] = state.filter[group.type][group.key] ? '#eee' : group.color
      state.render.filter()
    })
    .on('mouseover', group => {
      state.template = group
      state.render.template()
    })

  groupSel.append('div')
    .st({display: 'inline-block', width: 20, height: '.5em', backgroundColor: d => d.color})

  groupSel.append('div')
    .st({display: 'inline-block', marginLeft: 10})
    .text(d => d.key.replaceAll('\n', '\\n'))

  state.render.filter.fns.push(() => {
    groupSel.st({opacity: d => state.filter[d.type][d.key] ? .2 : 1})
  })


  function drawLineChart(typeObj){
    var isSrc = typeObj.groups[0].type == 'src'

    var c = d3.conventions({
      sel: d3.select(this).append('div'),
      height: 100,
      width: 300,
      margin: {bottom: 30},
    })

    c.svg.append('text.chart-title')
      .text(typeObj.title)

    c.x.domain([0, 26])
    c.yAxis.tickFormat(d3.format('.0%')).tickValues([0, .25, .5, .75, 1])
    d3.drawAxis(c)
    util.ggPlot(c)
    util.addAxisLabel(c, 'Layer', isSrc ? 'Percent Rank 0' : '')

    var lineSel = c.svg.appendMany('path', typeObj.groups)
      .at({stroke: d => d.color, strokeWidth: 2, fill: 'none'})

    var line = d3.line()
      .x(d => c.x(d.layer))
      .y(d => c.y(d.rank0Percent))

    state.render.filter.fns.push(() => {
      lineSel
        .at({opacity: 0})
        .filter(d => !state.filter[d.type][d.key])
        .at({opacity: 1, d: d => line(d.byLayer)})
    })
  }
}


window.init?.()
