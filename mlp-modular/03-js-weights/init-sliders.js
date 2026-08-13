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


window.initSliders = function(){
  var sel = d3.select('.sliders').html('')

  var sliders = ['a', 'b'].map(key => ({
    sel: sel.append('div.slider'),
    key,
    getVal: _ => visState[key],
    setVal: d => visState[key] = +d
  }))

  sliders.forEach(slider => {

    slider.sel.html(`
      <div>
        ${slider.key} <val></val>
      </div>
      <div>
        <input type=range min=0 max=${visState.n_tokens - 1} step=1 value=${slider.getVal()}></input>
      </div>
    `)
    slider.sel.select('input[type="range"]')
      .on('input', function () {
        slider.setVal(this.value)
        renderAll.input()
      })
    renderAll.inputFns.push(() => {
      var value = slider.getVal()
      slider.sel.select('val').text(value)
      slider.sel.select('input').node().value = value
    })

  })
}


if (window.init) window.init()
