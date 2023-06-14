window.initTopPrediction = async function(){
  var s = 2
  var {n_tokens, embed_size} = visState.hyper_shared

  var c = d3.conventions({
    sel: d3.select('.top-prediction').html(''),
    height: s*n_tokens,
    width: s*n_tokens,
    layers: 'cs',
  })

  c.svg.append('text').at({y: -5, fontSize: 12})
    .text('Prediction argmax')

  var stepLabelSel = c.svg.append('text')
    .at({textAnchor: 'end', x: c.width, y: -5, fontSize: 12})

  c.x.domain([0, n_tokens - 1])
  c.y.domain([0, n_tokens - 1])
  d3.drawAxis(c)

  var color = d => d3.interpolateRainbow(d/n_tokens)

  var weights = {}
  function updateSlice(){
    weights = {
      'embedding': util.getSlice('embedding', visState.stepIndex),
      'hidden': util.getSlice('hidden', visState.stepIndex),
      'output': util.getSlice('output', visState.stepIndex),
    }
  }

  function model(x){
    var oneHotIds = tf.oneHot(x, n_tokens)
    var embedded = tf.matMul(oneHotIds, weights.embedding)
    var inputs = tf.reshape(embedded, [x.shape[0], embed_size*2])

    var hidden = inputs.matMul(weights.hidden).relu()
    var output = hidden.matMul(weights.output)
    var logits = output.matMul(weights.embedding.transpose())
    var softmax = logits.softmax()
    return {hidden, output, logits, softmax}
  }

  var xTensor = tf.tensor2d(d3.cross(d3.range(n_tokens), d3.range(n_tokens)), [n_tokens*n_tokens, 2], 'int32')

  function render(){
    stepLabelSel.text('Step ' + d3.format('06,')(visState.stepIndex*100))
    
    var ctx = c.layers[0]
    tf.tidy(() => {
      updateSlice()
      var argmax = model(xTensor).logits.argMax(-1).arraySync()
      for (var i = 0; i < n_tokens; i++){
        for (var j = 0; j < n_tokens; j++){
          var index = n_tokens*i + j

          ctx.beginPath()
          ctx.fillStyle = color(argmax[index])
          ctx.rect(i*s, (n_tokens- j)*s, s, s)
          ctx.fill()
        }
      }
    })
  }
  renderAll.stepFns.push(render)
  render()


}
window.init?.()


