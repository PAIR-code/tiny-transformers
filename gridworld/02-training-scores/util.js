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


window.visState = {
  seq: [14,  9,  9, 12,  2,  7, 11,  5,  3, 13,  0,  0, 16, 16, 15, 16,
             16, 15, 15, 16, 16, 15, 16, 16, 15, 15, 15, 15, 15, 16, 17, 17,
             17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17,
             17, 17, 17, 17, 17, 17],
  totalSteps: 100000,
  scoring: 'total_score',
  seqs: null,
  slug: 'train_reload_100k',
  // slug: 'pretraining_100k',
  // slug: 'pretraining_100k_3m',
}

window.dataset_config = {
  'grid_size': 10,
  'max_rand_items': 10,
  'min_rand_items': 2,
  'name': 'gridworld',
  'pad_token': 17,
  'rand_item_scores': [1, -1, 0],
  'vocab_size': 18,
}


window.color = {
  score: d3.scaleSequential(d3.interpolateRdBu).domain([-4, 4]),
}






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
    
    var [slug, ...type] = path.replaceAll('..', '').split('.')
    type = _.last(type)

    var uploadDataStr = JSON.stringify(uploadData)
    slug = path + ' __ ' + uploadDataStr 
    if (data[slug]){
      return data[slug]
    }
    var res = await fetch(path, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      mode: 'no-cors',
      credentials: 'include',
    })

    if (res.status == 500){
      var resText = await res.text()
      console.log(resText, res)
      throw 'up'
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

  async function getPythonFile(path, uploadData={}){
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
      console.log(resText, res)
      d3.select('.error').st({display: 'block'})
      throw 'up'
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


  function addAxisLabel(c, xText, yText, xOffset=25, yOffset=-25){
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

  function softmax(array){
    var sum = d3.sum(array, d => Math.exp(d))
    return array.map(d => Math.exp(d) / sum)
  }



  return {getFile, getPythonFile, decodeToken, getTokenLogits, calcTopTokens, color, loadScript, addAxisLabel, ggPlot, sleep, softmax}

})()

window.init?.()


