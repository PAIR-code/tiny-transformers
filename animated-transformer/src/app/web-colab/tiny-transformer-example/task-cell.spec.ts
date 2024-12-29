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
import { DepKind, SignalSpace } from 'src/lib/signalspace/signalspace';
import { Batch, taskCellSpec, TaskGenConfig } from './ailab';
import { LabEnv } from 'src/lib/distr-signal-exec/lab-env';
import { defaultTinyWorldTaskConfig } from 'src/lib/seqtasks/tiny_worlds';

describe('Task-Cell', () => {
  beforeEach(() => {});

  it('simple task cell test: make 5 batches of data', async () => {
    const space = new SignalSpace();
    const env = new LabEnv(space);
    const { setable } = space;

    const taskConfig = setable(defaultTinyWorldTaskConfig);
    const genConfig = setable<TaskGenConfig>({
      initBatchId: 0,
      initBatchSeed: 0,
      maxBatches: 5,
      batchSize: 10,
      testSetSize: 3,
    });
    const taskCell = env.start(taskCellSpec, { inputs: { taskConfig, genConfig } });
    const testSet = await taskCell.outputs.testSet.onceReady;
    expect(testSet().length).toEqual(3);

    const trainBatches: Batch[] = [];
    for await (const trainBatch of taskCell.outStreams.trainBatches) {
      trainBatches.push(trainBatch);
    }
    await taskCell.requestStop();
    await taskCell.onceFinished;

    expect(trainBatches.length).toEqual(5);
    expect(trainBatches[0].batchId).toEqual(0);
    expect(trainBatches[0].inputs.length).toEqual(10);
    expect(trainBatches[0].outputs.length).toEqual(10);
    expect(trainBatches[trainBatches.length - 1].batchId).toEqual(4);
  });
});
