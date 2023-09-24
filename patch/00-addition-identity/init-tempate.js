window.initTemplate = function({state}){
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
      width: 200,
      margin: {bottom: 30},
    })

    c.svg.append('text.chart-title-sm')
      .text(array.key)

    c.x.domain([0, 26])
    c.y = d3.scaleLog().domain([1e0, 2e4]).range([0, c.height])
    c.yAxis = d3.axisLeft(c.y).tickValues([1e0, 1e1, 1e2, 1e3, 1e4])
    d3.drawAxis(c)
    util.ggPlot(c)
    util.addAxisLabel(c, 'Layer', chartIndex ? '' : 'Argmax Rank 0')

    var line = d3.line()
      .x((d, i) => c.x(i))
      .y(d => c.y(d + 1))

    c.svg.appendMany('path', array)
      .at({d: d => line(d.ranks), stroke: '#000', strokeWidth: 1, fill: 'none', opacity: .2})
  }
}


window.init?.()
