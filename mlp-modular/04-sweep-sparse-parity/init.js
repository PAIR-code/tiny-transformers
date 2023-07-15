/* Copyright 2023 Google LLC. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

window.visState = window.visStatex || {
  maxRatio: 50000,
  minEvalLoss: .00001,

  key_row: '',
  key_col: 'weight_decay',
  key_x: 'hidden_size',
  key_y: 'train_size',

  sweepSlug: 'xm_gpu_sparse_parity_v2',
  sweepSlug: 'sparse_parity_w_init',
  sweepSlug: 'sparse_parity_tiny_model',
  // sweepSlug: 'sparse_parity_v4',
}


if (visState.sweepSlug == 'xm_gpu_sparse_parity_v2'){
  window.hyper_sweep = {
    "seed": d3.range(9),
    "weight_decay": [1e-0, 1e-1, 1e-2, 1e-3, 1e-4, 1e-5],
    "hidden_size": [8, 16, 32, 64, 128],
    "train_size": [250, 500, 1000, 1500, 2000],
  }
} else if (visState.sweepSlug == 'sparse_parity_w_init'){
  visState.key_x = 'w_init_scale'
  window.hyper_sweep = {
    "seed": d3.range(9),
    "weight_decay": [1e-2, 3e-2, 1e-1, 3e-1, 1e-0],
    "w_init_scale": [.1, .3, 1, 3, 10],
    "train_size": [750, 1000, 1250, 1500, 1750],
  }
} else if (visState.sweepSlug == 'sparse_parity_tiny_model'){
  window.hyper_sweep = {
    "seed": d3.range(9),
    "weight_decay": [1e-2, 3e-2, 1e-1, 3e-1, 1e-0].reverse(),
    "hidden_size": [4, 8, 12, 16, 20],
    "train_size": [750, 1000, 1250, 1500, 1750],
  }
} else {
  window.hyper_sweep = {
    "seed": d3.range(9),
    "weight_decay": [1e-2, 3e-2, 1e-1, 3e-1, 1e-0].reverse(),
    "hidden_size": [16, 32, 64, 128, 258],
    "train_size": [750, 1000, 1250, 1500, 1750],
  }
} 


window.initRenderAll = function(){
  var rv = {colorFns: [], hoverFns: []}

  d3.entries(rv).forEach(({key, value}) => {
    rv[key.replace('Fns', '')] = () => value.forEach(d => d())
  })

  return rv
}


d3.loadData(`data__hypers_${visState.sweepSlug}.csv`, 'hyper_shared.json', (err, res) => {
  console.clear()

  window.data = {models: res[0], sharedHyper: res[1]}

  if (!window.visState.hovered) visState.hovered = data.models[0]

  d3.select('.parity-sweep').html(`
    <div class='left-col'>
      <div class='model-grid'></div>
      <br>
      <div class='legend'></div>
      <div class='sliders-container'></div>
    </div>

    <div class='right-col'>
      <div class='line-charts'></div>
      <div class='line-chart-hyper'></div>
    </div>
  `)

  window.renderAll = initRenderAll()
  drawSliders()
  drawLineCharts()
  drawLegend()

  d3.select('.model-grid').html('')
    .appendMany('div.lr-row', d3.nestBy(_.sortBy(data.models, d => +d[visState.key_row]), d => d[visState.key_row]))
    .appendMany('div.chart-div', d => d3.nestBy(_.sortBy(d, d => -+d[visState.key_col]), d => d[visState.key_col]))
    .each(drawGridChart)

  renderAll.color()
  renderAll.hover()
})


function drawLegend(){
  var items = [
    {text: 'High Test Loss', minTrainLoss: 100},
    {text: 'High Train Loss', minEvalLoss: 100},
    {text: 'Train/Test Drop Together', maxRatio: 0},
    {text: 'Grokking', maxRatio: 1e10},
  ]
  
  var itemSel = d3.select('.legend').html('')
    .append('div')//.st({width: '100%'})
    .st({display: 'inline-block', marginBottom: 10})
    .appendMany('div', items)
    .st({marginBottom: 10, textAlign: 'left', fontSize: 12})

  itemSel.append('div')
    .st({outline: '1px solid #000', width: 10, height: 10, borderRadius: 10, background: circleFillFn, marginRight: 3})

  itemSel.append('div').text(d => d.text).st({marginRight: 15})
}

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
      <div class='axis-label'>
        ${slider.label} 
      </div>
      <div>
        <input type=range min=0 max=1 step=.0001 value=${slider.scale.invert(slider.getVal())}></input>
      </div>
      <div>
       <val class='axis-label'></val>
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

function drawLineCharts(){
  d3.select('.line-charts').html('').st({width: 330, margin: '0px auto'})
    .appendMany('div', d3.range(9)).st({display: 'inline-block'})
    .each(drawChart)

  window.renderAll.hoverFns.push(() => {
    var h = visState.hovered 
    d3.select('.line-chart-hyper').html(`
      ${visState.key_x}: <b>${h[visState.key_x]}</b><br>
      ${visState.key_y}: <b>${h[visState.key_y]}</b><br>
      ${visState.key_col}: <b>${h[visState.key_col]}</b><br>
      ${visState.key_row}: <b>${h[visState.key_row]}</b><br>
    `)
  })

  function drawChart(chartIndex){
    var c = d3.conventions({
      sel: d3.select(this).append('div'),
      width: 80,
      height: 40,
      margin: {right: 0, top: 20, bottom: 10}
    })

    c.x.domain([0, data.sharedHyper.max_steps])
    c.y = d3.scaleLog().domain([1e0, 1e-8]).range([0, c.height])

    c.xAxis.ticks(3).tickFormat(d => d/1000 + 'k')
    c.yAxis = d3.axisLeft(c.y).ticks(6)

    d3.drawAxis(c)
    util.ggPlot(c)
    c.svg.selectAll('.y text').st({opacity: d => +[1, 1e-4, 1e-8].includes(d)})
    c.svg.selectAll('.x text').at({y: 4})

    util.addAxisLabel(c, 'steps', 'loss', 20, -24)
    if (chartIndex % 3) c.svg.selectAll('.y text').remove()


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
      var root = `${sharedUtil.getRoot()}/sparse_parity/${visState.sweepSlug}`
      var metrics = await (await fetch(`${root}/${m.slug}/metrics.json`)).json()

      clearTimeout(timeoutId)
      trainPathSel.at({d: line.y(d => c.y(d.train_loss))(metrics)})
      testPathSel.at({d: line.y(d => c.y(d.eval_loss))(metrics)})
    })
  }
}

function drawGridChart(models, i){
  var sel = d3.select(this)

  var c = d3.conventions({
    sel: sel.append('div'),
    width: 90,
    height: 90,
    margin: {left: 10, right: 0}
  })

  c.x = d3.scaleBand().range([0, c.width]) .domain(hyper_sweep[visState.key_x])
  c.y = d3.scaleBand().range([0, c.height]).domain(hyper_sweep[visState.key_y])

  c.xAxis = d3.axisBottom(c.x).tickValues(hyper_sweep[visState.key_x])
    .tickFormat(d => d)
    // .tickFormat(d => d3.format('.0e')(d))
  c.yAxis = d3.axisLeft(c.y).tickValues(hyper_sweep[visState.key_y])
    .tickFormat(d => d)
  d3.drawAxis(c)

  c.svg.selectAll('.axis line').remove()
  c.svg.selectAll('.y text').at({x: 0})
  c.svg.selectAll('.x text').at({y: 2})
  util.addAxisLabel(c, visState.key_x, visState.key_y, 18, -24)
  if (i) c.svg.select('.y').remove()

  // c.svg.append('text.axis-label').text('e: ' + models[0][visState.key_row])
  //   .translate([0, -2])

  c.svg.append('text.axis-label')
    .text(visState.key_col.replace('weight_decay', 'Weight Decay') + ': ' + d3.format('.2f')(models[0][visState.key_col]))
    .translate([c.width/2, -2])
    .at({textAnchor: 'middle'}).st({fontSize: 10})

  var diam = 5
  var circleSel = c.svg.appendMany('circle', models)
    .at({r: diam/2, stroke: '#333', cx: d => c.x(d[visState.key_x]), cy: d => c.y(d[visState.key_y])})
    .call(d3.attachTooltip)
    .translate(d => [diam*Math.floor(d.seed/3) + diam, diam*(d.seed % 3) + diam])
    .on('mouseover', d => {
      visState.hovered = d

      d3.selectAll('circle').classed('is-hovered', 0)
      circleSel.classed('is-hovered', isHoveredFn)
      renderAll.hover()
    })

  renderAll.colorFns.push(d => {
    circleSel.at({fill: circleFillFn})
  })
}


function isHoveredFn(d){
  var h = visState.hovered 
  return d[visState.key_row] == h[visState.key_row] && 
    d[visState.key_col] == h[visState.key_col] && 
    d[visState.key_x] == h[visState.key_x] && 
    d[visState.key_y] == h[visState.key_y]
}

function circleFillFn(d){
  if (d.minTrainLoss > visState.minEvalLoss) return '#aaa'
  if (d.minEvalLoss > visState.minEvalLoss) return '#fff'
  if (d.maxRatio < visState.maxRatio) return '#faec84'

  return 'green'
}