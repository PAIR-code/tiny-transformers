window.initEmbedVis = async function(type){
  var sx = 4
  var sy = 4

  var {data, shape} = visState.model[type]
  var c = d3.conventions({
    sel: d3.select('.' + type).html(''),
    width:  shape[1]*sx,
    height: shape[2]*sy,
    layers: 'cs',
  })

  var ctx = c.layers[0]
  c.x.range([0, sx*shape[1]]).domain([0, shape[1]])
  c.y.range([0, sy*shape[2]]).domain([0, shape[2]])

  d3.drawAxis(c)
  c.svg.select('.x').translate([Math.floor(sx/2), c.height])
  c.svg.select('.y').translate(Math.floor(sy/2), 1)

  var typeLabelSel = c.svg.append('text')
    .at({y: -5, fontSize: 12})
    .text(type)

  var stepLabelSel = c.svg.append('text')
    .at({textAnchor: 'end', x: c.width, y: -5, fontSize: 12})


  var color = d => d3.interpolateRdBu((-d + 1.5) / 1.5 / 2)

  renderAll.stepFns.push(render)

  function render(){
    stepLabelSel.text('Step ' + d3.format('06,')(visState.stepIndex*100))

    var offset = shape[1]*shape[2]*visState.stepIndex
    for (var i = 0; i < shape[1]; i++){
      for (var j = 0; j < shape[2]; j++){
        var index = offset + shape[2]*i + j

        ctx.beginPath()
        ctx.fillStyle = color(data[index])
        ctx.rect(i*sx, j*sy, sx, sy)
        ctx.fill()
      }
    }
  }
  render()
}


if (window.init) window.init()