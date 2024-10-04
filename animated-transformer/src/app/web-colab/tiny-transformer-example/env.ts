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
import { LabState } from 'src/lib/weblab/lab-state';

function logMetrics(metrics: SimpleMetrics): void {
  console.log(
    `(batchid: ${metrics.batchId}) acc: ${metrics.values.accuracy}; loss: ${metrics.values.entropyLoss}`
  );
}

function logCheckpoint(checkpoint: Checkpoint): void {
  const metrics = checkpoint.metrics;
  console.log(
    `Checkpoint!
batchid: ${metrics.batchId}
acc: ${metrics.values.accuracy}
loss: ${metrics.values.entropyLoss}
lastBatch.batchId: ${JSON.stringify(checkpoint.lastBatch.batchId)}
lastBatch.seed: ${JSON.stringify(checkpoint.lastBatch.nextSeed)}`
  );
}

const env = new LabEnv();

// TODO: wrap signals here as namedSignals, with an optional saver, and then we
// can directly provide outputs from one, to inputs of another.
async function run() {
  // Consider... one liner... but maybe handy to have the 'space' object to debug.
  // const { writable, computed } = new SignalSpace();
  const space = new SignalSpace();
  const { setable, derived, derivedEvery } = space;

  const taskKinds = Object.keys(taskRegistry.kinds);
  const taskKind = setable<string>(taskKinds[0]);
  const taskConfig = derived(() =>
    structuredClone(taskRegistry.kinds[taskKind()].defaultConfig as RandLmTaskConfig)
  );
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
  // const batch = derived<Batch>(() => makeBatch(batchId(), trainConfig().batchSize));
  const taskGenState = setable<TaskGenSate>({ kind: 'paused' });
  const initModel = setable<EnvModel>({ config: defaultTransformerConfig() });
  // Should be set by checkpoint...
  // const model = setable<EnvModel>({ config: defaultTransformerConfig() });
  const batchSize = derived(() => trainConfig().batchSize);
  const lastBatchSeed = derived<number | null>(() => null);
  const testSetSize = setable(200);
  const maxBatchesQueueSize = derived(
    () => trainConfig().metricReporting.metricFrequencyInBatches * 4
  );
  const taskCell = env.start(taskCellSpec, {
    taskConfig,
    testSetSize,
    batchSize,
    lastBatchSeed,
    taskGenState,
    maxBatchesQueueSize,
  });

  const nextTrainBatch = await taskCell.outputs.nextTrainBatch;
  const testSet = await taskCell.outputs.testSet;

  // TODO: add data to each signal in a spec to say if the signal is tracked or
  // untracked. Tracked means that the worker set ops, push the new value here.
  // Untracked means every time we read the value, we made a fresh request to
  // the worker for it's state.
  //
  // Note: we can make the semantics here match signalspace. That would be cool.
  const trainerCell = env.start(trainerCellSpec, {
    initModel,
    trainConfig,
    nextTrainBatch,
    testSet,
  });

  taskGenState.set({ kind: 'generating', lastBatchId: 0 });
  // We don't need the batch values.
  env.pipeSignal(taskCell, trainerCell, 'nextTrainBatch', { keepSignalPushesHereToo: false });
  // But we would like to have the testSet here.
  env.pipeSignal(taskCell, trainerCell, 'testSet');

  // Note we could wrap the always derived in an then, but it's a bit ulgy with
  // all the closures. CONSIDER: We could also introduce a promiseAlwaysDerived
  // that does the then, and then sets always derived. That would be prettier.
  const lastMetrics = await trainerCell.outputs.lastTrainMetric;
  derivedEvery(() => {
    const metrics = lastMetrics();
    const state = taskGenState();
    if (state.kind === 'generating') {
      logMetrics(metrics);
      // TODO: we could if we wanted, directly pipe lastBatchId from trainer to
      // taskConfig?
      taskGenState.set({ kind: 'generating', lastBatchId: metrics.batchId });
      if (metrics.batchId >= trainConfig().trainForBatches) {
        taskGenState.set({ kind: 'finished' });
      }
    }
  });
  const ckpt = await trainerCell.outputs.checkpoint;
  derivedEvery(() => logCheckpoint(ckpt()));

  await taskCell.onceFinished;
  await trainerCell.onceFinished;
}
run();
