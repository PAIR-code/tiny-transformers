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
import {
  TrainConfig,
  trainerCellKind,
  taskCellKind,
  Checkpoint,
  SimpleMetrics,
  ModelUpdate,
  ModelUpdateKind,
  TaskGenConfig,
} from './common.types';
import { LabEnv } from 'src/lib/distr-signals/lab-env';
import { defaultTinyWorldTaskConfig } from 'src/lib/seqtasks/tiny_worlds';
import { SignalSpace } from 'src/lib/signalspace/signalspace';

function logMetrics(metrics: SimpleMetrics): void {
  console.log(
    `(batchid: ${metrics.batchId}) acc: ${metrics.values.accuracy}; loss: ${metrics.values.entropyLoss}`,
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
lastBatch.seed: ${JSON.stringify(checkpoint.lastBatch.nextSeed)}`,
  );
}

async function run() {
  const space = new SignalSpace();
  const env = new LabEnv(space);

  const { setable, derived } = space;

  const taskConfig = setable(structuredClone(defaultTinyWorldTaskConfig));

  const trainConfig = setable<TrainConfig>({
    id: 'initial config',
    kind: 'basicSeqTrainer',
    // training hyper-params
    randomSeed: 0,
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

  const genConfig = setable<TaskGenConfig>({
    initBatchId: 0,
    initBatchSeed: 0,
    maxBatches: 5,
    batchSize: 10,
    testSetSize: 3,
  });

  const modelUpdateEvents = setable<ModelUpdate>({
    kind: ModelUpdateKind.ReinitFromConfig,
    config: defaultTransformerConfig(),
  });
  // Should be set by checkpoint...
  // const model = setable<EnvModel>({ config: defaultTransformerConfig() });
  const taskMaker = env.start(taskCellKind, {
    inputs: {
      taskConfig,
      genConfig,
    },
  });

  // TODO: add data to each signal in a spec to say if the signal is pushed or
  // pulled. Pushed means that every worker set on the signal pushes the new
  // value here. Pulled means every time we read the value here, we make a fresh
  // request to the worker for it's state for that signal. We could also call,
  // or re-use the concept of Lazy vs Sync (although technically it would not be
  // sync...)
  //
  // Note: we can make the semantics here match signalspace. That would be cool.
  const trainer = env.start(trainerCellKind, {
    inputs: {
      modelUpdateEvents,
      trainConfig,
      testSet: taskMaker.cell.outputs.testSet,
    },
    inStreams: {
      trainBatches: taskMaker.cell.outStreams.trainBatches,
    },
  });

  for await (const m of trainer.cell.outStreams.metrics.connect()) {
    logMetrics(m);
  }

  for await (const c of trainer.cell.outStreams.checkpoint.connect()) {
    logCheckpoint(c);
  }

  await taskMaker.cell.onceFinished;
  await trainer.cell.onceFinished;
}

run();
