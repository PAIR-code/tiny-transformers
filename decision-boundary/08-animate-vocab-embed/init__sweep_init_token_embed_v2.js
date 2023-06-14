window.initSweepInitTokenEmbed = async function(){
  var sweep_slug = 'sweep_init_token_embed_v2_'
  var hyper_sweep = {
    "seeds": [1, 2, 3, 4, 5],
    "vocab_embedding": ["trained_tied", "trained_untied"],
    "init_weight": [.001, .003, .01, .03, .1, .3, 1],
    "init_token_embedding_matrix": ["random", "trained_tied",  "trained_untied_embed", "trained_untied_unembed", "trained_untied_both"]
  }

  var models = await util.getFile(`../05-sweep-vis/data__${sweep_slug}models.json`)
  models = models.map(d => {
    var rv = {...d, ...d.hyper, ...d.metrics}
    rv.slug = {name: d.slug}
    return rv
  })
  models = _.sortBy(models, d => hyper_sweep.init_token_embedding_matrix.indexOf(d.init_token_embedding_matrix))

  models.forEach(d => d.sweepModels = models)
  models.hyper_sweep = hyper_sweep
  models.sweep_slug = sweep_slug


  var sel = d3.select('.' + sweep_slug).html('')
  sel.append('div')
    .append('div').html(`
      <p>${models.hyper_sweep.vocab_embedding.map(d =>
        `<span style='margin-right:2px;padding:4px;outline:2px solid ${modelColor(d)}'>${d}</span>`
      ).join(' ')}
    `).parent()
    .appendMany('div.row', d3.nestBy(models, d => d.hyper.num_heads))
    .appendMany('div', models => d3.nestBy(models, d => d.hyper.init_token_embedding_matrix))
    .each(function(d){ drawChart.call(this, d, {yScale: .05})})
    .st({display: 'inline-block'})

  // Only this one: update the active models
  window.updateActiveModels(models[0])

  function drawChart(models, settings){
    var settings = { ...{yScale: .1}, ...settings}
    var hyper_sweep = models[0].sweepModels.hyper_sweep

    var c = d3.conventions({
      sel: d3.select(this),
      height: 150, 
      width: 150,
      margin: {left: 45, bottom: 35}
    })

    var {has_mlp, has_layer_norm, init_token_embedding_matrix} = models[0].hyper

    c.x = d3.scaleLog().range([0, c.width]).domain(d3.extent(hyper_sweep.init_weight))
    c.y.domain([0, settings.yScale]).clamp(0)

    c.xAxis = d3.axisBottom(c.x).tickValues(hyper_sweep.init_weight).tickFormat(d => ('' + d).replace('0.', '.'))
    c.yAxis.ticks(5)
    d3.drawAxis(c)

    c.svg.append('g.axis').append('text.axis-label')
      .text(init_token_embedding_matrix)
      .at({textAnchor: 'middle'}).translate([c.width/2, -2])

    d3.nestBy(models, d => d.init_weight).forEach(hoverGroup => {
      hoverGroup.forEach(d => d.hoverGroup = hoverGroup)
    })
    var modelSel = c.svg.appendMany('circle.model', models)
      .translate(d => [c.x(d.init_weight), c.y(d.metrics.MAE)])
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
    util.addAxisLabel(c, 'init_weight', 'MAE', 30, -35)
  }
}


if (window.init) window.init()
