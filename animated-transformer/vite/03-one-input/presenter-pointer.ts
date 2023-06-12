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


declare var d3: any
declare var _: any


function initPointer(){
  var svgSel = d3.select('body')
    .selectAppend('svg.pointer-container').html('')
    .st({overflow: 'visible', position: 'relative', zIndex: 100000})
    .at({height: 10, width: 10})


  var r = 20

  svgSel.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '-10 -10 20 20')
      .attr('markerWidth', r)
      .attr('markerHeight', r)
      .attr('orient', 'auto')
    .append('path')
      .attr('d', 'M-10,-10 L 0,0 L -10,10')
      .st({stroke: '#f0f', fill: 'none', })


  var pos = [0, 200]
  var handlePos = [[0, 0], [90, 90]]

  var drag = d3.drag()
    .on('drag', function(d){
      var x = d3.event.x
      var y = d3.event.y
      d[0] = x
      d[1] = y

      render()
      d3.event.sourceEvent.preventDefault()
    })
    .subject(function(d){ return {x: d[0], y: d[1]} })

  var pointerSel = svgSel.append('g').datum(pos)
    .call(drag)

  pointerSel.append('path')
    .at({markerEnd: 'url(#arrow)', stroke: '#f0f', strokeWidth: 2})

  pointerSel.append('path')
    .st({opacity: 0, strokeWidth: 5, stroke: '#000'})

  var pathSel = pointerSel.selectAll('path')
    .st({cursor: 'pointer'})

  var circleSel = pointerSel.appendMany('circle', handlePos)
    .at({r, cursor: 'pointer', fillOpacity: 0})
    .call(drag)

  function render(){
    pointerSel.translate(pos)
    pathSel.at({d: 'M' + handlePos.join('L')})

    circleSel.translate(d => d)
  }

  render()




}

export {initPointer}





if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    try {
      if (newModule) {
        console.clear()
        newModule.initPointer()
      }
    } catch(e){
      console.log(e)
    }
  })
}




