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
npx ts-node src/lib/seqtasks/tiny_worlds.run_with_transformer.script.ts

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
import { layer } from '@tensorflow/tfjs-vis/dist/show/model';
import { example } from 'yargs';

const tfjsBackendName = tf.getBackend();
console.log('tfjs backend:', tfjsBackendName);

const printEveryNBatches = 10;

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
    // There may be a problem with layer norm; it seems to stop it from learning.
    // With laynorm off, we get entropyLoss: 1.05391383  accuracy: 0.53125000
    // with it on, we get lowest entropyLoss: 1.7 ish, and accuracy: ~0.35
    layerNormFF: false,
    layerNormHeadsProjection: false,
    addLayerNormBias: false,
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

function* dataGenerator(task: TinyWorldTask, batchNum: number, batchSize: number) {
  for (let batchId = 0; batchId < batchNum; batchId += 1) {
    let batchOriginal = task.exampleIter.takeOutN(batchSize);
    let batchInput = batchOriginal.map((example) => example.input);
    let batchOutput = batchOriginal.map((example) => example.output);
    yield [batchInput, batchOutput];
  }
}

function unbindedLossFn(
  batchId: number,
  batchInput: string[][],
  batchOutput: string[][],
  tokenRep: BasicTaskTokenRep,
  transformerConfig: TransformerConfig,
  decoderParamsTree: TransformerParams
): tf.Scalar {
  let spec = transformerConfig.spec;
  let computation: TransformerComputation = computeDecoder(
    tokenRep,
    strSeqPrepFn,
    spec,
    decoderParamsTree,
    batchInput
  );
  let singleNextTokenIdx = singleNextTokenIdxOutputPrepFn(tokenRep, batchOutput);
  let entropyLoss: tf.Scalar = transformerLastTokenCrossEntropyLoss(
    computation,
    decoderParamsTree.tokenEmbedding,
    singleNextTokenIdx
  );
  let accuracy: tf.Scalar = transformerAccuracy(
    computation,
    decoderParamsTree.tokenEmbedding,
    singleNextTokenIdx
  );

  if (batchId % printEveryNBatches === 0) {
    console.log(
      `batch: ${batchId} `.padEnd(15) +
        ('entropyLoss: ' + entropyLoss.arraySync().toFixed(8)).padEnd(25) +
        ('accuracy: ' + accuracy.arraySync().toFixed(8)).padEnd(25)
    );
  }
  return entropyLoss;
}

function run() {
  // define task
  const trainTaskConfig = getTaskConfig();
  const trainTask = new TinyWorldTask(trainTaskConfig);

  // define vocab & decoder
  const transformerConfig = getTransformerConfig();
  const tokenRep = prepareBasicTaskTokenRep(trainTask.baseVocab);
  const decoderParamsTree = initDecoderParamsTree(tokenRep, transformerConfig);

  {
    // train with optimiztaion
    const batchNum: number = 300;
    const batchSize: number = 64;

    let optimizer = tf.train.adam();
    let batchId = 0;
    for (let batch of dataGenerator(trainTask, batchNum, batchSize)) {
      let [batchInput, batchOutput] = batch;
      let bindedLossFn = () =>
        unbindedLossFn(
          batchId,
          batchInput,
          batchOutput,
          tokenRep,
          transformerConfig,
          decoderParamsTree
        );
      optimizer.minimize(bindedLossFn);
      batchId += 1;
    }
    optimizer.dispose();
  }

  {
    // infer
    const inferSteps = 5;
    const inferTaskConfig = { ...getTaskConfig(), maxOutputLen: inferSteps };
    const inferTask = new TinyWorldTask(inferTaskConfig);

    const batchOriginal = inferTask.exampleIter.takeOutN(1);

    batchOriginal.forEach((e) =>
      console.log(`(${e.id}) ${e.input.join('')} ---> ${e.output.join('')}`)
    );

    const batchInputAll = batchOriginal.map((example) => example.input);
    const batchOutputAll = batchOriginal.map((example) => example.output);
    let batchInput = batchInputAll;
    // Make the batch output only have a single next token.
    let batchOutput = batchOutputAll.map((subarr) => subarr.slice(0, 1));

    // for (let inferStep = 0; inferStep < inferSteps; inferStep += 1) {
    const inferStep = 0;
    const spec = transformerConfig.spec;
    const computation: TransformerComputation = computeDecoder(
      tokenRep,
      strSeqPrepFn,
      spec,
      decoderParamsTree,
      batchInput
    );
    //
    const singleNextTokenIdx = singleNextTokenIdxOutputPrepFn(tokenRep, batchOutput);
    // [0] to look at only the first example in batch.
    const singleNextTokenIdxArrayData = (singleNextTokenIdx.tensor.arraySync() as number[])[0];
    const logits = transformerLastTokenLogits(computation, decoderParamsTree.tokenEmbedding);
    // TODO: tensor.arraySync() doesn't provide any guarentee for the ordering of outputs,
    // we need to use the right gtensor functions to get the output we want...
    // [0] to look at only the first example in batch.
    const logitsArr = (logits.tensor.arraySync() as number[][])[0];
    let probs = logits.softmax('tokenId');
    // [0] to look at only the first example in batch.
    let probsArrayData = (probs.tensor.arraySync() as number[][])[0];

    // Create a sorted table of information for each token.
    const possibleTokenTable = probsArrayData.map((prob, i) => {
      return { str: tokenRep.tokens[i], tokenId: i, prob: prob, logit: logitsArr[i] };
    });
    possibleTokenTable.sort((a, b) => b.prob - a.prob);

    console.log('Inference Step:', inferStep);
    console.log('Context:', batchInput[0].join(''));
    console.log('Target Output:', batchOutput[0].join(''));
    console.log('Target next token:', batchOutput[0][0]);
    console.log('Prediction:');
    console.log('   ', 'token'.padEnd(10), ' ', 'prob'.padEnd(10), ' ');

    // Print the sorted table, marking the target from the batchOutput.
    for (const token of possibleTokenTable) {
      // let tokenId = 0; tokenId < tokenRep.tokens.length; tokenId += 1
      let mark = '';
      if (token.tokenId == singleNextTokenIdxArrayData) {
        mark = ' <- Target';
      }
      console.log('   ', token.str.padEnd(10), ' ', token.prob.toFixed(8), ' ', mark);
    }

    //   batchInput = batchInput.map((subArray, batchIndex) =>
    //     subArray.slice(1).concat(batchOutput[batchIndex])
    //   );
    //   batchOutput = batchOutputAll.map((subArray) => subArray.slice(inferStep, inferStep + 1));
    // }
  } // infer
} // run

run();
