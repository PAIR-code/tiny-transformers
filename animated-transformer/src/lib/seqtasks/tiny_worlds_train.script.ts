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

TODO: add yargs so this is a real command line tool example.

Run:
  npx ts-node src/lib/seqtasks/tiny_worlds_train.script.ts
*/

import * as tf from '@tensorflow/tfjs-node';

import {
  TransformerParamLayerSpec,
  TransformerParamSpec,
  TransformerConfig,
  TransformerParams,
  initDecoderVarParams,
  TransformerComputation,
  computeDecoder,
  lastTokenLogits,
  lastTokenCrossEntropyLoss,
  transformerAccuracy,
  TransformerModel,
} from '../transformer/transformer_gtensor';
import { TinyWorldTask, TinyWorldTaskConfig, defaultTinyWorldTaskConfig } from './tiny_worlds';
import {
  strSeqPrepFn,
  singleNextTokenIdxOutputPrepFn,
  prepareBasicTaskTokenRep,
  BasicTaskTokenRep,
} from '../tokens/token_gemb';
import * as yargs from 'yargs';

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

function initTransformerConfig(baseVocab: string[]): TransformerConfig {
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
    name: 'a simple transformer',
    kind: 'Transformer',
    spec: spec,
    tokenRep: prepareBasicTaskTokenRep(baseVocab),
    init: {
      stddev: 0.05, // default
      mean: 0,
      seed: 42,
    },
  };
  return config;
}

type Batch = {
  batchId: number;
  inputs: string[][];
  outputs: string[][];
};

function* batchGenerator(
  task: TinyWorldTask,
  batchNum: number,
  batchSize: number
): Iterable<Batch> {
  for (let batchId = 0; batchId < batchNum; batchId += 1) {
    let batchOriginal = task.exampleIter.takeOutN(batchSize);
    let inputs = batchOriginal.map((example) => example.input);
    let outputs = batchOriginal.map((example) => example.output);
    yield { batchId, inputs, outputs };
  }
}

function computeLoss(
  model: {
    config: TransformerConfig;
    params: TransformerParams;
  },
  batchId: number,
  batchInput: string[][],
  batchOutput: string[][]
): tf.Scalar {
  const computation: TransformerComputation = computeDecoder(model, strSeqPrepFn, batchInput);
  const singleNextTokenIdx = singleNextTokenIdxOutputPrepFn(model, batchOutput);
  const entropyLoss: tf.Scalar = lastTokenCrossEntropyLoss(model, computation, singleNextTokenIdx);
  if (batchId % printEveryNBatches === 0) {
    const accuracy: tf.Scalar = transformerAccuracy(model, computation, singleNextTokenIdx);
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
  const transformerConfig = initTransformerConfig(trainTask.baseVocab);
  const decoderParams = initDecoderVarParams(transformerConfig);
  const model: TransformerModel = {
    config: transformerConfig,
    params: decoderParams,
  };

  {
    // train with optimiztaion
    const batchNum: number = 300;
    const batchSize: number = 64;

    let optimizer = tf.train.adam();
    for (let batch of batchGenerator(trainTask, batchNum, batchSize)) {
      let { batchId, inputs, outputs } = batch;
      optimizer.minimize(() => computeLoss(model, batchId, inputs, outputs));
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
    const computation: TransformerComputation = computeDecoder(model, strSeqPrepFn, batchInput);
    //
    const singleNextTokenIdx = singleNextTokenIdxOutputPrepFn(model, batchOutput);
    // [0] to look at only the first example in batch.
    const singleNextTokenIdxArrayData = (singleNextTokenIdx.tensor.arraySync() as number[])[0];
    const logits = lastTokenLogits(model, computation);
    // TODO: tensor.arraySync() doesn't provide any guarentee for the ordering of outputs,
    // we need to use the right gtensor functions to get the output we want...
    // [0] to look at only the first example in batch.
    const logitsArr = (logits.tensor.arraySync() as number[][])[0];
    let probs = logits.softmax('tokenId');
    // [0] to look at only the first example in batch.
    let probsArrayData = (probs.tensor.arraySync() as number[][])[0];

    // Create a sorted table of information for each token.
    const possibleTokenTable = probsArrayData.map((prob, i) => {
      return { str: model.config.tokenRep.tokens[i], tokenId: i, prob: prob, logit: logitsArr[i] };
    });
    possibleTokenTable.sort((a, b) => b.prob - a.prob);

    console.log('Inference Step:', inferStep);
    console.log('Context:', batchInput[0].join(''));
    // console.log('Target Output:', batchOutput[0].join(''));
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
  } // infer
} // run

run();
