var {_, cheerio, d3, jp, fs, glob, io, queue, request} = require('scrape-stl')
var npy = require('fix-esm').require('npyjs').default

var offset = 5000

function updatePatch(experimentIndex){
  experimentIndex = experimentIndex + offset
  console.log(experimentIndex)

  var indexStr = d3.format('06')(experimentIndex)
  var root = __dirname +  `/../../../add/add-patch-v0`
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

d3.range(1000).forEach(updatePatch)


// sweeps.forEach(sweep => {
//   var dir = __dirname + '/../../local-data/mlp_modular/' + sweep
//   var paths = glob.sync(dir + '/**/*.json')

//   var hypers = []
//   var allMetrics = []

//   jp.nestBy(paths, d => d.split(`mlp_modular/${sweep}/`)[1].split('/')[0])
//     // .slice(0, 100)
//     .map(d => {
//       if (d.length != 2) return console.log(d)

//       var [hyper, metrics] = d
//         .map(io.readDataSync)

//       hyper.slug = d.key
//       delete hyper.task
//       delete hyper.n_tokens
//       delete hyper.percent_train
//       delete hyper.tied_embedding
//       delete hyper.b1
//       delete hyper.b2
//       delete hyper.log_every
//       delete hyper.save_every
//       delete hyper.max_steps
//       delete hyper.sweep_slug

//       hyper.maxRatio = d3.max(metrics, d => d.eval_loss/d.train_loss)
//       hyper.minTrainLoss = d3.min(metrics, d => d.train_loss)
//       hyper.minEvalLoss  = d3.min(metrics, d => d.eval_loss)

//       hypers.push(hyper)
//       // allMetrics.push(metrics.map(d => [d.train_loss, d.eval_loss]))
//     })

//   // var typedArray = new Float32Array(allMetrics.flat().flat())
//   // var out = npyjs.format(typedArray, [allMetrics.length, allMetrics[0].length, 2])
//   // fs.writeFileSync(__dirname + '/data__metrics_'  + sweep + '.npy', out)
//   // io.writeDataSync(__dirname + '/data__metrics_' + sweep + '.csv', allMetrics.flat())

//   io.writeDataSync(__dirname + '/data__hypers_'  + sweep + '.csv', hypers)
// })


