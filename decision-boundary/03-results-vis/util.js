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


window.util = (function(){

  var data = window.__datacache = window.__datacache || {}

  function loadScript(src){
    return new Promise(function(resolve, reject) {
      const script = document.createElement('script')
      script.src = src
      script.async = false
      script.onload = resolve
      script.onerror = reject
      document.body.appendChild(script)
    })
  }

  async function getFile(path, uploadData={}){
    var [slug, type] = path.split('.')

    var uploadDataStr = JSON.stringify(uploadData)
    slug = path + ' __ ' + uploadDataStr 
    if (data[slug]){
      return data[slug]
    }

    var datadir = 'https://localhost:' + python_settings.port + '/'

    var res = await fetch(datadir + path + '', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(uploadData),
    })
    // console.log({'status': 'fetching', id, queue})

    if (res.status == 500){
      var resText = await res.text()
      console.log('500 error', resText, res)
      throw '500'
    }

    if (type == 'csv'){
      var parsed = d3.csvParse(await res.text())
    } else if (type == 'npy'){
      // console.log(res)
      var parsed = npyjs.parse(await(res).arrayBuffer())
    } else if (type == 'json'){
      var parsed = await res.json()
    } else{
      throw 'unknown type'
    }

    data[slug] = parsed
    return parsed 
  }
  

  function decodeToken(d){
    return util.vocab[d].replace('Ġ', ' ').replace('Ċ', '\n')
  }

  function getTokenLogits({data, shape}, sentIndex, tokenIndex){
    var i = sentIndex*shape[1]*shape[2] + tokenIndex*shape[2]

    return data.slice(i, i + shape[2])
  }

  function calcTopTokens(logits, m){
    var top = d3.range(m).map(d => ({v: -Infinity}))
    for (var i = 0; i < logits.length - 1; i++){
      if (top[m - 1].v > logits[i]) continue

      top.push({i, v: logits[i]})
      top = _.sortBy(top, d => -d.v)
      top.pop()
    }

    return top
  }

  var color = d3.interpolatePuOr


  function addAxisLabel(c, xText, yText, xOffset=30, yOffset=-25){
    c.svg.select('.x').append('g')
      .translate([c.width/2, xOffset])
      .append('text.axis-label')
      .text(xText)
      .at({textAnchor: 'middle', fill: '#000'})

    c.svg.select('.y')
      .append('g')
      .translate([yOffset, c.height/2])
      .append('text.axis-label')
      .text(yText)
      .at({textAnchor: 'middle', fill: '#000', transform: 'rotate(-90)'})
  }

  function ggPlot(c, isBlack=true){
    c.svg.append('rect.bg-rect')
      .at({width: c.width, height: c.height, fill: isBlack ? '#000' : '#eee'}).lower()
    c.svg.selectAll('.domain').remove()

    c.svg.selectAll('.tick').selectAll('line').remove()
    c.svg.selectAll('.y .tick')
      .append('path').at({d: 'M 0 0 H ' + c.width, stroke: '#fff', strokeWidth: 1})
    c.svg.selectAll('.y text').at({x: -3})
    c.svg.selectAll('.x .tick')
      .append('path').at({d: 'M 0 0 V -' + c.height, stroke: '#fff', strokeWidth: 1})
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }



  return {getFile, decodeToken, getTokenLogits, calcTopTokens, color, loadScript, addAxisLabel, ggPlot, sleep}

})()

if (window.init) window.init()










// TODO: auto add clientside code from 1wheel/hot-server 
function initReloadInit(){
  if (window.__isInitReload) return 
  if (!python_settings.is_dev) return
    
  window.__isInitReload = true

  new WebSocket('wss://hot-server:3989').onmessage = msg => {
    var {path, type, str} = JSON.parse(msg.data)
    
    if (type == 'reload'){
      location.reload()
    } else if (type == 'jsInject'){
      console.clear() // enable with --console.clear
      // Function is faster than eval but adds two extra lines at start of file
      Function(str)()
      if (window.__onHotServer) window.__onHotServer({path, type, str})
    } else if (type == 'cssInject') {
      Array.from(document.querySelectorAll('link'))
        .filter(d => d.href.includes(path.split('/').slice(-1)[0]))
        .forEach(d => d.href = d.href.split('?')[0] + '?' + Math.random())
    }
  }
}
if (!window.__isInitReload) initReloadInit()


