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
hyper.mlp_size = hyper.model_size*4

var inputSize = 1
var hiddenSize = 16
var outputSize = 4

function generateOneHotBatch(){
  var batchSize = outputSize

  var xVals = d3.range(outputSize)
  var yVals = d3.range(outputSize).map(input => d3.range(outputSize).map(i => i == input ? 1 : 0))

  var xTensor = tf.tensor2d(xVals, [batchSize, inputSize], 'int32')
  var yTensor = tf.tensor2d(yVals.flat(), [batchSize, outputSize])

  return {xVals, yVals, xTensor, yTensor}
}


function model(x){
  return x
    .matMul(weights.w1)
    .add(weights.b1)
    .relu()
    .matMul(weights.w2)
    .add(weights.b2)
}

var fmt = d3.format('.4f')

async function trainModel(outerSteps, innerSteps){
  var optimizer = tf.train.adam(.2)
  // var optimizer = tf.train.sgd(10)
  for (var outerIndex = 0; outerIndex < outerSteps; outerIndex++) {
    await util.sleep(1)

    // optimizer.setLearningRate(optimizer.learningRate*.97)
    optimizer.learningRate = Math.max(.00001, optimizer.learningRate*.97)
    // if (outerIndex > outerSteps/2) optimizer.learningRate = .01
    
    d3.range(innerSteps).forEach(trainStep => {
      optimizer.minimize(() => {
        var {xTensor, yTensor} = generateOneHotBatch()
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
  var {xTensor, yTensor} = generateOneHotBatch()
  var predYs = model(xTensor)
  // var loss = tf.losses.absoluteDifference(yTensor, predYs)
  // console.log(loss.arraySync())
  console.log(predYs.arraySync())
}



window.initRenderAll = function(){
  var rv = {inputFns: []}

  d3.entries(rv).forEach(({key, value}) => {
    rv[key.replace('Fns', '')] = () => value.forEach(d => d())
  })

  return rv
}

window.init = async function(){
  console.clear()

  window.weights = {
    w1: tf.variable(tf.randomNormal([inputSize, hiddenSize])),
    b1: tf.variable(tf.randomNormal([hiddenSize])),
    w2: tf.variable(tf.randomNormal([hiddenSize, outputSize])),
    b2: tf.variable(tf.randomNormal([outputSize])),
  }

  window.renderAll = initRenderAll()

  renderAll.input()

  // window.checkModel()

  trainModel(1000, 8)
  // trainModel(2000, 100)

  // var batch = generateOneHotBatch(32)
  // console.log(d3.zip(batch.targets, batch.xVals.map(d => d3.max(d)), batch.xVals.map(d => d + '')))
}

init()


