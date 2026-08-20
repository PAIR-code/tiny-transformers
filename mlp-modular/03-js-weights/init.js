/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


window.visState = window.xvisState || {
  embed_size: 2,
  hidden_size: 5,
  n_tokens: 41,
  hidden_r: 1,
  out_r: 1,
  rotation: Math.PI/5*2,
  rotation: 0,
  a: 2,
  b: 9,
  isLocked: false,
}

function updateModel(){
  var {n_tokens, hidden_r, out_r, hidden_size, rotation} = visState

  var model = visState.model = {
    embed: d3.range(n_tokens).map(i => [
      Math.cos(2*Math.PI*i/n_tokens),
      Math.sin(2*Math.PI*i/n_tokens),
    ]),
    hiddenWT: d3.range(hidden_size).map(i => [
      Math.cos(i*Math.PI*2/hidden_size + rotation)*hidden_r,
      Math.sin(i*Math.PI*2/hidden_size + rotation)*hidden_r,
    ]),
  } 

  model.hiddenW = util.transpose(model.hiddenWT)

  var radiusRatio = out_r/hidden_r
  model.outW = d3.range(hidden_size).map(i => {
    i = i*2 % hidden_size
    return [model.hiddenW[0][i]*radiusRatio, model.hiddenW[1][i]*radiusRatio]  
  })
  model.outWT = util.transpose(model.outW)

  // TODO: convert to tfjs 
}
updateModel()


window.initRenderAll = function(){
  var rv = {modelFns: [], inputFns: []}

  d3.entries(rv).forEach(({key, value}) => {
    rv[key.replace('Fns', '')] = async () => {
      value.forEach(d => d())
    }
  })

  return rv
}



window.init = function(){
  console.clear()

  window.renderAll = initRenderAll()

  updateModel()

  initEmbedVis('embed')
  initCircleWeightsVis('embed')
  initCircleWeightsVis('hiddenWT')
  initCircleWeightsVis('outW')

  initEmbedVis('hiddenWT')
  initEmbedVis('outW')

  initSliders()
  initCircleInputVis('hiddenWT')
  initCircleInputVis('outW')


  initActivationVis()

  renderAll.model()


}
init()