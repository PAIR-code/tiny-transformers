// https://colab.research.google.com/drive/1cHjJbvQnE98N1EkM0vGE5W2S96U1Q8Td?resourcekey=0-v5KmuJ_LtwhE08psAmXRzQ#scrollTo=28oO440u0raM

window.init_sweep_loss_only_last_v3_ = async function(){
  var sweep_slug = 'sweep_loss_only_last_v3_'
  var hyper_sweep = {
    "seeds": [1, 2, 3, 4, 5, 6, 7],
    "dropout_rate": [0, .2, .4, .6, .8],
    "weight_decay": [0, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1],
    "vocab_embedding": ["trained_untied", "trained"],
  }

  var models = await util.getFile(`../05-sweep-vis/data__${sweep_slug}models.json`)
  models = models.map(d => {
    var rv = {...d, ...d.hyper, ...d.metrics}
    rv.slug = {name: d.slug}
    return rv
  })
  models.forEach(d => {
    d.weight_decay = d3.format('.0e')(d.weight_decay).replace('0e+0', 0)
  })
  models = _.sortBy(models, d => d.weight_decay == 0 ? 'z' : d.weight_decay)//.reverse()

  models.forEach(d => d.sweepModels = models)
  models.hyper_sweep = hyper_sweep
  models.sweep_slug = sweep_slug


  var sel = d3.select('.' + sweep_slug).html('')
  sel.append('div')
    .appendMany('div.row', [models])
    .appendMany('div', models => d3.nestBy(models, d => d.hyper.weight_decay).reverse())
    .each(function(d){ drawChart.call(this, d, {yScale: .05})})
    .st({display: 'inline-block'})


  function drawChart(models, settings){
    var settings = { ...{yScale: .1}, ...settings}
    var hyper_sweep = models[0].sweepModels.hyper_sweep

    var c = d3.conventions({
      sel: d3.select(this),
      height: 150, 
      width: 150,
      margin: {left: 45, bottom: 35}
    })

    var {weight_decay} = models[0]

    c.x.domain(d3.extent(hyper_sweep.dropout_rate))
    c.y.domain([0, settings.yScale]).clamp(0)

    c.xAxis = d3.axisBottom(c.x).tickValues(hyper_sweep.dropout_rate).tickFormat(d => ('' + d).replace('0.', '.'))
    c.yAxis.ticks(5)
    d3.drawAxis(c)

    c.svg.append('g.axis').append('text.axis-label')
      .text('weight decay: ' + weight_decay)
      .at({textAnchor: 'middle'}).translate([c.width/2, -2])

    d3.nestBy(models, d => d.dropout_rate).forEach(hoverGroup => {
      hoverGroup.forEach(d => d.hoverGroup = hoverGroup)
    })
    var modelSel = c.svg.appendMany('circle.model', models)
      .translate(d => [c.x(d.dropout_rate), c.y(d.metrics.MAE)])
      .at({
        r: 3, 
        cx: d => Math.random()*2*1 - 1,
        stroke: d => modelColor(d.vocab_embedding),
        fillOpacity: 0,
        strokeWidth: 1.5,
      })
      // .call(d3.attachTooltip)
      .on('mouseover', window.updateActiveModels)

    util.ggPlot(c, 0)
    util.addAxisLabel(c, 'dropout_rate', 'MAE', 30, -35)
  }
}


if (window.init) window.init()
