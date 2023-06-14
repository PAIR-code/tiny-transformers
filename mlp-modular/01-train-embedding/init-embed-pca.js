window.initEmbedPCA = async function(){
  var sx = 4

  var {data, shape} = visState.model.embedding
  var c = d3.conventions({
    sel: d3.select('.embed-pca').html(''),
    width:  300,
    height: 300,
  })

  c.yAxis.ticks(5)
  c.xAxis.ticks(5)
  d3.drawAxis(c)
  util.ggPlot(c)
  c.svg.selectAll('text').remove()

  c.svg.append('text')
    .at({y: -5, fontSize: 12})
    .text('Embedding 2d PCA')

  var stepLabelSel = c.svg.append('text')
    .at({textAnchor: 'end', x: c.width, y: -5, fontSize: 12})

  var numSel = c.svg.appendMany('text', d3.range(shape[1]))
    .text(d => d)
    .at({textAnchor: 'middle', dy: '.33em', fontSize: 12})

  renderAll.stepFns.push(render)

  function render(){
    stepLabelSel.text('Step ' + d3.format('06,')(visState.stepIndex*100))

    var stepSize = shape[1]*shape[2]
    var slicedData = data.slice(stepSize*visState.stepIndex, stepSize*(visState.stepIndex + 1))

    var array2d = reshapeArray(slicedData, [shape[1], shape[2]])
    var vectors = PCA.getEigenVectors(PCA.transpose(array2d))

    var xVec = vectors[0].vector
    var yVec = vectors[1].vector
    c.x.domain(d3.extent(xVec))
    c.y.domain(d3.extent(yVec))

    numSel.translate(i => [c.x(xVec[i]), c.y(yVec[i])])
  }
  // render()


  function reshapeArray(data, [rows, cols]) {
      return Array.from({length: rows}, (_, i) => 
        Array.from(data.slice(i*cols, (i + 1)*cols)))
  }
}


if (window.init) window.init()