
d3.loadData('data__sweep_no_mlp_models.json', (err, res) => {
  var hyper_sweep = {
    "seed": [1, 2, 3, 4],
    "num_layers": [4, 3, 2, 1],
    "num_heads": [1, 2, 4, 8, 16],
    "model_size": [16, 32, 64, 128, 256],
    "position_embedding": ['none', 'trained', 'fixed_float', 'fixed_one_hot']
  }

  var models = res[0]
  models = models.map(d => {
    var rv = {...d, ...d.hyper, ...d.metrics}
    rv.slug = {name: d.slug}
    return rv
  })
  models = _.sortBy(models, d => d.num_heads)
  models = _.sortBy(models, d => d.num_layers)

  var color = d3.scaleOrdinal(d3.schemeCategory10)

  var sel = d3.select('.sweep_no_mlp_models').html('')
  sel.append('div')
    .appendMany('div.row', d3.nestBy(models, d => d.hyper.has_mlp))
    .appendMany('div', models => d3.nestBy(models, d => d.hyper.has_layer_norm))
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

    var {has_mlp, has_layer_norm} = models[0].hyper

    c.svg.append('g.axis').append('text.axis-label')
      .text('mlp: ' + has_mlp + ' — layer_norm: ' + has_layer_norm)
      .at({textAnchor: 'middle'}).translate([c.width/2, -2])

    c.x = d3.scaleLog().range([0, c.width]).domain(d3.extent(hyper_sweep.model_size))
    c.y.domain([0, settings.yScale]).clamp(0)

    c.xAxis = d3.axisBottom(c.x).tickValues(hyper_sweep.model_size).tickFormat(d => d)
    c.yAxis.ticks(5)
    d3.drawAxis(c)

    // models = models.filter(d => !d.hyper.has_fixed_vocab_embedding)

    var modelSel = c.svg.appendMany('circle', models)
      .translate(d => [c.x(d.hyper.model_size), c.y(d.metrics.MAE)])
      .at({
        r: 3, 
        cx: d => Math.random()*2*1 - 1,
        stroke: d => color(d.hyper.position_embedding),
        fillOpacity: 0,
        strokeWidth: 1.5,
      })
      .call(d3.attachTooltip)

    util.ggPlot(c, 0)
    util.addAxisLabel(c, 'model_size', 'MAE', 30, -35)
  }
})

