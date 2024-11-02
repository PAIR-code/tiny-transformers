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

import { defaultTransformerConfig } from 'src/lib/transformer/transformer_gtensor';
import { DepKind } from 'src/lib/signalspace/signalspace';
import {
  TrainConfig,
  trainerCellSpec,
  taskCellSpec,
  Checkpoint,
  TaskGenSate,
  SimpleMetrics,
  ModelUpdate,
  ModelUpdateKind,
} from './ailab';
import { LabEnv } from 'src/lib/weblab/lab-env';
import { defaultTinyWorldTaskConfig } from 'src/lib/seqtasks/tiny_worlds';

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

async function run() {
  const env = new LabEnv();
  const space = env.space;
  const { setable, derived } = space;

  const taskConfig = setable(structuredClone(defaultTinyWorldTaskConfig));
  const taskGenState = setable<TaskGenSate>({ kind: 'paused' });

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
  const providedModel = setable<ModelUpdate>({
    kind: ModelUpdateKind.ReinitFromConfig,
    config: defaultTransformerConfig(),
  });
  // Should be set by checkpoint...
  // const model = setable<EnvModel>({ config: defaultTransformerConfig() });
  const batchSize = derived(() => trainConfig().batchSize);
  const useBatchSeed = derived<number | null>(() => null);
  const testSetSize = setable(200);
  const taskCell = env.start(taskCellSpec, {
    taskConfig,
    testSetSize,
    batchSize,
    useBatchSeed,
    taskGenState,
  });

  const nextTrainBatch = await taskCell.outputs.nextTrainBatch;
  const testSet = await taskCell.outputs.testSet;

  // TODO: add data to each signal in a spec to say if the signal is pushed or
  // pulled. Pushed means that every worker set on the signal pushes the new
  // value here. Pulled means every time we read the value here, we make a fresh
  // request to the worker for it's state for that signal. We could also call,
  // or re-use the concept of Lazy vs Sync (although technically it would not be
  // sync...)
  //
  // Note: we can make the semantics here match signalspace. That would be cool.
  const trainerCell = env.start(trainerCellSpec, {
    modelUpdateEvents: modelUpdates,
    trainConfig,
    nextTrainBatch,
    testSet,
  });

  const genState: TaskGenSate = {
    kind: 'generating',
    curBatchId: 0,
    batchMaxQueueSize: trainConfig().metricReporting.metricFrequencyInBatches * 4,
    maxBatches: 5,
  };
  taskGenState.set(genState);
  // We don't need the batch values.
  env.pipeSignal(taskCell, trainerCell, 'nextTrainBatch', { keepSignalPushesHereToo: false });
  // But we would like to have the testSet here.
  env.pipeSignal(taskCell, trainerCell, 'testSet');

  // Note we could wrap the always derived in an then, but it's a bit ulgy with
  // all the closures. CONSIDER: We could also introduce a promiseAlwaysDerived
  // that does the then, and then sets always derived. That would be prettier.
  const lastMetrics = await trainerCell.outputs.lastTrainMetric;
  derived(() => {
    const batch = nextTrainBatch();
    const state = taskGenState({ depKind: DepKind.Lazy });
    if (state.kind === 'generating') {
      const metrics = lastMetrics();
      logMetrics(metrics);
      console.log('state', state);
      // TODO: we could if we wanted, directly pipe lastBatchId from trainer to
      // taskConfig?
      taskGenState.set({ ...genState, curBatchId: batch.batchId });
      if (batch.batchId >= genState.maxBatches) {
        taskGenState.set({ kind: 'finished' });
      }
    }
  });
  const ckpt = await trainerCell.outputs.checkpoint;
  derived(() => logCheckpoint(ckpt()));

  await taskCell.onceFinished;
  await trainerCell.onceFinished;
}
run();
