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
  transformerAllTokensCrossEntropyLoss,
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
  prepareTargetsTensor,
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
  batchOutput: string[][], // target
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
  let lastTokenEntropyLoss: tf.Scalar = transformerLastTokenCrossEntropyLoss(
    computation,
    decoderParamsTree.obj.tokenEmbedding,
    singleNextTokenIdx
  );
  let accuracy: tf.Scalar = transformerAccuracy(
    computation,
    decoderParamsTree.obj.tokenEmbedding,
    singleNextTokenIdx
  );

  let targetIdxs = prepareTargetsTensor(tokenRep, batchInput, batchOutput);
  let fullEntropyLoss = transformerAllTokensCrossEntropyLoss(computation, decoderParamsTree.obj.tokenEmbedding, targetIdxs);

  console.log(
    'entropyLoss.arraySync()',
    // lastTokenEntropyLoss.arraySync(),
    fullEntropyLoss.arraySync(),
    'accuracy.arraySync()',
    accuracy.arraySync()
  );
  // return entropyLoss;
  return fullEntropyLoss;
}

{
  // define task
  const trainTaskConfig = getTaskConfig();
  const trainTask = new TinyWorldTask(trainTaskConfig);

  // define vocab & decoder
  const tokenRep = prepareBasicTaskTokenRep(trainTask.baseVocab);
  const transformerConfig = getTransformerConfig();
  const decoderParamsTree = initDecoderParamsTree(tokenRep, transformerConfig);

  // train with optimiztaion
  const batchNum: number = 2000;
  const batchSize: number = 32;

  let optimizer = tf.train.adam();
  let batchId = 0;
  for (let batch of dataGenerator(trainTask, batchNum, batchSize)) {
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

  // infer
  const inferSteps = 20;
  const inferTaskConfig = { ...getTaskConfig(), maxOutputLen: inferSteps };
  const inferTask = new TinyWorldTask(inferTaskConfig);

  let batchOriginal = inferTask.exampleIter.takeOutN(1);
  let batchInputAll = batchOriginal.map((example) => example.input);
  let batchOutputAll = batchOriginal.map((example) => example.output);
  let batchInput = batchInputAll;
  let batchOutput = batchOutputAll.map((subarr) => subarr.slice(0, 1));
  for (let inferStep = 0; inferStep < inferSteps; inferStep += 1) {
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
    let singleNextTokenIdxArrayData =
      singleNextTokenIdx.tensor.arraySync() as number[];
    let logits = transformerLastTokenLogits(
      computation,
      decoderParamsTree.obj.tokenEmbedding
    );
    let probs = logits.softmax('tokenId');
    let probsArrayData = probs.tensor.arraySync() as number[][];

    console.log('Inference Step:', inferStep);
    console.log('Context:', batchInput[0]);
    console.log('Target:', batchOutput[0][0]);
    console.log('Prediction:');
    for (let tokenId = 0; tokenId < tokenRep.tokens.length; tokenId += 1) {
      let mark = '';
      if (tokenId == singleNextTokenIdxArrayData[0]) {
        mark = ' <- Target';
      }
      console.log(
        '   ',
        tokenRep.tokens[tokenId].padEnd(10),
        ' ',
        probsArrayData[0][tokenId].toFixed(8),
        ' ',
        mark
      );
      //
      probsArrayData[0];
    }

    batchInput = batchInput.map((subArray, batchIndex) =>
      subArray.slice(1).concat(batchOutput[batchIndex])
    );
    batchOutput = batchOutputAll.map((subArray) =>
      subArray.slice(inferStep, inferStep + 1)
    );
  }
}
