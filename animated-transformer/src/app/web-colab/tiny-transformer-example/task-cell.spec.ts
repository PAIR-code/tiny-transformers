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
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RandLmTaskConfig } from 'src/lib/seqtasks/util';
import { defaultTransformerConfig } from 'src/lib/transformer/transformer_gtensor';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { taskRegistry } from 'src/lib/seqtasks/task_registry';
import {
  EnvModel,
  TrainConfig,
  trainerCellSpec,
  taskCellSpec,
  Checkpoint,
  TaskGenSate,
  SimpleMetrics,
} from './ailab';
import { LabEnv } from 'src/lib/weblab/lab-env';
import { getUniGramTinyWorldConfig } from 'src/lib/seqtasks/tiny_worlds_ngram_configs';
import { TinyWorldTask } from 'src/lib/seqtasks/tiny_worlds';

xdescribe('Task-Cell', () => {
  beforeEach(() => {});

  it('simple task cell test', async () => {
    const env = new LabEnv();

    // Consider... one liner... but maybe handy to have the 'space' object to debug.
    // const { writable, computed } = new SignalSpace();
    const space = new SignalSpace();
    const { setable, derived, derivedEvery } = space;

    const taskKinds = Object.keys(taskRegistry.kinds);
    const taskKind = setable<string>(taskKinds[0]);
    const taskConfig = derived(() =>
      structuredClone(taskRegistry.kinds[taskKind()].defaultConfig as RandLmTaskConfig)
    );
    // const batch = derived<Batch>(() => makeBatch(batchId(), trainConfig().batchSize));
    const taskGenState = setable<TaskGenSate>({ kind: 'paused' });
    const batchSize = derived(() => 10);
    const lastBatchSeed = derived<number | null>(() => null);
    const testSetSize = setable(5);
    const maxBatchesQueueSize = derived(() => 2);
    const taskCell = env.start(taskCellSpec, {
      taskConfig,
      testSetSize,
      batchSize,
      lastBatchSeed,
      taskGenState,
      maxBatchesQueueSize,
    });
    taskGenState.set({ kind: 'generating', lastBatchId: 0 });
    console.log('taskGenState2', taskGenState());
    const nextTrainBatch = await taskCell.outputs.nextTrainBatch;
    const genForBatches = 5;

    console.log('got first train Batch', nextTrainBatch());
    derivedEvery(() => {
      const batch = nextTrainBatch();
      const state = taskGenState();
      console.log('batch', batch);
      console.log('state', state);
      if (state.kind === 'generating') {
        console.log('state', state);
        // TODO: we could if we wanted, directly pipe lastBatchId from trainer to
        // taskConfig?
        taskGenState.set({ kind: 'generating', lastBatchId: batch.batchId });
        if (batch.batchId >= genForBatches) {
          taskGenState.set({ kind: 'finished' });
        }
      }
    });
    const outputVars = await taskCell.onceFinished;

    expect(outputVars.nextTrainBatch().batchId).toEqual(3);
  });
});
