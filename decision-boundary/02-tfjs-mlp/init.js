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

console.clear()


var nInputs = 2

function generateBatch(batchSize){
  var boundries = d3.range(batchSize).map(d => Math.random())
  var xVals = boundries.map(boundry => {
    var trainPositions = d3.range(nInputs).map(d => Math.random())
    // percent of right inputs
    var ratio = d3.mean(trainPositions, d => boundry < d)
    // position to predict
    var nextPostion = Math.random()
    return trainPositions.concat([ratio, nextPostion])
  })

  var yVals = xVals.map((xVal, i) => boundries[i] < xVal[nInputs + 1])

  var xTensor = tf.tensor2d(xVals, [batchSize, nInputs + 2])
  var yTensor = tf.tensor2d(yVals, [batchSize, 1])

  return {boundries, xVals, yVals, xTensor, yTensor}
}


function model(x) {
  var {w1, b1, w2, b2, w3, b3, wl, bl} = modelWeights
  return x.matMul(w1).add(b1).sigmoid()
  // return x.matMul(w1).add(b1).relu().matMul(w2).add(b2).sigmoid()
  return x.matMul(w1).add(b1).relu().matMul(w2).add(b2).relu().matMul(w3).add(b3).relu().matMul(wl).add(bl).sigmoid()
}

async function trainModel(){
  for (var i = 0; i < 2; i++){
    var numSteps = 100
    await util.sleep(1)
    window.modelInput.render()
    d3.range(numSteps).forEach(trainStep => {
      var outerIndex = i
      tf.train.sgd(.01).minimize(() => {
        var {xTensor, yTensor} = generateBatch(300)

        var predYs = model(xTensor)
        // huberLoss hingeLoss meanSquaredError
        var loss = tf.losses.meanSquaredError(yTensor, predYs)
        if (trainStep == 0){
          loss.data().then(l => console.log('Loss ' + numSteps*outerIndex, l[0]));
        }
        return loss
      })
    })
  }
}

window.init = async function(){
  window.predictionChart = initPredictionChart()
  window.modelInput = await initModelInput(predictionChart.render)


  // var modelWeights = window.modelWeights
  if (!window.modelWeights){
    window.modelWeights = {

      // w1: tf.variable(tf.tensor2d([-6.4843232, -5.95615277, 10.49628918, 12.95499446], [4, 1])),
      // b1: tf.variable(tf.tensor2d([-5.95215811], [1, 1])),

      w1: tf.variable(tf.tensor2d([-8.31591105, -7.78754991, 12.07081962, 17.61917673], [4, 1])),
      b1: tf.variable(tf.tensor2d([-7.20030321], [1, 1])),

      // w1: tf.variable(tf.randomNormal([nInputs + 2, 1])),
      // b1: tf.variable(tf.randomNormal([1])),


      // w1: tf.variable(tf.randomNormal([nInputs + 2, 10])),
      // b1: tf.variable(tf.randomNormal([10])),

      // w2: tf.variable(tf.randomNormal([10, 8])),
      // b2: tf.variable(tf.randomNormal([8])),

      // w3: tf.variable(tf.randomNormal([8, 8])),
      // b3: tf.variable(tf.randomNormal([8])),

      // wl: tf.variable(tf.randomNormal([8, 1])),
      // bl: tf.variable(tf.randomNormal([1])),
    }

    // console.log('training...')
    // trainModel()
    // TODO await training
    // await util.sleep(3)
    console.log('training done?')
  }
// [[-6.4843232  -5.95615277 12.95499446 10.49628918]] [-5.95215811]


  window.modelInput.render()

}

init()



function initPredictionChart(){
  var hyper = {n_num_tokens: 100, sequence_length: nInputs + 1}

  var c = d3.conventions({
    sel: d3.select('.predictions').html('').append('div'),
    height: 200,
    width: 200,
    margin: {left: 50, bottom: 30}
  })

  c.y.domain([0, 1])
  c.x.domain([0, hyper.n_num_tokens - 1])

  c.yAxis.tickFormat(d3.format('.0%'))

  d3.drawAxis(c)
  util.ggPlot(c, 0)
  util.addAxisLabel(c, '', 'Prediction')


  var circleSel = c.svg.appendMany('circle', d3.range(hyper.n_num_tokens))
    .at({
      r: 2, 
      cx: c.x,
    })


  async function render(){
    if (!window.modelInput) await util.sleep(1)
    var xPos = modelInput.xPositions.map(d => d.v/100)
    lastPos = xPos.pop()

    function makeXVal(xPos, boundary, lastPos){
      var ratio = d3.mean(xPos, d => boundary/100 < d)
      return xPos.concat([ratio, lastPos])
    }
    var origXVals = makeXVal(xPos, modelInput.boundary.v, lastPos)
    // var xTensor = tf.tensor2d(origXVals, [1, nInputs + 2])
    // var prediction = model(xTensor)
    console.log(origXVals)


    var xVals = d3.range(0, 1, .01).map(d => {
      var rv = origXVals.slice()
      rv[nInputs + 1] = d
      return rv
    })
    var xTensor = tf.tensor2d(xVals, [100, nInputs + 2])
    var prediction = model(xTensor).dataSync()

    circleSel.at({cy: i => c.y(prediction[i]), fill: i => i == lastPos*100 ? '#f0f' : '#000'})
  }

  return {render}
}


async function initModelInput(onChange){
  var hyper = {n_num_tokens: 100, sequence_length: nInputs + 1}

  var rv = {
    boundary: window.modelInput?.boundary || {v: 30},
    xPositions: window.modelInput?.xPositions || d3.range(hyper.sequence_length)
      .map(i => ({i: i, v: Math.round(Math.random()*hyper.n_num_tokens)})),
    onChange: onChange || (d => d),
  }
  rv.calcInput = function(){
    var input = rv.xPositions
      .map(d => [d.v, d.v < rv.boundary.v ? hyper.n_num_tokens : hyper.n_num_tokens + 1])

    input = _.flatten(input)
    input.pop() // Inputs have final prediction chopped off
    return input
  }

  var c = d3.conventions({
    sel: d3.select('.input').html('').append('div'),
    height: 100,
    width: 200,
    margin: {left: 50, bottom: 30}
  })

  c.y.domain([0, hyper.sequence_length - 1])
  c.x.domain([0, hyper.n_num_tokens - 1])

  c.yAxis.ticks(2)

  d3.drawAxis(c)
  util.ggPlot(c, 0)
  util.addAxisLabel(c, '', 'Input Index')

  var xPosSel = c.svg.appendMany('circle.x-draggable', rv.xPositions)
    .at({
      cy: d => c.y(d.i),
      r: 3,
      strokeWidth: 1,
      stroke: '#000'
    })
    .st({fill: (d, i) => i == hyper.sequence_length - 1 ? '#f0f' : ''})

  var boundarySel = c.svg.append('path.x-draggable')
    .at({strokeWidth: 4, d: `M 0 0 V ${c.height}`, stroke: '#000', opacity: .3})
    .datum(rv.boundary)

  var drag = d3.drag()
    .on('drag', function(d){

      d.v = Math.round(d3.clamp(0, c.x.invert(d3.mouse(c.svg.node())[0]), hyper.n_num_tokens - 1))
      render()
    })

  var xDraggableSel = c.svg.selectAll('.x-draggable')
    .call(drag).st({cursor: 'pointer'})

  function render(){
    xPosSel
      .at({fill: d => d.v < rv.boundary.v ? 'orange' : 'steelblue'})

    xDraggableSel.translate(d => c.x(d.v), 0)

    rv.onChange(rv.calcInput())
  }
  rv.render = render

  return rv
}

