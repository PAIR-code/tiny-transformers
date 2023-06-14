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

    var centerSel = c.svg.append('g')
      .translate([c.width/2, c.height/2])

    var aLineSel = centerSel.append('path').at({strokeWidth: 2, opacity: 1, stroke: 'steelblue', fill: 'none'})
    var bLineSel = centerSel.append('path').at({strokeWidth: 2, opacity: 1, stroke: 'orange', fill: 'none'})

    var aPoints = d3.range(0, 1 + .001, .001).map(v => ({v, x: 0, y: 0}))
    var bPoints = d3.range(0, 1 + .001, .001).map(v => ({v, x: 0, y: 0}))

    var line = d3.line().x(d => d.x).y(d => d.y)
      .curve(d3.curveCatmullRomOpen)

    var isOut = type == 'outW'
    renderAll.inputFns.push(() => {
      var {a, b, n_tokens} = visState
      var r = c.r

      var ωk = Math.PI*2*1/n_tokens

      function calcPos(x, dr){
        var spiralSpacing = .5 
        var rs = spiralSpacing * x * Math.sqrt(ωk) + r
        var rs = r + dr

        return [Math.cos(ωk*x)*rs, - Math.sin(ωk*x)*rs]
      }

      aPoints.forEach(d => { 
        var [x, y] = calcPos(d.v*a, -1) 
        d.x = x 
        d.y = y 
      }) 
      bPoints.forEach(d => { 
        var [x, y] = calcPos((isOut ? a : 0) + d.v*b, 1)
        d.x = x
        d.y = y
      }) 


      aLineSel.at({d: line(aPoints)})
      bLineSel.at({d: line(bPoints)})
    })


    function render(){
      var allWs = visState.model.hiddenWT.concat(visState.model.outW).flat()
      var max = d3.max(allWs.map(Math.abs))

      c.svg.selectAll('rect, .axis').remove()
      c.x.domain([-max*1.3, max*1.3])
      c.y.domain([-max*1.3, max*1.3])
      d3.drawAxis(c)
      util.ggPlot(c)

      c.r = c.x(max*.7)/2
      c.svg.append('circle')
        .translate([c.width/2, c.height/2]).at({r: c.r, stroke: '#ccc', fill: 'none'})

      centerSel.raise()

      var pos = visState.model[type][hiddenIndex]
      lineSel.raise().at({
        d: ['M', c.x(0), c.y(0), 'L', c.x(pos[0]), c.y(pos[1])].join(' ')
      })
      circleSel.raise().translate([c.x(pos[0]), c.y(pos[1])])

    }

  }

}


if (window.init) window.init()