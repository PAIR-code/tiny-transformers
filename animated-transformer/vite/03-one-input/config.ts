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


import * as transformer from '../../src/lib/transformer/transformer_gtensor'
import * as tf from '@tensorflow/tfjs'

import * as abtask from '../../src/lib/seqtasks/ab_task'
import * as util from './util.js'


export default function (onReset) {

  // TODO: load from url
  var defaultConfig = {
    decoderSizes: {
      inputRep: 3,
      kqvRep: 2,
      ffRep: 4,
      layers: [
        { nHeads: 1, hasPosEncoding: false },
      ],
    },
    initWeight_stddev: .5,
    initWeight_ff1W: null,
    maxSteps: 100,
    learningRate: .05,
  }

  var configSel = d3.select('.config').html('').st({ position: 'relative' })
  var textareaSel = configSel.append('textarea').at({ spellcheck: 'false' })
    .text(JSON.stringify(defaultConfig, null, 2))
    .on('keydown', () => {
      if (d3.event.keyCode == 13) { //  && d3.event.shiftKey
        d3.event.preventDefault()
        reset()
      }
    })

  var config = defaultConfig
  var buttons = [
    { text: 'Restart', cb: reset },
    { text: 'Stop', cb: () => config.maxSteps = config.stepIndex },
    { text: 'Step 1', cb: () => config.maxSteps += 1 },
    { text: 'Step 10', cb: () => config.maxSteps += 10 },
    { text: 'Step 100', cb: () => config.maxSteps += 100 },
  ]
  configSel.append('div.button-container').appendMany('button', buttons)
    .text(d => d.text)
    .on('click', d => d.cb())

  function reset() {
    try {
      config = parseConfig(JSON.parse(textareaSel.node().value))
    } catch (e) {
      // alert('Bad config, try reloading the page')
      console.log(e)
    }
    window.__globalConfig = config
    onReset(config)
  }

  function parseConfig(config) {
    const taskConfig: abtask.AbTaskConfig = {
      inputSeqLen: 4,
      batchSize: 16,
    }
    config.taskConfig = taskConfig

    const decoderSizes: transformer.TransformerParamSpec = config.decoderSizes
    // d3.entries(decoderSizes).forEach((k, v) => decoderSizes[k] = +v)
    config.decoderSizes = config.decoderSizes

    config.vocab = util.initVocabConfig(config)
    config.vocab.tokenEmb.embeddings.tensor = tf.oneHot(d3.range(config.vocab.vocab.length), config.decoderSizes.rep)

    // console.log(config.vocab.tokenEmb.embeddings.tensor.shape, config.vocab.vocab.length, config.decoderSizes.rep)

    return config
  }


  reset()


}
