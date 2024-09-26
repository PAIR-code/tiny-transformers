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

/// <reference lib="webworker" />

import { taskRegistry } from 'src/lib/seqtasks/task_registry';
import { Batch, taskVars, taskCellSpec } from './ailab';
import { StatefulCell } from 'src/lib/weblab/lab-worker-cell';
import { stringifyJsonValue } from 'src/lib/json/pretty_json';
import { BasicRandLmTask, indexExample } from 'src/lib/seqtasks/util';

const cell = new StatefulCell(taskVars, taskCellSpec);
const { derived, alwaysDerived, setable } = cell.space;

cell.run(async (inputs) => {
  // TODO: this registry business is ugly. Make a better abstraction.
  const task = derived(
    () =>
      taskRegistry.kinds[inputs.taskConfig().kind].makeFn(
        stringifyJsonValue(inputs.taskConfig())
      ) as BasicRandLmTask
  );

  // TODO: make state iterator take in the state for easier random stream
  // management?
  // CONSIDER: RandomStreamOf<Example> having a fork op. But also being savable.
  const dataSplitByTrainAndTest = derived(() => {
    const examplesIter = task().exampleIter.copy();
    const testExamples = examplesIter.takeOutN(inputs.testSetSize());
    const testSetIndex = new Set(testExamples.map(indexExample));
    const trainExamplesIter = examplesIter.copy();
    // With a generative synthetic world you can guarentee no duplicate example in
    // the test set and train set by filtering the test from the train.
    // This gives the optimal quality of test metric measurement.
    trainExamplesIter.filter((example) => !testSetIndex.has(indexExample(example)));
    // If
    const lastBatch = inputs.lastTrainBatch();
    if (lastBatch) {
      trainExamplesIter.state.seed = lastBatch.nextSeed;
    }
    return { testExamples, trainExamplesIter };
  });

  const testSet = derived(() => dataSplitByTrainAndTest().testExamples);
  const trainExamplesIter = derived(() => dataSplitByTrainAndTest().trainExamplesIter);

  function makeBatch(batchId: number, batchSize: number): Batch {
    const batchOriginal = trainExamplesIter({ untracked: true }).takeOutN(batchSize);
    const inputs = batchOriginal.map((example) => example.input);
    const outputs = batchOriginal.map((example) => example.output);
    const batchSeed = trainExamplesIter().state.seed;
    return { batchId, nextSeed: batchSeed, inputs, outputs };
  }

  const batchId = setable(0);
  const batch = derived<Batch>(() => makeBatch(batchId(), inputs.batchSize()));
});

// console.log(
//   `batch: ${batchId} `.padEnd(15) +
//     ('entropyLoss: ' + entropyLoss.arraySync().toFixed(8)).padEnd(25) +
//     ('accuracy: ' + accuracy.arraySync().toFixed(8)).padEnd(25)
// );
