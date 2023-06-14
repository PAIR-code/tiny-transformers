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

window.ttSel = d3.select('body').selectAppend('div.tooltip.tooltip-hidden')


window.init = async function(){
  console.clear()

  window.renderAll = () => window.renderAll.fns.forEach(d => d())
  window.renderAll.fns = []

  const handWeights = window.initWeights()
  window.model = await window.initModel(handWeights.weights, handWeights.hyper)

  window.modelInput = window.initModelInput(model.hyper)

  // window.initPredictionChart(model)
  window.initResidual(model)

  window.renderAll()


  window.initLayerWeights(model, model.weights.layers[2])
}
window.init()



