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
import { defaultTransformerConfig } from 'src/lib/transformer/transformer_gtensor';
import { DepKind, SignalSpace } from 'src/lib/signalspace/signalspace';
import {
  TrainConfig,
  trainerCellSpec,
  taskCellSpec,
  TaskGenSate,
  ProvidedModel,
  InitModelAction,
} from './ailab';
import { LabEnv } from 'src/lib/weblab/lab-env';
import { defaultTinyWorldTaskConfig } from 'src/lib/seqtasks/tiny_worlds';

xdescribe('Trainer-Cell', () => {
  beforeEach(() => {});

  it('simple task cell test: make 5 batches of data and trains a model', async () => {
    const env = new LabEnv();
    const space = env.space;
    const { setable, derived } = space;

    // ------------------------------------------------------------------------
    //  Model Training
    const trainConfig = setable<TrainConfig>({
      id: 'initial config',
      kind: 'basicSeqTrainer',
      // training hyper-params
      learningRate: 0.5,
      batchSize: 64,
      maxInputLength: 10,
      trainForBatches: 100,
      // Reporting / eval
      checkpointFrequencyInBatches: 100,
      metricReporting: {
        metricFrequencyInBatches: 10,
      },
    });
    const providedModel = setable<ProvidedModel>({
      kind: InitModelAction.ReinitFromConfig,
      config: defaultTransformerConfig(),
    });
    const batchSize = derived(() => trainConfig().batchSize);

    // ------------------------------------------------------------------------
    //  Task
    const taskConfig = setable(defaultTinyWorldTaskConfig);
    const taskGenState = setable<TaskGenSate>({ kind: 'paused' });
    // const batchSize = setable(10);
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
      batchMaxQueueSize: trainConfig().metricReporting.metricFrequencyInBatches * 4,
      maxBatches: 5,
    };
    taskGenState.set(genState);
    console.log(`taskGenState: ${JSON.stringify(taskGenState())}`);
    console.log(`waiting for nextTrainBatch...`);

    const nextTrainBatch = await taskCell.outputs.nextTrainBatch;
    const testSet = await taskCell.outputs.testSet;

    // ------------------------------------------------------------------------
    // Trainer cell

    // TODO: add data to each signal in a spec to say if the signal is pushed or
    // pulled. Pushed means that every worker set on the signal pushes the new
    // value here. Pulled means every time we read the value here, we make a fresh
    // request to the worker for it's state for that signal. We could also call,
    // or re-use the concept of Lazy vs Sync (although technically it would not be
    // sync...)
    //
    // Note: we can make the semantics here match signalspace. That would be cool.
    const trainerCell = env.start(trainerCellSpec, {
      providedModel,
      trainConfig,
      nextTrainBatch,
      testSet,
    });

    // ------------------------------------------------------------------------
    // Connect the cells...

    // We don't need the batch values.
    env.pipeSignal(taskCell, trainerCell, 'nextTrainBatch', { keepSignalPushesHereToo: false });
    // But we would like to have the testSet here.
    env.pipeSignal(taskCell, trainerCell, 'testSet');

    // ------------------------------------------------------------------------
    // Congestion control & run report/watch what's up...

    const lastMetrics = await trainerCell.outputs.lastTrainMetric;
    derived(() => {
      const batch = nextTrainBatch();
      const state = taskGenState({ depKind: DepKind.Lazy });
      if (state.kind === 'generating') {
        console.log(lastMetrics());
        // console.log('state', state);
        // TODO: we could if we wanted, directly pipe lastBatchId from trainer to
        // taskConfig?
        taskGenState.set({ ...genState, curBatchId: batch.batchId });
        if (batch.batchId >= genState.maxBatches) {
          taskGenState.set({ kind: 'finished' });
        }
      }
    });
    const ckpt = await trainerCell.outputs.checkpoint;
    // derived(() => logCheckpoint(ckpt()));

    expect(nextTrainBatch().batchId).toEqual(4);

    await taskCell.onceFinished;
    await trainerCell.onceFinished;

    // // TODO: create a sensible queue abstraction.
    // console.log(`nextTrainBatch: ${JSON.stringify(nextTrainBatch().batchId)}`);
    // derived(() => {
    //   const batch = nextTrainBatch();
    //   const state = taskGenState({ depKind: DepKind.Lazy });
    //   if (state.kind === 'generating') {
    //     console.log('state', state);
    //     // TODO: we could if we wanted, directly pipe lastBatchId from trainer to
    //     // taskConfig?
    //     taskGenState.set({ ...genState, curBatchId: batch.batchId });
    //     if (batch.batchId >= genState.maxBatches - 1) {
    //       taskGenState.set({ kind: 'finished' });
    //     }
    //   }
    // });
    // await taskCell.onceFinished;
    // console.log(`final batch id: ${nextTrainBatch().batchId}`);
  });
});
