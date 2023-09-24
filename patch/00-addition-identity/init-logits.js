console.clear()

window.initLogits = function({state}){
  var sel = d3.select('.logits').html('')

  state.render.experiment.fns.push(async () => {
    var experiment = state.data.experiments[state.experimentIndex]
    console.log(state.experimentIndex, experiment)

    sel.html('').append('div.chart').text('sdf')
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
    c.y = d3.scaleLog().domain([1e0, 2e3]).range([0, c.height])
    c.yAxis = d3.axisLeft(c.y).tickValues([1e0, 1e1, 1e2, 1e3])
    d3.drawAxis(c)
    util.ggPlot(c)
    util.addAxisLabel(c, 'Layer', chartIndex ? '' : 'Argmax Rank')

    var line = d3.line()
      .x((d, i) => c.x(i))
      .y(d => c.y(d + 1))

    c.svg.appendMany('path', array)
      .at({d: d => line(d.ranks), stroke: '#000', strokeWidth: 1, fill: 'none', opacity: .2})
  }
}


window.init?.()
