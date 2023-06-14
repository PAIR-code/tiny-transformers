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
var nInputs = 3
var nextPosition = 50 

window.hyper = {n_num_tokens: 100, sequence_length: nInputs*2 + 1}

// Loss can be different for query token and numL
// Not sure why loss is so much higher than sklearn
// 5 is usually low — not sure why
// SGD is very slow to train

function generateBatch(batchSize){
  var xVals = d3.range(batchSize).map(() => 
    d3.range(nInputs).map(() => Math.floor(Math.random()*hyper.n_num_tokens)))

  xVals.forEach(xVal => {
    // xVal[0] = 0
    // xVal[1] = 100
    var boundary = Math.random()*100
    // xVal.numL = 1
    xVal.numL = d3.sum(xVal, d => d < boundary)
  })

  var targets = xVals.map(d => calcPercentTargets(d, d.numL, nextPosition))

  var inputs = xVals.map(xVal => {
    var labels = xVal.map((_, i) => i < xVal.numL ? hyper.n_num_tokens : hyper.n_num_tokens + 1)
    return xVal.concat(labels).concat(nextPosition)
  })

  var xTensor = tf.tensor2d(inputs, [batchSize, nInputs*2 + 1], 'int32')
  var yTensor = tf.tensor1d(targets)

  return {xVals, inputs, targets, xTensor, yTensor}


  function calcPercentTargets(xVal, numL, v) {
    // Calculates ground truth probabilities.
    var sortedX = _.sortBy(xVal, d => d)

    var maxL = numL == 0 ? -1 : sortedX[numL - 1]
    var minR = numL == nInputs ? hyper.n_num_tokens : sortedX[numL]

    var percentR = d3.clamp(0, (v - maxL) / (minR - maxL), 1)
    if (isNaN(percentR)) percentR = maxL == v ? .5 : v < maxL ? 0 : 1

    // percentR = percentR < .5 ? 0 : 1
    // percentR = maxL < 50 ? 0 : 1
    // if (Math.random() < .6) return Math.random()
    return percentR
  }
}
console.log(generateBatch(20).targets)


function model(x){
  return modelWeights.w1
    .gather(x)
    .sum(1)
    .sigmoid()
}

var fmt = d3.format('.3f')

async function trainModel(outerSteps, innerSteps){
  var optimizer = tf.train.adam(.2)
  // var optimizer = tf.train.sgd(10)
  for (var outerIndex = 0; outerIndex < outerSteps; outerIndex++) {
    await util.sleep(1)

    // optimizer.setLearningRate(optimizer.learningRate*.97)
    optimizer.learningRate = Math.max(.01, optimizer.learningRate*.97)
    if (outerIndex > outerSteps/2) optimizer.learningRate = .01
    
    d3.range(innerSteps).forEach(trainStep => {
      optimizer.minimize(() => {
        var {xTensor, yTensor} = generateBatch(1024)
        var predYs = model(xTensor)
        var loss = tf.losses.absoluteDifference(yTensor, predYs)

        if (trainStep == 0){
          renderAll.input()
          loss.data().then(l => console.log(
            'step', innerSteps*outerIndex, 'loss', fmt(l[0]), 'lr', fmt(optimizer.learningRate)))
        }

        return loss
      })
    })
  }}

window.checkModel = function(){
  var {xTensor, yTensor} = generateBatch(2048)
  var predYs = model(xTensor)
  var loss = tf.losses.absoluteDifference(yTensor, predYs)
  console.log(loss.arraySync())

  // var a = predYs.arraySync().slice().map(fmt).map(d => +d)
  // var b = yTensor.arraySync().slice().map(fmt).map(d => +d)
  // console.log(a)
  // console.log(b)
  // console.log(loss.arraySync())
  // console.log(d3.mean(a, (d, i) => Math.abs(d - b[i])))
}



window.initRenderAll = function(){
  var rv = {inputFns: [], colorFns: []}

  d3.entries(rv).forEach(({key, value}) => {
    rv[key.replace('Fns', '')] = () => value.forEach(d => d())
  })

  return rv
}

window.color = (function(){
  var maxValLR = 30
  var lrScale = d => d3.interpolatePRGn((-d + maxValLR) / maxValLR / 2)
  var lr = [lrScale(maxValLR*-.6), lrScale(maxValLR*.6)]
  lr[true] = lr[0]
  lr[false] = lr[1]
  return {lr}
})()


window.init = async function(){
  console.clear()

  window.modelWeights = {
    w1: tf.variable(tf.tensor1d(kqovGrid[nextPosition])),
    w1: tf.variable(tf.tensor1d(d3.range(hyper.n_num_tokens + 2)
      .map(d => Math.random() - .5))),
  }

  window.renderAll = initRenderAll()
  window.modelInput = await initModelInput(hyper)
  initModelVis()

  renderAll.input()

  // window.checkModel()

  trainModel(250, 8)
  // trainModel(2000, 100)

  // var batch = generateBatch(32)
  // console.log(d3.zip(batch.targets, batch.xVals.map(d => d3.max(d)), batch.xVals.map(d => d + '')))
}

init()


