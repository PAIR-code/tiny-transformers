
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
        renderSlider()
        renderAll.input()
      })

    function renderSlider(){ slider.sel.select('val').text(slider.getVal()) }
    renderSlider()
  })
}


if (window.init) window.init()
