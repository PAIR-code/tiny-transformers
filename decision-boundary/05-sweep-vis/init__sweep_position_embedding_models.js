d3.loadData('data__sweep_position_embedding_models.json', (err, res) => {
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

  var sel = d3.select('.sweep_position_embedding_models').html('')
  sel.append('div')
    .append('div').html(`
      <p>${hyper_sweep.position_embedding.map(d =>
        `<span style='margin-right:2px;padding:4px;outline:2px solid ${color(d)}'>${d}</span>`
      ).join(' ')}
      <p>With fixed token embeddings and only a single layer, only fixed_one_hot works as well as trained position embeddings.</p>
    `).parent()
    .appendMany('div.row', d3.nestBy(models, d => d.hyper.num_layers))
    .appendMany('div', models => d3.nestBy(models, d => d.hyper.num_heads))
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

    var {num_heads, num_layers} = models[0].hyper

    c.svg.append('g.axis').append('text.axis-label')
      .text('layers: ' + num_layers + ' — heads: ' + num_heads)
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

