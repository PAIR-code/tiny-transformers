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

/* 

Tiny Worlds, run with (gtensor-based) transformers.

Run:
  ts-node src/lib/seqtasks/tiny_worlds.run_with_transformer.script.ts

*/

import * as tf from '@tensorflow/tfjs-node';

import { GTensor, GVariable, makeTruncNormal } from '../gtensor/gtensor';
import * as transformer from '../transformer/transformer_gtensor';
import {
  AttnHeadParamSpec,
  AttnHeadComputeSpec,
  TransformerParamLayerSpec,
  TransformerParamSpec,
  TransformerConfig,
  TransformerParams,
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
  BasicTaskTokenRep,
} from '../tokens/token_gemb';
import { GTensorTree, GVariableTree } from '../gtensor/gtensor_tree';
import { layer } from '@tensorflow/tfjs-vis/dist/show/model';
import { example } from 'yargs';

function getTaskConfig(): TinyWorldTaskConfig {
  const taskConfig: TinyWorldTaskConfig = {
    ...defaultTinyWorldTaskConfig,
    maxInputLen: 10,
    maxOutputLen: 1,
  };
  return taskConfig;
}

function getTransformerConfig(): TransformerConfig {
  const layer_config: TransformerParamLayerSpec = {
    nHeads: 4,
    hasPosEncoding: false,
    layerNormFF: true,
    layerNormHeadsProjection: true,
    addLayerNormBias: true,
    computeSpec: { residuals: true },
  };
  const layer_config_first: TransformerParamLayerSpec = {
    ...layer_config,
    hasPosEncoding: false,
  };
  const spec: TransformerParamSpec = {
    inputRep: 64,
    kqvRep: 64,
    layers: [layer_config_first, layer_config, layer_config, layer_config],
  };
  const config: TransformerConfig = {
    spec: spec,
    init: {
      stddev: 0.05, // default
      mean: 0,
      seed: 42,
    },
  };
  return config;
}

function* dataGenerator(
  task: TinyWorldTask,
  batchNum: number,
  batchSize: number
) {
  for (let batchId = 0; batchId < batchNum; batchId += 1) {
    let batchOriginal = task.exampleIter.takeOutN(batchSize);
    let batchInput = batchOriginal.map((example) => example.input);
    let batchOutput = batchOriginal.map((example) => example.output);
    yield [batchInput, batchOutput];
  }
}

function unbindedLossFn(
  batchInput: string[][],
  batchOutput: string[][],
  tokenRep: BasicTaskTokenRep,
  transformerConfig: TransformerConfig,
  decoderParamsTree: GVariableTree<TransformerParams>
): tf.Scalar {
  let spec = transformerConfig.spec;
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

  console.log(
    'entropyLoss.arraySync()',
    entropyLoss.arraySync(),
    'accuracy.arraySync()',
    accuracy.arraySync()
  );
  return entropyLoss;
}

{
  // define task
  let taskConfig = getTaskConfig();
  const task = new TinyWorldTask(taskConfig);

  // define vocab & decoder
  let tokenRep = prepareBasicTaskTokenRep(task.baseVocab);
  let transformerConfig = getTransformerConfig();
  let decoderParamsTree = initDecoderParamsTree(tokenRep, transformerConfig);

  // train with optimiztaion
  let batchNum: number = 2000;
  let batchSize: number = 32;

  let optimizer = tf.train.adam();
  let batchId = 0;
  for (let batch of dataGenerator(task, batchNum, batchSize)) {
    console.log('batchId', batchId);
    batchId += 1;

    let [batchInput, batchOutput] = batch;
    let bindedLossFn = () =>
      unbindedLossFn(
        batchInput,
        batchOutput,
        tokenRep,
        transformerConfig,
        decoderParamsTree
      );
    optimizer.minimize(bindedLossFn);
  }
}
