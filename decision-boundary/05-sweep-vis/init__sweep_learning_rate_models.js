
d3.loadData('data__sweep_learning_rate_models.json', (err, res) => {
  var models = res[0]
  models = models.map(d => {
    var rv = {...d, ...d.hyper, ...d.metrics}
    rv.slug = {name: d.slug}
    return rv
  })

  var hyper_sweep = {
    "seed": [1, 2, 3, 4],
    "max_steps": [100000, 200000, 400000, 800000, 1600000],
    "learning_rate": [3e-2, 1e-2, 3e-3, 1e-3, 3e-4, 1e-4, 3e-5, 1e-5, 3e-6, 1e-6],
  }

  var sel = d3.select('.sweep_learning_rate_models').html('')
  sel.append('div')
    // .append('p').html(``).parent()
    .appendMany('div', d3.nestBy(models, d => d.hyper.max_steps))
    .each(function(d){ drawChart.call(this, d, {yScale: .02})})
    .st({display: 'inline-block'})


  function drawChart(models, settings){
    settings = { ...{yScale: .1}, ...settings }

    var c = d3.conventions({
      sel: d3.select(this),
      height: 150, 
      width: 150,
      margin: {left: 45, bottom: 35}
    })

    c.svg.append('g.axis').append('text.axis-label').text('max_steps: ' + d3.format(',')(models.key)).at({textAnchor: 'middle'}).translate([c.width/2, -2])

    c.x = d3.scaleLog().range([0, c.width]).domain(d3.extent(hyper_sweep.learning_rate))
    c.y.domain([0, settings.yScale]).clamp(0)

    c.xAxis = d3.axisBottom(c.x).tickValues(hyper_sweep.learning_rate)//.tickFormat(d => d)
    c.yAxis.ticks(5)
    d3.drawAxis(c)

    // models = models.filter(d => !d.hyper.has_fixed_vocab_embedding)

    var modelSel = c.svg.appendMany('circle', models)
      .translate(d => [c.x(d.hyper.learning_rate), c.y(d.metrics.MAE)])
      .at({
        r: 3, 
        cx: d => Math.random()*2*0 - 0,
        stroke: '#000',
        fillOpacity: 0,
        strokeWidth: 1,
      })
      .call(d3.attachTooltip)

    util.ggPlot(c, 0)
    util.addAxisLabel(c, 'learning_rate', 'MAE', 30, -35)
  }
})

