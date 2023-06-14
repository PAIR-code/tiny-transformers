window.initEmbedPCA3d = async function(){

  var {data, shape} = visState.model.embedding

  renderAll.stepFns.push(render)
  function render(){
    var stepSize = shape[1]*shape[2]
    var slicedData = data.slice(stepSize*visState.stepIndex, stepSize*(visState.stepIndex + 1))
    var array2d = reshapeArray(slicedData, [shape[1], shape[2]])
    var vectors = PCA.getEigenVectors(PCA.transpose(array2d))

    // Create a trace
    var trace = {
      x: vectors[0].vector,
      y: vectors[1].vector,
      z: vectors[2].vector,
      mode: 'markers+text',
      type: 'scatter3d',
      text: d3.range(shape[1]),
      textposition: 'top center',
      marker: { size: 2, color: 'blue'}
    }

    var layout = {
      autosize: false,
      width: 500,
      height: 500,
      margin: {l: 0,r: 0,b: 0,t: 0}
    }

    Plotly.react('embed-pca-3d', [trace], layout)
  }

  function reshapeArray(data, [rows, cols]) {
      return Array.from({length: rows}, (_, i) => 
        Array.from(data.slice(i*cols, (i + 1)*cols)))
  }

}

window.init?.()
