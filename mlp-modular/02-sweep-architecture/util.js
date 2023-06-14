
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
      console.log(resText, res)
      throw 'up'
    }

    if (type == 'csv'){
      var parsed = d3.csvParse(await res.text())
    } else if (type == 'npy'){
      console.log(res)
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


  function addAxisLabel(c, xText, yText, xOffset=30, yOffset=-30){
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

  function ggPlot(c, isBlack=false){
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

  function addInputCircles(c, yPosFn, isKQ, lTick, rTick){
    var querySel = c.svg.append('circle')
      .at({r: 5, stroke: '#0ff', strokeWidth: 2, fill: 'none', cx: -12})

    var inputSel = c.svg.appendMany('circle.inputs', modelInput.xPositions)
      .at({r: 5, stroke: '#000', strokeWidth: 1, fill: 'none'})

    var lrSel = c.svg.appendMany('circle.lr', d3.range(Math.floor(modelInput.curInput.length/2)))
      .at({r: 5, stroke: '#000', strokeWidth: 1, fill: 'none', cx: i => i*2 - 2})

    function renderInput(){
      var yPos = yPosFn()
      querySel.at({cy: yPos}).st({opacity: isKQ ? 1 : 0})

      inputSel.translate(d => [c.x(d.v), yPos])

      lrSel.translate(i => [c.x(modelInput.curInput[i*2 + 1] == 100 ? lTick : rTick), yPos])
    }
      
    window.renderAll.inputFns.push(renderInput)
  } 


  function makeParams(){
    var url = new URL(window.location)
    var searchParams = new URLSearchParams(url.search) 

    var rv = {}

    rv.get = key => {
      var str = searchParams.get(key)
      if (key == 'symptom' && !symptomSlugs.includes(str)) str = 'fever'

      return str
    }

    rv.set = (key, value) => {
      searchParams.set(key, encodeURIComponent(value))

      url.search = searchParams.toString()
      history.replaceState(null, '', url)
    }

    return rv
  }
  var params = makeParams()


  return {getFile, decodeToken, getTokenLogits, calcTopTokens, color, loadScript, addAxisLabel, ggPlot, sleep, addInputCircles, params}

})()

if (window.init) window.init()






