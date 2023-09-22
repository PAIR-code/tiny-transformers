window.initFilters = function({state}){

  var sel = d3.select('.template').html('')

  state.render.template.fns.push(() => {

    var {type, key} = state.template
    var experiments = state.data.experiments.filter(d => d[type] == key)
    var byKey = d3.nestBy(experiments, d => d[type == 'src' ? 'dst' : 'src'])

    sel.html('').appendMany('div.chart', byKey)
      // .append('div').text(d => d.key)
      .each(drawLineChart)

  })

  function drawLineChart(array, chartIndex){

    var c = d3.conventions({
      sel: d3.select(this).append('div'),
      height: 100,
      width: 300,
      margin: {bottom: 30},
    })

    c.svg.append('text.chart-title-sm')
      .text(array.key)

    c.x.domain([0, 26])
    c.y = d3.scaleLog().domain([1e0, 2e-4]).range([0, c.height])
    c.yAxis = d3.axisLeft(c.y).ticks(6)
    d3.drawAxis(c)
    util.ggPlot(c)
    util.addAxisLabel(c, 'Layer', chartIndex ? '' : 'Argmax Rank 0')

    var lineSel = c.svg.appendMany('path', array)
      .at({stroke: d => '#000', strokeWidth: 1, fill: 'none'})

    var line = d3.line()
      .x((d, i) => c.x(i))
      .y(d => c.y(d))

    state.render.filter.fns.push(() => {
      lineSel.at({d: d => line(d.ranks)})
      // lineSel
      //   .at({opacity: 0})
      //   .filter(d => !state.filter[d.type][d.key])
      //   .at({opacity: 1, d: d => line(d.byLayer)})
    })
  }
}


window.init?.()
