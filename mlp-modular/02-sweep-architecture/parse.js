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

var {_, cheerio, d3, jp, fs, glob, io, queue, request} = require('scrape-stl')
var npyjs = require('fix-esm').require('npyjs').default

var sweeps = [
  // 'xm_gpu_full_l2_architecture',
  // 'xm_gpu_full_l2_architecture_v2',
  // 'xm_gpu_full_l1_architecture',
  'xm_gpu_full_l2_architecture_v3',
  'xm_gpu_full_l1_architecture_v4',
  // 'AG_l2_sweep',///////////////////
  // 'AG_l1_sweep'
]

sweeps.forEach(sweep => {
  var dir = __dirname + '/../../local-data/mlp_modular/' + sweep
  var paths = glob.sync(dir + '/**/*.json')

  var hypers = []
  var allMetrics = []

  jp.nestBy(paths, d => d.split(`mlp_modular/${sweep}/`)[1].split('/')[0])
    // .slice(0, 100)
    .map(d => {
      if (d.length != 2) return console.log(d)

      var [hyper, metrics] = d
        .map(io.readDataSync)

      hyper.slug = d.key
      delete hyper.task
      delete hyper.n_tokens
      delete hyper.percent_train
      delete hyper.tied_embedding
      delete hyper.b1
      delete hyper.b2
      delete hyper.log_every
      delete hyper.save_every
      delete hyper.max_steps
      delete hyper.sweep_slug

      hyper.maxRatio = d3.max(metrics, d => d.eval_loss/d.train_loss)
      hyper.minTrainLoss = d3.min(metrics, d => d.train_loss)
      hyper.minEvalLoss  = d3.min(metrics, d => d.eval_loss)

      hypers.push(hyper)
      // allMetrics.push(metrics.map(d => [d.train_loss, d.eval_loss]))
    })

  // var typedArray = new Float32Array(allMetrics.flat().flat())
  // var out = npyjs.format(typedArray, [allMetrics.length, allMetrics[0].length, 2])
  // fs.writeFileSync(__dirname + '/data__metrics_'  + sweep + '.npy', out)
  // io.writeDataSync(__dirname + '/data__metrics_' + sweep + '.csv', allMetrics.flat())

  io.writeDataSync(__dirname + '/data__hypers_'  + sweep + '.csv', hypers)
})


