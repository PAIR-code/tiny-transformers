var {_, cheerio, d3, jp, fs, glob, io, queue, request} = require('scrape-stl')
var npy = require('fix-esm').require('npyjs').default

var offset = 0

function updatePatch(experimentIndex){
  experimentIndex = experimentIndex + offset
  console.log(experimentIndex)

  var indexStr = d3.format('06')(experimentIndex)
  var root = __dirname +  `/../../../add/add/add-patch-v1`
  var logits = npy.parse(fs.readFileSync( `${root}/output_dst_logits/${indexStr}.npy`))

  var [nLayers, nTokens] = logits.shape
  var flatLogits = d3.cross(d3.range(nLayers), d3.range(nTokens))
    .map(([layerIndex, tokenIndex]) => {
      var v = logits.data[layerIndex*nTokens + tokenIndex]

      return {layerIndex, tokenIndex, v, rank: 0}
    })

  jp.nestBy(flatLogits, d => d.layerIndex)
    .forEach(layer => {
      _.sortBy(layer, d => -d.v).forEach((d, i) => d.rank = i)

      var max = d3.max(layer, d => d.v)
      var expArray = layer.map(d => Math.exp(d.v - max))
      var sum = d3.sum(expArray)

      layer.forEach((d, i) => d.softmax = expArray[i]/sum)
    })

  var byToken = jp.nestBy(flatLogits, d => d.tokenIndex)
  var topTokens = byToken.filter(token => token.some(d => d.rank < 10))

  io.writeDataSync(`${root}/output-top/${indexStr}.csv`, topTokens.flat())
}

// gsutil -m cp -n -r add-patch-v0/output-top/*  gs://uncertainty-over-space/tiny-transformers/patch/add-v0/output-top
d3.range(1000).forEach(updatePatch)

