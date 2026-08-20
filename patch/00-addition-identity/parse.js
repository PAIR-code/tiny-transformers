/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var {_, cheerio, d3, jp, fs, glob, io, queue, request} = require('scrape-stl')
var npy = require('fix-esm').require('npyjs').default

var offset = 0

function updatePatch(experimentIndex){
  experimentIndex = experimentIndex + offset
  console.log(experimentIndex)

  var indexStr = d3.format('06')(experimentIndex)
  var root = __dirname +  `/../../../add/add-patch-v1`
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

// gcloud storage cp --no-clobber --recursive add-patch-v0/output-top/*  gs://uncertainty-over-space/tiny-transformers/patch/add-v0/output-top
d3.range(5000).forEach(updatePatch)

