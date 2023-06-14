// token_embeddings_ft.json
// token_embeddings_orig.json

window.color.cosDist = d3.scaleSequential(d3.interpolateTurbo).domain([.9, 1])
window.color.cosDistNeg = d3.scaleSequential(d3.interpolateRdBu).domain([-1, 1])


window.initEmbeddings = async function(){
  var root = `../../local-data/gridworld/js-data/${visState.slug}`

  var embed_og = await util.getFile(`${root}/token_embeddings_orig.json`)
  var embed_ft = await util.getFile(`${root}/token_embeddings_ft.json`)

  var embeds = embed_og.concat(embed_ft) // Step x Token x Position

  var vocab = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'start', 'end', 'r', 'u', 'pad']
  var tokens = d3.range(embeds[0].length)
    .map(i => ({i, str: vocab[i], embeds: embeds.map(e => e[i])}))

  tokens = _.sortBy(tokens, d => !['A', 'B', 'C', 'start', 'end'].includes(d.str))

  d3.select('.embedding').html('').st({background: '#000'})
    .appendMany('div', tokens).st({display: 'inline-block'})
    .each(drawToken)

  d3.select('.cos-embedding-self').html('').st({background: '#000'})
    .appendMany('div', tokens).st({display: 'inline-block'})
    .each(drawTokenCos)

  function drawToken(token){
    var sel = d3.select(this)
    sel.append('div.token-title').text(token.str)

    var sx = 4
    var sy = 2

    var nStep = embeds.length
    var nPos = embeds[0][0].length

    var c = d3.conventions({
      sel: sel.append('div'),
      layers: 'cs',
      width:  sx*nStep,
      height: sy*nPos,
      margin: {left: 5, top: 5, right: 5, bottom: 25},
    })

    var ctx = c.layers[0]

    token.embeds.forEach((step, stepIndex) => {
      step.forEach((v, posIndex) => {
        ctx.beginPath()
        ctx.fillStyle = color.score(v*40)
        ctx.rect(stepIndex*sx, posIndex*sy, sx, sy)
        ctx.fill()
      })
    })

    var xAxisSel = c.svg.append('g.axis').translate(c.height, 1)
    xAxisSel.append('text').text('Train A+').at({x: c.width/4, textAnchor: 'middle', y: 15})
    xAxisSel.append('text').text('Tune B+').at({x: c.width/4*3, textAnchor: 'middle', y: 15})
    xAxisSel.append('path').at({d: ['M', c.width/2 + .5, 2, 'v', 12].join(' '), stroke: '#aaa'})
  }

  function drawTokenCos(token, i){
    var sel = d3.select(this)
    sel.append('div.token-title').text(token.str)

    var s = 4
    var c = d3.conventions({
      sel: sel.append('div'),
      layers: 'cs',
      width:  s*token.embeds.length,
      height: s*token.embeds.length,
      margin: {left: 5, top: 5, right: 5, bottom: 25},
    })
    var ctx = c.layers[0]

    var matrix = pairwiseCosineSimilarity(token.embeds)
    matrix.forEach((row, i) => {
      row.forEach((v, j) => {
        ctx.beginPath()
        ctx.fillStyle = color.cosDist(v)
        ctx.rect(i*s, j*s, s, s)
        ctx.fill()
      })
    })

    c.svg.append('path').at({d: ['M', c.width/2 + .5, c.height + 2, 'v', 6].join(' '), stroke: '#aaa'})
    c.svg.append('path').at({d: ['M', c.width + 2, c.height/2, 'h', 6].join(' '), stroke: '#aaa'})
  }

  function drawCosEmbed(){
    var s = 1
    var flatEmbeds = tokens.map(d => d.embeds).flat()

    var c = d3.conventions({
      sel: d3.select('.cos-embedding').html(''),
      layers: 'cs',
      width:  s*flatEmbeds.length,
      height: s*flatEmbeds.length,
      margin: {left: 5, top: 5, right: 5, bottom: 25},
    })
    var ctx = c.layers[0]
    
    var matrix = pairwiseCosineSimilarity(flatEmbeds)
    matrix.forEach((row, i) => {
      row.forEach((v, j) => {
        ctx.beginPath()
        // ctx.fillStyle = color.cosDist2(v)
        // ctx.fillStyle = color.score(v*10)
        // ctx.fillStyle = color.score(v*5)
        ctx.fillStyle = color.cosDistNeg(v)

        ctx.rect(i*s, j*s, s, s)
        ctx.fill()
      })
    })

    c.svg.appendMany('text', tokens)
      .translate((d, i) => [s*d.embeds.length*(i + .5), s*d.embeds.length*(i + .5)])
      .at({textAnchor: 'middle', dy: '.66em', fill: '#fff'})
      .text(d => d.str)

  }
  drawCosEmbed()
}



// window.init?.()
window.initEmbeddings()





function pairwiseCosineSimilarity(arrays) {
  var magnitudes = arrays.map(d => Math.sqrt(d3.sum(d, e => e*e)))
  var rv = d3.range(arrays.length).map(() => new Array(arrays.length))

  for (var i = 0; i < arrays.length; i++) {
    for (var j = i; j < arrays.length; j++) {
      var dotProduct = calcDotProduct(arrays[i], arrays[j])
      var magnitude = magnitudes[i]*magnitudes[j]
      var cosineSimilarity = dotProduct/magnitude

      rv[i][j] = cosineSimilarity
      rv[j][i] = cosineSimilarity
    }
  }
  return rv

  function calcDotProduct(a, b) {
    var rv = 0
    for (var i = 0; i < a.length; i++) {
      rv += a[i] * b[i];
    }
    return rv
  }
}

