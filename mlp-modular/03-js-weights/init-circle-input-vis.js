window.initCircleInputVis = async function(type, hidden){
  var c = d3.conventions({
    sel: d3.select('.circle-' + type).html(''),
    width:  168,
    height: 168,
    layers: 's',
  })

  c.yAxis.ticks(3)
  c.xAxis.ticks(3)

  c.svg.append('text').text(type)
    .at({y: -5, fontSize: 12})

  var isEmbed = type == 'embed'
    
  var pointData = d3.range(type == 'embed' ? visState.n_tokens : visState.hidden_size)
    .map(i => ({i}))

  var lineSel = c.svg.appendMany('path', pointData)
    .at({stroke: '#000', opacity: isEmbed ? 0 : 1})

  var pointSel = c.svg.appendMany('g', pointData)

  var textSel = pointSel.append('text').text(d => d.i)
    .at({textAnchor: 'middle', dy: '.33em', fontSize: isEmbed ? 10 : ''})
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
      d.pos = visState.model[type][d.i]
    })

    lineSel.raise().at({
      d: d => ['M', c.x(0), c.y(0), 'L', c.x(d.pos[0]), c.y(d.pos[1])].join(' ')
    })


    pointSel.translate(d => [c.x(d.pos[0]), c.y(d.pos[1])])

    textSel.translate(d => [d.pos[0]*10, -d.pos[1]*10])
  }
}


if (window.init) window.init()