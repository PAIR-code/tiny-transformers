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
import { DepKind, promisifySignal } from 'src/lib/signalspace/signalspace';
import { TinyWorldTask, tinyWorldTaskKind } from 'src/lib/seqtasks/tiny_worlds';

console.log(tinyWorldTaskKind);

const cell = new StatefulCell(taskVars, taskCellSpec);
const { derived, setable } = cell.space;

cell.run(async () => {
  const taskConfig = await cell.inputPromises.taskConfig;
  const testSetSize = await cell.inputPromises.testSetSize;
  const startFromBatchSeed = await cell.inputPromises.lastBatchSeed;
  const batchSize = await cell.inputPromises.batchSize;
  const rawState = await cell.inputPromises.taskGenState;

  derived(() => console.log('rawState', rawState()));

  const state = promisifySignal(rawState);
  const maxBatchesQueueSize = await cell.inputPromises.maxBatchesQueueSize;
  let batchId = 0;
  let curBatchesQueueSize = 0;

  const task = derived(() => new TinyWorldTask(taskConfig()));

  console.log(task.space);

  // TODO: make state iterator take in the state for easier random stream
  // management?
  // CONSIDER: RandomStreamOf<Example> having a fork op. But also being savable.
  const dataSplitByTrainAndTest = derived(() => {
    const examplesIter = task().exampleIter.copy();
    const testExamples = examplesIter.takeOutN(testSetSize());
    const testSetIndex = new Set(testExamples.map(indexExample));
    const trainExamplesIter = examplesIter.copy();
    // With a generative synthetic world you can guarentee no duplicate example in
    // the test set and train set by filtering the test from the train.
    // This gives the optimal quality of test metric measurement.
    trainExamplesIter.filter((example) => !testSetIndex.has(indexExample(example)));
    return { testExamples, trainExamplesIter };
  });
  const trainExamplesIter = derived(() => dataSplitByTrainAndTest().trainExamplesIter);
  derived(() => cell.output('testSet', dataSplitByTrainAndTest().testExamples));

  // Update the batch seed if/as needed.
  // Allows restarting generation from an earlier point.
  derived(() => {
    const seed = startFromBatchSeed();
    if (seed !== null) {
      dataSplitByTrainAndTest().trainExamplesIter.state.seed = seed;
      // startFromBatchSeed.set(null, { updateStrategy: 'skipUpdate' });
    }
  });

  function makeBatch(batchId: number, batchSize: number): Batch {
    const batchOriginal = trainExamplesIter({ depKind: DepKind.Lazy }).takeOutN(batchSize);
    const inputs = batchOriginal.map((example) => example.input);
    const outputs = batchOriginal.map((example) => example.output);
    const batchSeed = trainExamplesIter().state.seed;
    return { batchId, nextSeed: batchSeed, inputs, outputs };
  }

  // state = onceState();
  while (state().cur.kind !== 'finished') {
    console.log('in-worker-state: ', state());
    for (
      const st = state();
      st.cur.kind === 'generating' && curBatchesQueueSize < maxBatchesQueueSize();
      ++batchId
    ) {
      const nextBatch = makeBatch(batchId, batchSize());
      // TODO: why not use the same syntax and have this be a setable signal?
      cell.output('nextTrainBatch', nextBatch);
      curBatchesQueueSize = batchId - st.cur.lastBatchId;
    }
    await state().next;
  }

  // while (state().cur.kind !== 'finished') {
  //   const st = state();
  //   console.log(st);
  //   await st.next;
  // }
});
