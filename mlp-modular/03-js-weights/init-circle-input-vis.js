window.initCircleInputVis = async function(type){
  d3.select('.circle-input-' + type).html('')
    .appendMany('div', d3.range(visState.hidden_size))
    .st({display: 'inline-block'})
    .each(initCircle)

  function initCircle(hiddenIndex){
    var c = d3.conventions({
      sel: d3.select(this),
      width:  160,
      height: 160,
    })

    c.yAxis.ticks(3)
    c.xAxis.ticks(3)

    c.svg.append('text').text(type + ' ' + hiddenIndex)
      .at({y: -5, fontSize: 12})

    var lineSel = c.svg.append('path')
      .at({stroke: '#000'})
    var circleSel = c.svg.append('circle')
      .at({r: 3})

    renderAll.modelFns.push(render)

    function render(){
      var allWs = visState.model.hiddenWT.concat(visState.model.outW).flat()
      var max = d3.max(allWs.map(Math.abs))

      c.svg.selectAll('rect, .axis').remove()
      c.x.domain([-max*1.3, max*1.3])
      c.y.domain([-max*1.3, max*1.3])
      d3.drawAxis(c)
      util.ggPlot(c)

      c.svg.append('circle')
        .translate([c.width/2, c.height/2]).at({r: c.x(max*.7)/2, stroke: '#ccc', fill: 'none'})

      var pos = visState.model[type][hiddenIndex]
      lineSel.raise().at({
        d: ['M', c.x(0), c.y(0), 'L', c.x(pos[0]), c.y(pos[1])].join(' ')
      })
      circleSel.raise().translate([c.x(pos[0]), c.y(pos[1])])
    }

  }

}


if (window.init) window.init()