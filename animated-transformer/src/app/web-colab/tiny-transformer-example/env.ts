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
/**
 * This is a simple example (web) ailab. This provides an example of defining
 * the types for a cell.
 */

import { indexExample } from 'src/lib/seqtasks/util';
import {
  defaultTransformerConfig,
  initDecoderParams,
} from 'src/lib/transformer/transformer_gtensor';
import { TrainStateConfig } from 'src/lib/trainer/train_state';
import { SignalSpace, WritableSignal } from 'src/lib/weblab/signalspace';
import { taskRegistry } from 'src/lib/seqtasks/task_registry';
import { prepareBasicTaskTokenRep, strSeqPrepFnAddingFinalMask } from 'src/lib/tokens/token_gemb';
import { GTensor } from 'src/lib/gtensor/gtensor';
import { globals, Globals, trainerCell } from './ailab';
import { LabEnv } from 'src/lib/weblab/lab-env';
import { LabState } from 'src/lib/weblab/lab-state';
import { constToVarParams } from 'src/lib/gtensor/params';

// Consider... one liner... but maybe handy to have the object to debug.
// const { writable, computed } = new SignalSpace();
const space = new SignalSpace();
const { writable, computed } = space;

const taskKinds = Object.keys(taskRegistry.kinds);

const taskKind = writable<string>(taskKinds[0]);
const task = computed(() => taskRegistry.kinds[taskKind()].makeDefault());

const trainConfig = writable<TrainStateConfig>({
  learningRate: 0.5,
  batchSize: 64,
  maxInputLength: 10,
  testSetSize: 200,
  trainSetSize: 640,
});

const dataSplitByTrainAndTest = computed(() => {
  const examplesIter = task().exampleIter.copy();
  const testExamples = examplesIter.takeOutN(trainConfig().testSetSize);
  const testSetIndex = new Set(testExamples.map(indexExample));
  const trainExamplesIter = examplesIter.copy();
  // With a generative synthetic world you can guarentee no duplicate example in
  // the test set and train set by filtering the test from the train.
  // This gives the optimal quality of test metric measurement.
  trainExamplesIter.filter((example) => !testSetIndex.has(indexExample(example)));
  return { testExamples, trainExamplesIter };
});

const testExamples = computed(() => dataSplitByTrainAndTest().testExamples);
const trainExamplesIter = computed(() => dataSplitByTrainAndTest().trainExamplesIter);

const transformerConfig = writable(defaultTransformerConfig());
const transformerParams = computed(() => constToVarParams(initDecoderParams(transformerConfig())));
const model = computed(() => {
  return {
    config: transformerConfig(),
    params: transformerParams(),
  };
});

function makeTrainBatch(): GTensor<'batch' | 'pos' | 'inputRep'> {
  let batchOriginal = dataSplitByTrainAndTest().trainExamplesIter.takeOutN(trainConfig().batchSize);
  let batchInputSeqs = batchOriginal.map((example) => example.input);
  let batchOutputSeqs = batchOriginal.map((example) => example.output);
  const batchInputGTensor = strSeqPrepFnAddingFinalMask(model(), batchInputSeqs, trainConfig());
  return batchInputGTensor;
}

const state = new LabState();
const env = new LabEnv<typeof globals>(state);

async function run() {
  const cellResults = env.run(trainerCell);
}
run();

// function* batchGenerator(batchNum: number, batchSize: number): Iterator<> {
//   for (let batchId = 0; batchId < batchNum; batchId += 1) {
//     yield [batchInput, batchOutput];
//   }
// }
