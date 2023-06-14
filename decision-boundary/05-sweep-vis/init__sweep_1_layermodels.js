d3.loadData('data__sweep_1_layermodels.json', (err, res) => {
  var models = res[0]
  models = models.map(d => {
    var rv = {...d, ...d.hyper, ...d.metrics}
    rv.slug = {name: d.slug}
    return rv
  })

  var sel = d3.select('.sweep_1_layermodels').html('')
  sel.append('div')
    .append('p').html(`
      Black: positional encodings &emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; Red: no positional encodings 
      <br>
      Solid: trained token embedding &emsp;&emsp;&emsp; Dashed: Fixed token embeddings
      <br>
      <br>
      No position embeddings with fixed token embeddings always has a high MAE.
      `)
    .parent()
    .appendMany('div', d3.nestBy(models, d => d.hyper.num_heads))
    .each(function(d){ drawChart.call(this, d, {yScale: .1})})
    .st({display: 'inline-block'})

  sel.append('div').st({marginTop: 50})
    .append('p').html(`
      Zooming in on the y-scale, turning off positional embeddings or trainable token embeddings doesn't have a huge impact on MAE as long as both aren't turned off at the same time.
      <br>
      <br>
      Accuracy could still go lower; model trained with 1,500,000 steps instead of 200,000 steps and embedding dim of 128 have a MAE of ~.003, something that holds on models with 1 to 8 layers.
      `)
    .parent()
    .appendMany('div', d3.nestBy(models, d => d.hyper.num_heads))
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

    c.svg.append('g.axis').append('text.axis-label').text('num_heads: ' + models.key).at({textAnchor: 'middle'}).translate([c.width/2, -2])

    c.x = d3.scaleLog().range([0, c.width]).domain([4, 64])
    c.y.domain([0, settings.yScale]).clamp(0)

    c.xAxis = d3.axisBottom(c.x).tickValues([4, 8, 16, 32, 64]).tickFormat(d => d)
    c.yAxis.ticks(5)
    d3.drawAxis(c)

    // models = models.filter(d => !d.hyper.has_fixed_vocab_embedding)

    var modelSel = c.svg.appendMany('circle', models)
      .translate(d => [c.x(d.hyper.model_size), c.y(d.metrics.MAE)])
      .at({
        r: 3, 
        cx: d => Math.random()*2*2 - 2,
        stroke: d => d.hyper.has_positional_encodings ? '#000' : 'red',
        fillOpacity: 0,
        strokeWidth: 2,
        strokeDasharray: d => d.hyper.has_fixed_vocab_embedding ? '1 1' : '',
        strokeWidth: d => d.hyper.has_fixed_vocab_embedding ? 2 : 1,
        // opacity: d => d.hyper.has_fixed_vocab_embedding ? .5 : 1,
        // strokeWidth: d => d.hyper.has_fixed_vocab_embedding ? 2 : 1,
        // stroke: d => d.hyper.has_fixed_vocab_embedding ? '#f0f' : '#000'
        // fill: d => d.hyper.has_fixed_vocab_embedding ? 'steelblue' : 'orange',
      })
      .call(d3.attachTooltip)

    util.ggPlot(c, 0)
    util.addAxisLabel(c, 'model_size', 'MAE', 30, -35)
  }
})

