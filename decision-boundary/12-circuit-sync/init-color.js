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

window.initColor = function(){

  var sliderScale = d3.scalePow().range([.01, 128]).exponent(2)
  var sel = d3.select('.slider').html(`
    <span>Color min <val></val></span>
    <span>Color max <val></val></span>
    <input type=range min=0 max=1 step=.0001 value=${sliderScale.invert(visState.colorS)}></input>
  `).st({marginLeft: 20})
  sel.select('input[type="range"]')
    .on('input', function () {
      visState.colorS = sliderScale(this.value)
      renderAll.color()
    })
  var divScale = d => d3.interpolateRdBu((-d + visState.colorS) / visState.colorS / 2)
  var divScaleLR = d => d3.interpolatePRGn((-d + visState.colorS) / visState.colorS / 2)
  var seqScale = d => d3.interpolatePuRd((d + 2)/visState.colorS)

  renderAll.colorFns.push(() => {
    sel.selectAll('val')
      .data([-visState.colorS, visState.colorS])
      .text((d, i) => d3.format('.2f')(d))
      .st({background: divScale, padding: 5, color: '#fff'})
  })


  var maxValLR = 30
  var lrScale = d => d3.interpolatePRGn((-d + maxValLR) / maxValLR / 2)
  var lr = [lrScale(maxValLR*-.6), lrScale(maxValLR*.6)]
  lr[true] = lr[0]
  lr[false] = lr[1]

  return {divScale, divScaleLR, seqScale, lrScale, lr}
}


window.init?.()
