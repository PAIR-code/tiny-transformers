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

import { BasicLmTask, BasicLmTaskConfig, Example, indexExample } from 'src/lib/seqtasks/util';
import {
  defaultTransformerConfig,
  initDecoderVarParams,
  TransformerConfig,
  TransformerParamLayerSpec,
  TransformerParams,
  TransformerParamSpec,
} from 'src/lib/transformer/transformer_gtensor';
import { TrainStateConfig } from 'src/lib/trainer/train_state';
import { computed, signal, SignalSpace, WritableSignal } from 'src/lib/weblab/signalspace';
import { cellFactory, CellFuncSpec, CellStateSpec, ValueStruct } from 'src/lib/weblab/cellspec';
import { makeTask, TaskConfig, taskConfigDefaults } from 'src/lib/seqtasks/task_registry';
import { prepareBasicTaskTokenRep, strSeqPrepFnAddingFinalMask } from 'src/lib/tokens/token_gemb';
import { GTensor } from 'src/lib/gtensor/gtensor';

const s = new SignalSpace();

const taskConfig = signal<TaskConfig>(s, structuredClone(taskConfigDefaults[0]));
const task = computed(s, () => makeTask(taskConfig()));
const tokenRep = computed(s, () => prepareBasicTaskTokenRep(task().baseVocab));

const trainConfig = signal<TrainStateConfig>(s, {
  learningRate: 0.5,
  batchSize: 64,
  maxInputlength: 10,
  testSetSize: 200,
  trainSetSize: 640,
});

const testTrainSplit = computed(s, () => {
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

const testExamples = computed(s, () => testTrainSplit().testExamples);
const trainExamplesIter = computed(s, () => testTrainSplit().trainExamplesIter);

const transformerConfig = signal<TransformerConfig>(s, defaultTransformerConfig());
const transformerParams = computed(s, () => initDecoderVarParams(tokenRep(), transformerConfig()));

function makeTrainBatch(): GTensor<'batch' | 'pos' | 'inputRep'> {
  let batchOriginal = testTrainSplit().trainExamplesIter.takeOutN(trainConfig().batchSize);
  let batchInputSeqs = batchOriginal.map((example) => example.input);
  let batchOutputSeqs = batchOriginal.map((example) => example.output);
  const batchInputGTensor = strSeqPrepFnAddingFinalMask(
    tokenRep(),
    transformerParams().tokenEmbedding,
    trainConfig().maxInputlength,
    batchInputSeqs
  );
  return batchInputGTensor;
}

// function* batchGenerator(batchNum: number, batchSize: number): Iterator<> {
//   for (let batchId = 0; batchId < batchNum; batchId += 1) {
//     yield [batchInput, batchOutput];
//   }
// }
