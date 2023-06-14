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



var sweeps = [
  'sweep_1_layermodels',
  'sweep_learning_rate_models',
  'sweep_position_embedding_models',
  'sweep_no_mlp_models',
  'sweep_untied_models',
  'sweep_untied_v2models',
  'sweep_scratch_models',
  'sweep_tied_heads_models',
  'sweep_init_token_embed_models',
  'sweep_init_token_embed_v2_models',
  'sweep_loss_only_last_v3_models',
  'sweep_loss_only_last_v_all_models',
  'batch_64models',
  'sweep_1_layer_v2models',
  'sweep_1_layer_200k_models',
  'sweep_1_layer_v3_models',
  'sweep_1_layer_200k_v2_models',
]


sweeps.forEach(sweep => {
  var dir = __dirname + '/../../local-data/decision_boundary/' + sweep
  var paths = glob.sync(dir + '/**/*.json')

  var models = jp.nestBy(paths, d => d.split(`decision_boundary/${sweep}/`)[1].split('/')[0])
    .map(d => {
      var [hyper, metrics] = d
        .filter(e => !e.includes('weights.json'))
        .map(io.readDataSync)
      var hasTokenEmbeddingMatrix = fs.existsSync(d[0].replace('hyper.json', 'token_embedding_matrix.npy'))

      if (hyper['vocab_embedding'] == 'trained') hyper['vocab_embedding'] = 'trained_tied'

      hyper.has_residual = hyper.has_residual == undefined ? true : hyper.has_residual

      return {slug: d.key, hyper, metrics, hasTokenEmbeddingMatrix}
    })

  io.writeDataSync(__dirname + '/data__' + sweep + '.json', models, {indent: 2})
})
