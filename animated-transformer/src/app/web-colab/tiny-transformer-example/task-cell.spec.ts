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
import { taskCellSpec, TaskGenSate } from './ailab';
import { LabEnv } from 'src/lib/weblab/lab-env';
import { defaultTinyWorldTaskConfig } from 'src/lib/seqtasks/tiny_worlds';

describe('Task-Cell', () => {
  beforeEach(() => {});

  it('simple task cell test: make 5 batches of data', async () => {
    const env = new LabEnv();
    const space = env.space;
    const { setable, derived } = space;

    const taskConfig = setable(defaultTinyWorldTaskConfig);
    const taskGenState = setable<TaskGenSate>({ kind: 'paused' });
    const batchSize = setable(10);
    const useBatchSeed = setable<number | null>(null);
    const testSetSize = setable(5);
    const taskCell = env.start(taskCellSpec, {
      taskConfig,
      testSetSize,
      batchSize,
      useBatchSeed,
      taskGenState,
    });
    const genState: TaskGenSate = {
      kind: 'generating',
      curBatchId: 0,
      batchMaxQueueSize: 2,
      maxBatches: 5,
    };
    taskGenState.set(genState);
    console.log(`taskGenState: ${JSON.stringify(taskGenState())}`);
    console.log(`waiting for nextTrainBatch...`);
    const nextTrainBatch = await taskCell.outputs.nextTrainBatch;

    // TODO: create a sensible queue abstraction.
    console.log(`nextTrainBatch: ${JSON.stringify(nextTrainBatch().batchId)}`);
    derived(() => {
      const batch = nextTrainBatch();
      const state = taskGenState({ depKind: DepKind.Lazy });
      if (state.kind === 'generating') {
        console.log('state', state);
        // TODO: we could if we wanted, directly pipe lastBatchId from trainer to
        // taskConfig?
        taskGenState.set({ ...genState, curBatchId: batch.batchId });
        if (batch.batchId >= genState.maxBatches - 1) {
          taskGenState.set({ kind: 'finished' });
        }
      }
    });
    await taskCell.onceFinished;
    console.log(`final batch id: ${nextTrainBatch().batchId}`);
    expect(nextTrainBatch().batchId).toEqual(4);
  });
});
