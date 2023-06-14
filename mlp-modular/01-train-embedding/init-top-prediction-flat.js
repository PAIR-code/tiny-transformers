window.initTopPredictionFlat = async function(){
  var s = 1
  var count = 500
  var numSteps = visState.hyper_shared.max_steps/visState.hyper_shared.save_every
  numSteps = 300

  var {n_tokens, embed_size} = visState.hyper_shared

  var c = d3.conventions({
    sel: d3.select('.top-prediction-flat').html(''),
    height: s*count,
    width: s*numSteps,
    layers: 'sc',
  })

  c.svg.append('text').at({y: -5, fontSize: 12})
    .text('Prediction argmax over training w/ 500 pairs — lighter is closer')

  c.x.domain([0, count - 1])
  c.y.domain([0, numSteps - 1])

  c.xAxis.tickFormat(d => d/10 + 'k')
  d3.drawAxis(c)
  util.ggPlot(c)

  c.svg.selectAll('.y text').remove()

  var color = d => d3.interpolateInferno(1 - d/n_tokens)

  var weights = {}
  function updateSlice(stepIndex){
    weights = {
      'embedding': util.getSlice('embedding', stepIndex),
      'hidden': util.getSlice('hidden', stepIndex),
      'output': util.getSlice('output', stepIndex),
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

  var inputs = _.shuffle(d3.cross(d3.range(n_tokens), d3.range(n_tokens))).slice(0, count)
  var xTensor = tf.tensor2d(inputs, [count, 2], 'int32')
  inputs.forEach((d, i) => {
    d.correct = (d[0] + d[1]) % n_tokens
    d.origIndex = i
    d.lastWrong = 0
  })

  var steps = []
  function calcStep(step){
    tf.tidy(() => {
      updateSlice(step)
      var argmax = model(xTensor).logits.argMax(-1).arraySync()
      steps.push(argmax)
    })
  }
  d3.range(numSteps).forEach(calcStep)

  steps.forEach((step, stepIndex) => {
    step.forEach((v, i) => {
      if (v - inputs[i].correct) inputs[i].lastWrong = stepIndex
    })
  })
  inputs = _.sortBy(inputs, d => d.lastWrong)

  var ctx = c.layers[1]
  steps.forEach((step, stepIndex) => {
    for (var i = 0; i < count; i++){
      var input = inputs[i]
      var dif = Math.abs(step[input.origIndex] - input.correct)

      if (dif == 0) continue
      ctx.beginPath()
      ctx.fillStyle = dif == 0 ? '#ddd' : color(dif)
      ctx.rect(stepIndex*s, i*s, s, s)
      ctx.fill()
    }
  })


}
window.init?.()


  // function renderStep(step){
  //   var ctx = c.layers[1]
  //   tf.tidy(() => {
  //     updateSlice(step)
  //     var argmax = model(xTensor).logits.argMax(-1).arraySync()

  //     for (var i = 0; i < count; i++){
  //       ctx.beginPath()
  //       // var dif = (n_tokens + argmax[i] - inputs[i].correct) % n_tokens
  //       var dif = Math.abs(argmax[i] - inputs[i].correct)
  //       ctx.fillStyle = dif == 0 ? '#ddd' : color(dif)
  //       ctx.rect(step*s, i*s, s, s)
  //       ctx.fill()
  //     }
  //   })
  // }
