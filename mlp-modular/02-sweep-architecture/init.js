window.visState = window.visState || {
  maxRatio: 10000000,
  minEvalLoss: .00001,
  sweepSlug: 'xm_gpu_full_l1_architecture',
  sweepSlug: util.params.get('slug') || 'xm_gpu_full_l2_architecture_v2',
  is_symmetric_input: util.params.get('symmetric_input') || 'false'
}


visState.is_l1 = visState.sweepSlug.includes('full_l1')

d3.selectAll('.slugs a').classed('active', function(){
  var href = d3.select(this).attr('href')
  return href.includes(visState.sweepSlug) && href.includes(visState.is_symmetric_input)
})

window.hyper_sweep = {
  "sweep_slug": [visState.sweepSlug],
  "seed": [0, 1, 2, 3, 4, 5, 6, 7, 8],
  "learning_rate": [1e-2, 1e-3, 1e-4],
  "weight_decay": visState.is_l1 ? [1e-4, 1e-5, 1e-6, 1e-7, 1e-8] : [1, .3, .1, .03, .01],
  "weight_decay": visState.is_l1 ? [1e-7, 1e-8, 1e-9, 1e-10, 1e-11] : [1, .3, .1, .03, .01],
  "embed_size": [32, 64, 128, 256, 512],
  // "hidden_size": [64, 128, 256, 512, 1024],
}

window.initRenderAll = function(){
  var rv = {colorFns: [], hoverFns: [], typeFns: []}

  d3.entries(rv).forEach(({key, value}) => {
    rv[key.replace('Fns', '')] = () => value.forEach(d => d())
  })

  return rv
}


d3.loadData(`data__hypers_${visState.sweepSlug}.csv`, 'hyper_shared.json', (err, res) => {
  console.clear()
  window.data = {models: res[0], sharedHyper: res[1]}

  window.renderAll = initRenderAll()
  drawSliders()
  drawLineCharts()

  data.models.forEach(d => {
    d.minEvalLoss = +d.minEvalLoss
    d.minTrainLoss = +d.minTrainLoss
    d.maxRatio = +d.maxRatio
    d.weight_decay = +d.weight_decay
  })

  data.models = data.models
    .filter(d => d.is_symmetric_input == visState.is_symmetric_input)
    .filter(d => hyper_sweep.weight_decay.includes(d.weight_decay))


  // regularization is_symmetric_input
  var fields = 'embed_config is_tied_hidden is_collapsed_hidden is_collapsed_out'.split(' ')
  data.models.forEach(d => {
    d.type = fields.map(key => key + ': ' + d[key]).join(' ')
    d.typeHTML = fields.map(key => `<span class='key-val'>${key} <b>${d[key]}</b></span>`)
      .join('')
      .replaceAll('is_', ' ')
      .replaceAll('_config', '')
  })


  window.byType = d3.nestBy(_.sortBy(data.models, d => d.embed_config == 'tied' ? 'a' + d.type : d.type), d => d.type)

  d3.select('.type-grid').html('')
    .appendMany('div.lr-row', d3.nestBy(byType, d => d[0].embed_config)).st({width: 430, margin: '0px auto'})
    .append('div.type-label').html(d => `embedding: <b>${d[0][0].embed_config}`).st({marginBottom: 0, marginTop: 0}).parent()
    .appendMany('div.chart-div', d => d3.nestBy(d, d => d[0].is_tied_hidden))
    .each(drawTypeGrid)

  var typeRowSel = d3.select('.model-grid').html('')
    .appendMany('div.lr-row', byType)
    .append('div.type-label').html(d => d[0].typeHTML).st({marginTop: 20}).parent()
  
  typeRowSel.appendMany('div.chart-div', d => d3.nestBy(_.sortBy(d, d => +d.hidden_size), d => d.hidden_size))
    .each(drawGridChart)

  renderAll.typeFns.push(() => {
    typeRowSel.st({display: d => d.key == visState.hoveredType ? '' : 'none'})
  })


  if (!window.visState.hovered) visState.hovered = data.models[2001]
  if (!window.visState.hoveredType) visState.hoveredType = data.models[2001].type

  renderAll.type()
  renderAll.color()
  renderAll.hover()
})


function drawSliders(){
  var sel = d3.select('.sliders-container').html('')

  var sliders = [
    {
      scale: d3.scalePow().range([1e-8, 1]).exponent(10),
      sel: sel.append('div.slider'),
      label: 'Min Test Loss',
      getVal: d => visState.minEvalLoss,
      setVal: d => visState.minEvalLoss = d,
      fmt: d3.format('.2e')
    },
    {
      scale: d3.scalePow().range([1, 1e8]).exponent(10),
      sel: sel.append('div.slider'),
      label: 'Max Test/Train Loss Ratio',
      getVal: d => visState.maxRatio,
      setVal: d => visState.maxRatio = d,
      fmt: d3.format('.2e')
    },
  ]

  sliders.forEach(slider => {
    slider.sel.html(`
      <div>
        ${slider.label} <val></val>
      </div>
      <div>
        <input type=range min=0 max=1 step=.0001 value=${slider.scale.invert(slider.getVal())}></input>
      </div>
    `)
    slider.sel.select('input[type="range"]')
      .on('input', function () {
        slider.setVal(slider.scale(this.value))
        render()
        renderAll.color()
      })

    function render(){ slider.sel.select('val').text(slider.fmt(slider.getVal())) }
    render()
  })
}

function drawTypeGrid(types){
  var sel = d3.select(this)

  sel.append('div.type-label')
    .html('tied_hidden: <b>' + types[0][0].is_tied_hidden + '</b>')

  var pad = 10
  var rw = 80
  var rh = 15

  var c = d3.conventions({
    sel: sel.append('div'),
    width: rw*2 + pad,
    height: rh*2 + pad,
    layers: 'ds',
    margin: {top: 5, bottom: 40}
  })

  c.svg.append('g.x.axis')
    .translate(c.height + 12, 1)
    .appendMany('text', ['T', 'F'])
    .text(d => d)
    .translate((d, i) => i ? rw/2 : rw + pad + rw/2, 0)

  c.svg.append('g.y.axis')
    .translate(-8, 0)
    .appendMany('text', ['T', 'F'])
    .text(d => d)
    .translate((d, i) => i ? rh/2 : rh + pad + rh/2, 1)
    .at({dy: '.33em'})

  util.addAxisLabel(c, 'collapsed_hidden', 'collapsed_out', 8, -6)

  if (types[0][0].is_tied_hidden == 'true') c.svg.select('.y').remove()

  var typeSel = c.svg.appendMany('g', types)
    .translate(d => [
      d[0].is_collapsed_hidden == 'false' ? .5 : rw + pad + .5,
      d[0].is_collapsed_out == 'false' ? .5 : rh + pad + .5,
    ])
    .on('mouseover', d => {
      visState.hoveredType = d[0].type

      visState.hovered = JSON.parse(JSON.stringify(visState.hovered))
      visState.hovered.type = visState.hoveredType
      renderAll.type()
    })

  types.forEach(type => {
    var rectData = type.rectData = ['#fff', '#faec84', 'green'].map((key, i) => ({key, i, count: 0}))
    rectData.lookup = {}
    rectData.forEach(d => rectData.lookup[d.key] = d)
  })

  var bgRectSel = typeSel.append('rect')
    .at({width: rw, height: rh, stroke: '#000', fill: '#fff'})

  var rectSel = typeSel.appendMany('rect', d => d.rectData)
    .at({height: rh, fill: d => d.key, width: 20})

  renderAll.typeFns.push(() => {
    bgRectSel.at({strokeWidth: d => visState.hoveredType == d.key ? 3 : 1})

    renderAll.hover()
  })

  renderAll.colorFns.push(() => {
    types.forEach(type => {
      var rectData = type.rectData
      rectData.forEach(d => d.count = 0)

      type.forEach(d => {
        rectData.lookup[colorFn(d)].count++
      })

      rectData.forEach(d => d.percent = d.count/d3.sum(rectData, d => d.count))

      var prev = 0
      rectData.forEach(d => {
        d.prev = prev
        prev += d.percent
      })
    })

    rectSel.at({width: d => d.percent*rw, x: d => d.prev*rw})
  })

}

function drawGridChart(models){
  var sel = d3.select(this)

  var c = d3.conventions({
    sel: sel.append('div'),
    width: 100,
    height: 60,
    margin: {left: 10, right: 8}
  })

  var xKey = 'weight_decay'
  var yKey = 'learning_rate'
  
  c.x = d3.scaleBand().range([0, c.width]).domain(hyper_sweep[xKey])
  c.y = d3.scaleBand().range([0, c.height]).domain(hyper_sweep[yKey])

  c.xAxis = d3.axisBottom(c.x)
    .tickValues(hyper_sweep[xKey]).tickFormat(visState.is_l1 || xKey == 'learning_rate' ? d3.format('.0e') : d => d)
  c.yAxis = d3.axisLeft(c.y)
    .tickValues(hyper_sweep[yKey]).tickFormat(visState.is_l1 || yKey == 'learning_rate' ? d3.format('.0e') : d => d)

  d3.drawAxis(c)

  c.svg.selectAll('.axis line').remove()
  c.svg.selectAll('.y text').at({x: 0})
  c.svg.selectAll('.x text').at({y: 2})
  util.addAxisLabel(c, xKey, models[0].embed_size == 32 ? yKey : '', 18, -20)
  if (models[0].embed_size != 32) c.svg.selectAll('.y').remove()

  c.svg.append('text.axis-label').text('dim: ' + models[0].embed_size)
    .translate([c.width/2, -2]).at({textAnchor: 'middle'})

  var circleSel = c.svg.appendMany('circle', models)
    .at({r: 2.5, stroke: '#333', cx: d => c.x(d[xKey]), cy: d => c.y(d[yKey])})
    .call(d3.attachTooltip)
    .translate(d => [5*Math.floor(d.seed/3) + 5, 5*(d.seed % 3) + 5])
    .on('mouseover', d => {
      visState.hovered = d

      renderAll.hover()
    })

  renderAll.hoverFns.push(() => {
    circleSel.classed('is-hovered', isHoveredFn)
  })

  renderAll.colorFns.push(() => {
    circleSel.at({fill: colorFn})
  })
}

function drawLineCharts(){
  d3.select('.line-charts').html('').st({width: 580})
    .appendMany('div', d3.range(9)).st({display: 'inline-block'})
    .each(drawChart)

  window.renderAll.hoverFns.push(() => {
    var h = visState.hovered 
    d3.select('.line-chart-hyper').html(`
      embed_size: <b>${h.embed_size}</b><br>
      hidden_size: <b>${h.hidden_size}</b><br>
      learning_rate: <b>${h.learning_rate}</b><br>
      weight_decay: <b>${h.weight_decay}</b><br>
    `)
  })

  function drawChart(chartIndex){
    var c = d3.conventions({
      sel: d3.select(this).append('div'),
      width: 150,
      height: 150,
    })

    c.x.domain([0, data.sharedHyper.max_steps])
    c.y = d3.scaleLog().domain([1e5, 1e-9]).range([0, c.height])

    c.xAxis.ticks(3).tickFormat(d => d/1000 + 'k')
    c.yAxis = d3.axisLeft(c.y).ticks(5)

    d3.drawAxis(c)
    util.ggPlot(c)

    util.addAxisLabel(c, 'steps', 'loss', 25, -24)

    var line = d3.line().x(d => c.x(d.step))

    var trainPathSel = c.svg.append('path')
      .at({strokeWidth: 2, stroke: 'orange', fill: 'none'})
    var testPathSel = c.svg.append('path')
      .at({strokeWidth: 2, stroke: 'steelblue', fill: 'none'})

    window.renderAll.hoverFns.push(async () => {
      var timeoutId = setTimeout(() => {
        trainPathSel.at({d: 'M 0 0'})
        testPathSel.at({d: 'M 0 0'})
      }, 300)

      var m = data.models.filter(isHoveredFn)[chartIndex]
      if (!m) return
      var root = `../../local-data/mlp_modular/${visState.sweepSlug}`
      var metrics = await (await fetch(`${root}/${m.slug}/metrics.json`)).json()

      clearTimeout(timeoutId)
      trainPathSel.at({d: line.y(d => c.y(d.train_loss))(metrics)})
      testPathSel.at({d: line.y(d => c.y(d.eval_loss))(metrics)})
    })
  }
}

function isHoveredFn(d){
  var h = visState.hovered 
  return d.embed_size == h.embed_size && 
    d.hidden_size == h.hidden_size && 
    d.learning_rate == h.learning_rate && 
    d.weight_decay == h.weight_decay && 
    d.type == h.type
}

function colorFn(d){
  return d.minEvalLoss > visState.minEvalLoss ? '#fff' : d.maxRatio > visState.maxRatio ? 'green' : '#faec84'
}