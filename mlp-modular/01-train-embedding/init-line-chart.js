window.initLineChart = async function({sel, isBig, model}){
  var c = d3.conventions({
    sel: sel.html(''),
    width: isBig ? 442 : 50,
    height: isBig ? 150 : 30,
    margin: {left: 25, right: 15, top: 10, bottom: 20}
  })

  c.x.domain([0, visState.hyper_shared.max_steps])
  // c.x.domain([0, 30000]).clamp(1)
  c.y = d3.scaleLog().domain([1e5, 1e-9]).range([0, c.height])

  c.xAxis.ticks(isBig ? 10 : 3).tickFormat(d => d/1000 + 'k')
  c.yAxis = d3.axisLeft(c.y).ticks(isBig ? 5 : 3)

  d3.drawAxis(c)
  util.ggPlot(c)

  var line = d3.line().x(d => c.x(d.step))

  var trainPathSel = c.svg.append('path')
    .at({strokeWidth: 1, stroke: 'orange', fill: 'none'})
  var testPathSel = c.svg.append('path')
    .at({strokeWidth: 1, stroke: 'steelblue', fill: 'none'})

  var root = `${sharedUtil.getRoot()}/mlp_modular/${visState.hyper_shared.sweep_slug}`
  var metrics = await (await fetch(`${root}/${model.slug}/metrics.json`)).json()

  trainPathSel.at({d: line.y(d => c.y(d.train_loss))(metrics)})
  testPathSel.at({d: line.y(d => c.y(d.eval_loss))(metrics)})


  var stepPath = c.svg.append('path')
    .at({d: 'M 0 0 V ' + c.height, stroke: '#000', strokeDasharray: '2 2'})
    .translate(c.x(visState.stepIndex*100), 0)

  renderAll.stepFns.push(d => {
    stepPath.translate(c.x(visState.stepIndex*100), 0)
  })

  c.svg.append('rect')
    .at({width: c.width, height: c.height, fillOpacity: 0})
    .on('mousemove', function(){
      visState.stepIndex = Math.round(c.x.invert(d3.mouse(this)[0])/100)
      renderAll.step()
    })

}
window.init?.()

