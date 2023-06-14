window.initCircleWeightsVis = async function(){
  var c = d3.conventions({
    sel: d3.select('.circle-weights-vis').html(''),
    width:  200,
    height: 200,
    layers: 's',
  })

  c.yAxis.ticks(3)
  c.xAxis.ticks(3)
  // d3.drawAxis(c)
  // c.svg.select('.x').translate([Math.floor(sx/2), c.height])
  // c.svg.select('.y').translate(Math.floor(sy/2), 1)

  var color = ['purple', 'green']

  c.svg.append('text').text('hiddenW')
    .at({y: -5, fontSize: 12, fill: color[0]})
  c.svg.append('text').text('outW')
    .at({y: -5, fontSize: 12, fill: color[1], x: c.width, textAnchor: 'end'})
    

  var pointData = d3.range(visState.hidden_size)
    .map(i => [{i, isOut: 0}, {i, isOut: 1}]).flat()

  var pointSel = c.svg.appendMany('g', pointData)

  pointSel.append('text').text(d => d.i)
    .at({fill: d => color[d.isOut], dx: d => d.isOut ? 10 : -10, textAnchor: 'middle'})
    .st({cursor: 'pointer'})
  pointSel.append('circle').at({r: 3, cursor: 'pointer'})

  renderAll.modelFns.push(render)

  function render(){
    var hiddenW = visState.model.hiddenWT
    var outW = visState.model.outW

    var max = d3.max(hiddenW.concat(outW).flat().map(Math.abs))

    c.svg.selectAll('rect, .axis').remove()
    c.x.domain([-max*1.3, max*1.3])
    c.y.domain([-max*1.3, max*1.3])
    d3.drawAxis(c)
    util.ggPlot(c)

    c.svg.append('circle')
      .translate([c.width/2, c.height/2]).at({r: c.x(max*.7)/2, stroke: '#ccc', fill: 'none'})

    pointSel.raise()


    pointData.forEach(d => {
      var w = d.isOut ? visState.model.outW : visState.model.hiddenWT
      d.pos = w[d.i]
    })

    pointSel.translate(d => [c.x(d.pos[0]), c.y(d.pos[1])])
  }
}


if (window.init) window.init()