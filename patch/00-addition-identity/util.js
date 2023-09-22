window.util = (function(){

  var data = window.__datacache = window.__datacache || {}
  async function getFile(path, uploadData={}){
    var [slug, ...type] = path.replaceAll('..', '').split('.')
    type = _.last(type)

    var uploadDataStr = JSON.stringify(uploadData)
    slug = path + ' __ ' + uploadDataStr 
    if (data[slug]){
      return data[slug]
    }

    var datadir = `${sharedUtil.getRoot()}/patch/${visState.slug}/`

    var res = await fetch(path.includes('..') ? path : datadir + path)

    if (res.status == 500){
      var resText = await res.text()
      console.log(resText, res)
      throw 'up'
    }

    if (type == 'csv'){
      var parsed = d3.csvParse(await res.text())
    } else if (type == 'npy'){
      var parsed = npyjs.parse(await(res).arrayBuffer())
    } else if (type == 'json'){
      var parsed = await res.json()
    } else{
      throw 'unknown type'
    }

    data[slug] = parsed
    return parsed 
  }
  

  function addAxisLabel(c, xText, yText, xOffset=25, yOffset=-30){
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

  function initRender(fnLabels){
    var rv = {}
    fnLabels.forEach(label => {
      rv[label] = () => rv[label].fns.forEach(d => d())
      rv[label].fns = []
    })

    return rv
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function softmax(array){
    var sum = d3.sum(array, d => Math.exp(d))
    return array.map(d => Math.exp(d) / sum)
  }


  return {getFile, addAxisLabel, ggPlot, sleep, softmax, initRender}
})()

window.init?.()
