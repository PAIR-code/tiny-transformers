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


import { GTensor, DName, makeTruncNormal } from '../../src/lib/gtensor/gtensor';
import * as transformer from '../../src/lib/transformer/transformer_gtensor';
import * as tf from '@tensorflow/tfjs';

import { generateBatches } from '../../src/lib/seqtasks/util';
import * as abtask from '../../src/lib/seqtasks/ab_task';
// import * as aOnlyTask from '../../src/lib/seqtasks/a_only_task';
import { TokenEmb } from '../../src/lib/tokens/token_gemb';
import * as param_map from '../../src/lib/gtensor/gtensor_tree';
import { gtensorTrees } from '../../src/lib/gtensor/gtensor_tree';

// import {plotParams} from './plot-params';

declare var d3: any
declare var _: any


export function trainAB() {
  const taskConfig: abtask.AbTaskConfig = {
    inputSeqLen: 4,
    batchSize: 32,
  };

  const inputRep = 5;

  const decoderSizes: transformer.TransformerParamSpec = {
    rep: inputRep,
    kqv: 3,
    ffRep: 4,
    nlayers: 2,
  };


  // Create a tokenEmbedding that has an extra mask token.
  const maskToken = '[MASK]';
  const padToken = '[PAD]';
  const vocab = ['a', 'b', maskToken, padToken];
  // const maskTokenId = vocab.length - 2;
  const padTokenId = vocab.length - 1;
  const tokenEmb = new TokenEmb(vocab, makeTruncNormal(
    { token: vocab.length, inputRep }));

  // Create training batches that have the mask token added to the end of the
  // input.
  const nBatches = 5;

  interface TrainingBatch {
    batchId: number;
    inputs: GTensor<'batch' | 'pos' | 'inputRep'>;
    // TODO: this is a special case of predicting only a single next token.
    targets: GTensor<'batch'>;
    examples: abtask.Example[];
  }

  const trainingBatches =
    [...generateBatches(nBatches, taskConfig.batchSize,
      _ => abtask.genRandExample(taskConfig))
    ].map(batch => {
      const batchedInputEmb = tokenEmb.embedBatch(
        batch.examples.map(example => example.input.concat(maskToken)),
        { paddingId: padTokenId, padAt: 'start', dtype: 'int32' });

      // const batchedOutputEmb = tokenEmb.embedBatch(
      //   batch.examples.map(example => [example.output[0]]),
      //   { paddingId: padTokenId, padAt: 'end', dtype: 'int32' });

      const batchedOutputEmb = new GTensor(tf.tensor(
        batch.examples.map(example => tokenEmb.tokenToIdx[example.output[0]]),
        [batch.examples.length],
        'int32'), ['batch']);

      // { paddingId: padTokenId, padAt: 'end', dtype: 'int32' });
      // const outputsByPos = batchedOutputEmb.unstack('pos');
      return {
        batchId: batch.batchId,
        examples: batch.examples,
        inputs: batchedInputEmb,
        targets: batchedOutputEmb
        // outputs: outputsByPos[0],
      };
    });

  window.trainingBatches = trainingBatches

  interface TrainStep {
    batch: TrainingBatch;
    initParams: transformer.TransformerParams;
    gradParams: transformer.TransformerParams;
    updatedParams: transformer.TransformerParams;
    perExampleLoss: tf.Tensor;
  }

  const batchSizeScalar = tf.scalar(taskConfig.batchSize);

  // TODO: cleanup using a gtensor.valueAndGrads function.
  function trainStep(
    initParams: transformer.TransformerParams,
    lr = 0.1,
    batch: TrainingBatch,
  ): TrainStep {
    function tfLoss(...tensors: tf.Tensor[]): tf.Tensor {
      // TODO: check if we can skip unflattening, and just use coincidental
      // params tensors matching input tensors?
      // const decoderParams = param_map.unflatten(initParams, tensors);
      const decoderComputation = transformer.computeTransformer(
        initParams, batch.inputs);
      const loss = transformer.transformerLastTokenCrossEntropyLoss(
        decoderComputation, tokenEmb.embeddings, batch.targets);
      // console.log(batch.targets.tensor.dataSync())
      return loss;
    }
    const gtensors = gtensorTrees.flatten(initParams);
    const tfGradFn = tf.valueAndGrads(tfLoss);
    const gradAndValue = tfGradFn(gtensors.map(g => g.tensor));
    // const gradAndValue = tf.tidy(() => tfGradFn(gtensors.map(g => g.tensor)));
    const gradTensors = gradAndValue.grads;
    const gradGTensors = gradTensors.map((t, i) =>
      new GTensor(t, gtensors[i].dimNames));
    const gradParams = gtensorTrees.unflatten(initParams, gradGTensors);
    const scalarLr = tf.scalar(lr)
    const updatedParams = gtensorTrees.map(initParams, (g, i) =>
      g.pointwiseSub(gradGTensors[i]._tfScalarMul(scalarLr))) as transformer.TransformerParams;

    return {
      batch,
      initParams,
      gradParams,
      updatedParams,
      perExampleLoss: tf.div(gradAndValue.value, batchSizeScalar),
    };
  }

  let params = transformer.initDecoderParams(decoderSizes);
  window.params = params

  const batchTrainSteps: TrainStep[] = [];
  for (const batch of trainingBatches) {
    const batchTrainStep = trainStep(params, 10, batch);
    batchTrainSteps.push(batchTrainStep);
    params = batchTrainStep.updatedParams;

    const loss = batchTrainStep.perExampleLoss.dataSync()
    // console.log(`loss: ${loss}`);

    plotParams(loss, params, batch)
  }
}






var s = 10

function plotParams(loss, params, batch) {
  var appSel = d3.select('.chart-container')
  if (batch.batchId == 0) appSel.html('')

  var sel = appSel.append('div.batch-row')

  sel.append('div.batch').text('batch: ' + batch.batchId)
  sel.append('div.loss').text('loss: ' + d3.format('.3f')(loss))


  var layerSel = sel.appendMany('div.layer', params.layers)
    .each(drawLayer)
}

function drawLayer(layer, i) {
  var sel = d3.select(this)

  var matrices = _.sortBy(d3.entries(layer), d => ['keyM', 'queryM', 'valueM', 'ff1', 'ff2'].indexOf(d.key))
  sel.appendMany('div', matrices).each(drawMatrix)
    .st({ display: 'inline-block', padding: 2 })

  function drawMatrix({ key, value }) {
    // TODO: draw b
    var gtensor = value.tensor ? value : value.w
    var ppKey = key + (key.includes('ff') ? 'w' : '')

    var shape = gtensor.tensor.shape

    var sel = d3.select(this).st({ position: 'relative' })
      .call(d3.attachTooltip)
      .on('mouseover', () => {
        var ttSel = d3.select('.tooltip').html('')
        ttSel.append('div').append('b').text(ppKey)
        ttSel.append('div').text(gtensor.dimNames.join(' ✕ '))
        // TODO match matrix shape / color?
        ttSel.append('div').appendMany('span', rawTensor)
          .text(d => d3.format('+.3f')(d) + ', ')
          .st({ width: 56, fontSize: 12, display: 'inline-block' })
      })

    sel.append('div').st({ position: 'absolute', top: -13, fontSize: 12, color: '#666' })
      .text(ppKey)

    var canvasSel = sel.append('canvas')
      .at({ width: shape[0] * s, height: shape[1] * s })
      .on('click', () => {
        console.log(rawTensor)
      })
    var ctx = canvasSel.node().getContext('2d')

    var rawTensor = gtensor.tensor.dataSync()
    window.rawTensor = rawTensor
    for (var i = 0; i < rawTensor.length; i++) {
      var x = i % shape[0]
      var y = Math.floor(i / shape[0])

      ctx.beginPath()
      ctx.fillStyle = rawTensor[i] == 0 ? '#f0f' : d3.interpolatePuOr(rawTensor[i] * 2 + .5)
      ctx.rect(x * s, y * s, s, s)
      ctx.fill()
    }
  }
}







if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      console.clear()
      newModule.trainAB()
      // newModule is undefined when SyntaxError happened
    }
  })
}


