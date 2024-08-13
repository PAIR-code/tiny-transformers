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

/* Tiny Worlds, run with (gtensor-based) transformers  */

import * as tf from '@tensorflow/tfjs';

import { GTensor, GVariable, makeTruncNormal } from '../gtensor/gtensor';
import * as transformer from '../transformer/transformer_gtensor';
import {
  AttnHeadParamSpec,
  AttnHeadComputeSpec,
  TransformerParamLayerSpec,
  TransformerParamSpec,
  TransformerConfig,
  initDecoderParams,
  initDecoderParamsTree,
  TransformerComputation,
  computeDecoder,
  transformerLastTokenLogits,
  transformerLastTokenCrossEntropyLoss,
  transformerAccuracy,
} from '../transformer/transformer_gtensor';
import {
  TinyWorldTask,
  TinyWorldTaskConfig,
  bayesianV1TinyWorldTaskConfig,
  defaultTinyWorldTaskConfig,
} from './tiny_worlds';
import {
  embedBatch,
  strSeqPrepFn,
  strSeqPrepFnAddingFinalMask,
  singleNextTokenIdxOutputPrepFn,
  prepareBasicTaskTokenRep,
} from '../tokens/token_gemb';
import { layer } from '@tensorflow/tfjs-vis/dist/show/model';
import { example } from 'yargs';

{
  // define task
  const initConfig: TinyWorldTaskConfig = { ...defaultTinyWorldTaskConfig };
  initConfig.maxInputLen = 10;
  initConfig.maxOutputLen = 1;
  const task = new TinyWorldTask(initConfig);

  // define vocab & decoder
  let tokenRep = prepareBasicTaskTokenRep(task.baseVocab);
  let numToken = tokenRep.tokens.length;
  //console.log('tokenRep:', tokenRep);
  console.log('numToken:', numToken);

  let layer_config: TransformerParamLayerSpec = {
    nHeads: 4,
    hasPosEncoding: false,
    layerNormFF: true,
    layerNormHeadsProjection: true,
    addLayerNormBias: true,
    computeSpec: { residuals: true },
  };
  let layer_config_first: TransformerParamLayerSpec = {
    ...layer_config,
    hasPosEncoding: false,
  };
  let spec: TransformerParamSpec = {
    inputRep: 32,
    kqvRep: 32,
    layers: [layer_config_first, layer_config, layer_config, layer_config],
  };
  let config: TransformerConfig = {
    spec: spec,
    init: {
      stddev: 0.05, // default
      mean: 0,
      seed: 42,
    },
  };
  let decoderParamsTree = initDecoderParamsTree(tokenRep, config);

  // test optimization
  let epochNum: number = 100;
  let batchSize: number = 4;

  const optimizer = tf.train.adam();
  for (let epoch = 0; epoch < epochNum; epoch += 1) {
    console.log('epoch', epoch);

    let batchOriginal = task.exampleIter.takeOutN(batchSize);
    let batchInput = batchOriginal.map((example) => example.input);
    let batchOutput = batchOriginal.map((example) => example.output);
    optimizer.minimize(() => {
      let computation: TransformerComputation = computeDecoder(
        tokenRep,
        strSeqPrepFn,
        spec,
        decoderParamsTree,
        batchInput
      );
      let singleNextTokenIdx = singleNextTokenIdxOutputPrepFn(
        tokenRep,
        batchOutput
      );
      let entropyLoss: tf.Scalar = transformerLastTokenCrossEntropyLoss(
        computation,
        decoderParamsTree.obj.tokenEmbedding,
        singleNextTokenIdx
      );
      let accuracy: tf.Scalar = transformerAccuracy(
        computation,
        decoderParamsTree.obj.tokenEmbedding,
        singleNextTokenIdx
      );

      console.log('entropyLoss.arraySync()', entropyLoss.arraySync());
      console.log('accuracy.arraySync()', accuracy.arraySync());
      return entropyLoss;
    });
  }
}
