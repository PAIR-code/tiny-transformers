window.initActivationVis = async function(){

  var s = 4


  var hiddenData = d3.range(visState.hidden_size).map(i => ({i}))

  var hiddenSel = d3.select('.activation-vis').html('')
    .appendMany('div', hiddenData)
    .st({display: 'inline-block'})
    .each(initHidden)
    .each(initOut)

  initSum()
  
  function initHidden(d){
    var c = d3.conventions({
      sel: d3.select(this).append('div'),
      width:  (visState.n_tokens - 1)*s,
      height: (visState.n_tokens - 1)*s,
      layers: 'scs',
    })

    c.svg.append('text').text('hidden activation ' + d.i)
      .at({y: -2, fontSize: 12})

    var valTextSel = c.svg.append('text')
      .at({y: -2, fontSize: 12, x: c.width, textAnchor: 'end'})

    c.x.domain([0, visState.n_tokens - 1])
    c.y.domain([0, visState.n_tokens - 1])
    d3.drawAxis(c)

    var hoverSel = c.layers[2].append('circle')
      .at({stroke: '#000', r: s, fill: 'none'})

    c.layers[2].append('rect')
      .at({width: c.width + s*2, height: c.height + s*2, x: -s, y: -s, fillOpacity: 0})
      .on('mousemove', function(){
        if (!visState.isLocked) updatePos.call(this)
      })
      .on('click', function(){
        visState.isLocked = !visState.isLocked
        updatePos.call(this)
      })
      .on('mouseleave', function(){
        visState.isLocked = false
      })

    function updatePos(){
      var mPos = d3.mouse(this)
      visState.a = Math.round(c.x.invert(mPos[0])) % visState.n_tokens
      visState.b = Math.round(c.y.invert(mPos[1])) % visState.n_tokens
      visState.a = Math.max(0, visState.a)
      visState.b = Math.max(0, visState.b)

      renderInput()
    }

    d.hidden = {c, ctx: c.layers[1], hoverSel, valTextSel, i: d.i}
  }

  function initOut(d){
    var c = d3.conventions({
      sel: d3.select(this).append('div.out'),
      width:  (visState.n_tokens - 1)*s,
      height: 100,
    })
    c.x.domain([0, visState.n_tokens - 1])

    c.svg.append('text').text('logits')
      .at({y: -2, fontSize: 12})

    var valTextSel = c.svg.append('text').text(`val×W_out×W_embedᵀ `)
      .at({y: -2, fontSize: 12, x: c.width, textAnchor: 'end'})


    var lineSel = c.svg.appendMany('path', d3.range(visState.n_tokens))
      .at({stroke: '#000', strokeWidth: 2})
      .translate(c.x, 0)

    d.out = {c, lineSel, i: d.i}
  }

  function initSum(){
    var c = d3.conventions({
      sel: d3.select('.activation-vis').append('div'),
      width:  (visState.n_tokens - 1)*s,
      height: 100,
      margin: {top: 40}
    })
    c.x.domain([0, visState.n_tokens - 1])

    c.svg.append('text').text('logits sum')
      .at({y: -2, fontSize: 12})

    // var valTextSel = c.svg.append('text').text(`val×W_out×W_embedᵀ `)
    //   .at({y: -2, fontSize: 12, x: c.width, textAnchor: 'end'})


    var lineSel = c.svg.appendMany('path', d3.range(visState.n_tokens))
      .at({stroke: '#000', strokeWidth: 2})
      .translate(c.x, 0)

    hiddenData.sum = {c, lineSel}
  }


  var color = d => d3.interpolateRdBu((-d + 1.5) / 1.5 / 2)

  renderAll.modelFns.push(render)

  function render(){
    var hiddenW = visState.model.hiddenWT
    var outW = visState.model.outW

    // Assuming W_embed and W_hidden are 2D arrays in JavaScript

    // Convert arrays to tensor2D
    var embed_tf = tf.tensor2d(visState.model.embed)
    var W_hidden_tf = tf.tensor2d(visState.model.hiddenW)
    var W_out_tf = tf.tensor2d(visState.model.outW)

    var W_hidden_embed = tf.matMul(embed_tf, W_hidden_tf)
    var expand0 = W_hidden_embed.expandDims(1)
    var expand1 = W_hidden_embed.expandDims(0)
    var activations = tf.add(expand0, expand1).relu().transpose([2, 0, 1])
    
    hiddenData.activations = activations.arraySync()

    var outW_embedW = tf.matMul(W_out_tf, embed_tf.transpose())
    hiddenData.outW_embedW = outW_embedW.arraySync()

    hiddenData.forEach(hidden => {
      var {hidden: {c, ctx}, i} = hidden
      hiddenData.activations[i].forEach((row, i) => {
        row.forEach((v, j) => {
          ctx.beginPath()
          ctx.fillStyle = v == 0 ? '#ccc' : color(v)
          ctx.rect(c.x(i), c.y(j), s - .1, s -.1)
          ctx.fill()
        })
      })
    })


    hiddenData.maxVal = d3.max(hiddenData.activations.flat(2))*d3.max(hiddenData.outW_embedW.flat(2))
    hiddenData.forEach(hidden => {
      var {c, lineSel} = hidden.out

      c.y.domain([-hiddenData.maxVal, hiddenData.maxVal])

      c.yAxis.ticks(5)
      d3.drawAxis(c)
      util.ggPlot(c)
      lineSel.raise()
    })


    !(function(){
      var {c, lineSel} = hiddenData.sum

      c.y.domain([-hiddenData.maxVal, hiddenData.maxVal])

      c.yAxis.ticks(5)
      d3.drawAxis(c)
      util.ggPlot(c)
      lineSel.raise()
    })()

    renderInput()
  }


  function renderInput(){
    visState.correct = (visState.a + visState.b) % visState.n_tokens

    hiddenData.forEach(({hidden}) => {
      var {c, hoverSel, valTextSel, i} = hidden
      hoverSel
        .translate(d => [c.x(visState.a), c.y(visState.b)])

      hidden.val = hiddenData.activations[i][visState.a][visState.b]
      valTextSel.text('val: ' + d3.format('.2f')(hidden.val))
    })


    hiddenData.forEach(({hidden, out}) => {
      var {c, lineSel, i} = out

      out.vals = hiddenData.outW_embedW[i].map(d => d*hidden.val)

      lineSel.at({
        d: d => `M 0 ${c.y(0)} V ${c.y(out.vals[d])}`,
        stroke: d => d == visState.correct ? '#f0f' : '#000',
      })
    })



    !(function(){
      var {c, lineSel} = hiddenData.sum

      var vals = d3.range(visState.n_tokens).map(i => {
        return d3.sum(d3.range(visState.hidden_size).map(j => hiddenData[j].out.vals[i]))
      })

      lineSel.at({
        d: d => `M 0 ${c.y(0)} V ${c.y(vals[d])}`,
        stroke: d => d == visState.correct ? '#f0f' : '#000',
      })
    })()


  }
}


if (window.init) window.init()












