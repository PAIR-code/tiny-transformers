window.initEmbedLineVis = async function(){
  var sx = 4

  var {data, shape} = visState.model.embedding
  var c = d3.conventions({
    sel: d3.select('.embed-line-vis').html(''),
    width:  shape[1]*sx,
    height: 300,
    margin: {top: 40},
  })

  c.x.domain([0, shape[1] - 1])
  c.y.domain([0, shape[2] - 1])

  c.yAxis.ticks(5)
  d3.drawAxis(c)
  util.ggPlot(c)

  var typeLabelSel = c.svg.append('text')
    .at({y: -5, fontSize: 12})
    .text('Each embedding indice as an offset line — x pos is token index')

  var stepLabelSel = c.svg.append('text')
    .at({textAnchor: 'end', x: c.width, y: -5, fontSize: 12})


  var lineData = d3.range(shape[2]).map(i => ({i, vals: []}))
  var lineSel = c.svg.appendMany('path', lineData)
    .at({stroke: '#000', fill: 'none', strokeWidth: 1})
    .translate((d, i) => c.y(i), 1)
  var line = d3.line().x((d, i) => c.x(i)).y(d => d*5)

  renderAll.stepFns.push(render)

  function render(){
    stepLabelSel.text('Step ' + d3.format('06,')(visState.stepIndex*100))

    var offset = shape[1]*shape[2]*visState.stepIndex
    for (var i = 0; i < shape[1]; i++){
      for (var j = 0; j < shape[2]; j++){
        var index = offset + shape[2]*i + j
        lineData[j].vals[i] = data[index]
      }
    }

    lineSel.at({d: d => line(d.vals)})
  }
  render()
}


if (window.init) window.init()