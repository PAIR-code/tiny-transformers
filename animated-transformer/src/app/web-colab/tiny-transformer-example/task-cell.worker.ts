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

import { Batch, taskCellSpec } from './ailab';
import { workerCell } from 'src/lib/distr-signal-exec/lab-worker-cell';
import { indexExample } from 'src/lib/seqtasks/util';
import { DepKind } from 'src/lib/signalspace/signalspace';
import { TinyWorldTask } from 'src/lib/seqtasks/tiny_worlds';

// ------------------------------------------------------------------------
const cell = workerCell(taskCellSpec);
const { derived } = cell.space;

// ------------------------------------------------------------------------
cell.run(async () => {
  const { taskConfig, genConfig } = await cell.onceAllInputs;
  const task = derived(() => new TinyWorldTask(taskConfig()));

  // TODO: make state iterator take in the state for easier random stream
  // management?
  // CONSIDER: RandomStreamOf<Example> having a fork op. But also being savable.
  const dataSplitByTrainAndTest = derived(() => {
    const examplesIter = task().exampleIter.copy();
    const testExamples = examplesIter.takeOutN(genConfig().testSetSize);
    const testSetIndex = new Set(testExamples.map(indexExample));
    const trainExamplesIter = examplesIter.copy();
    // With a generative synthetic world you can guarentee no duplicate example in
    // the test set and train set by filtering the test from the train.
    // This gives the optimal quality of test metric measurement.
    trainExamplesIter.filter((example) => !testSetIndex.has(indexExample(example)));
    return { testExamples, trainExamplesIter };
  });
  const trainExamplesIter = derived(() => dataSplitByTrainAndTest().trainExamplesIter);
  derived(() => cell.output.testSet(dataSplitByTrainAndTest().testExamples));

  // Update the batch seed if/as needed. Allows restarting generation from an
  // earlier point.
  derived(() => {
    const seed = genConfig().initBatchSeed;
    if (seed !== null) {
      dataSplitByTrainAndTest().trainExamplesIter.state.seed = seed;
    }
  });

  function makeBatch(batchId: number, batchSize: number): Batch {
    const batchOriginal = trainExamplesIter({ depKind: DepKind.Lazy }).takeOutN(batchSize);
    const inputs = batchOriginal.map((example) => example.input);
    const outputs = batchOriginal.map((example) => example.output);
    const batchSeed = trainExamplesIter().state.seed;
    return { batchId, nextSeed: batchSeed, inputs, outputs };
  }

  let batchId = 0;
  while (
    !cell.finishRequested &&
    (genConfig().maxBatches === -1 || batchId < genConfig().maxBatches)
  ) {
    const batch = makeBatch(batchId++, genConfig().batchSize);
    await cell.outStream.trainBatches.send(batch);
  }
  cell.outStream.trainBatches.done();

  await cell.onceFinishRequested;
});
