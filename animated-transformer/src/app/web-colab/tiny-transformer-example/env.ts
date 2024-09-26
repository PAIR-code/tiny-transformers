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

import { indexExample, RandLmTaskConfig } from 'src/lib/seqtasks/util';
import {
  defaultTransformerConfig,
  initDecoderParams,
  TransformerConfig,
} from 'src/lib/transformer/transformer_gtensor';
import { TrainStateConfig } from 'src/lib/trainer/train_state';
import { SignalSpace, SetableSignal } from 'src/lib/weblab/signalspace';
import { taskRegistry } from 'src/lib/seqtasks/task_registry';
import { prepareBasicTaskTokenRep, strSeqPrepFnAddingFinalMask } from 'src/lib/tokens/token_gemb';
import { GTensor } from 'src/lib/gtensor/gtensor';
import {
  Batch,
  EnvModel,
  TaskVars,
  TrainerVars,
  TrainConfig,
  trainerCellSpec,
  taskCellSpec,
  Checkpoint,
} from './ailab';
import { LabEnv } from 'src/lib/weblab/lab-env';
import { LabState } from 'src/lib/weblab/lab-state';
import { varifyParams } from 'src/lib/gtensor/params';
import { Metrics } from 'src/lib/weblab/cellspec';

type SimpleMetrics = Metrics<'entropyLoss' | 'accuracy'>;

// Consider... one liner... but maybe handy to have the object to debug.
// const { writable, computed } = new SignalSpace();
const space = new SignalSpace();
const { setable, derived, alwaysDerived } = space;

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
  // Reporting / eval
  checkpointFrequencyInBatches: 100,
  metricReporting: {
    metricFrequencyInBatches: 10,
  },
});

const testSetSize = setable(200);

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

const batchId = setable(0);
// const batch = derived<Batch>(() => makeBatch(batchId(), trainConfig().batchSize));
const initBatchSeed = setable(42);

const initModel = setable<EnvModel>({ config: defaultTransformerConfig() });
const model = setable<EnvModel>({ config: defaultTransformerConfig() });

const state = new LabState();
const env = new LabEnv(state);

// TODO: wrap signals here as namedSignals, with an optional saver, and then we
// can directly provide outputs from one, to inputs of another.

async function run() {
  const batchSize = derived(() => trainConfig().batchSize);
  const lastTrainBatch = derived<Batch | null>(() => null);
  const taskCell = env.start(taskCellSpec, {
    taskConfig,
    testSetSize,
    batchSize,
    lastTrainBatch,
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

  // We don't need the batch values.
  env.pipeSignal(taskCell, trainerCell, 'nextTrainBatch', { keepSignalPushesHereToo: false });
  // But we would like to have the testSet here.
  env.pipeSignal(taskCell, trainerCell, 'testSet');

  // Note we could wrap the always derived in an then, but it's a bit ulgy with
  // all the closures. CONSIDER: We could also introduce a promiseAlwaysDerived
  // that does the then, and then sets always derived. That would be prettier.
  const lastMetrics = await trainerCell.outputs.lastTrainMetric;
  alwaysDerived(() => logMetrics(lastMetrics()));
  const ckpt = await trainerCell.outputs.checkpoint;
  alwaysDerived(() => logCheckpoint(ckpt()));
}
run();

// function* batchGenerator(batchNum: number, batchSize: number): Iterator<> {
//   for (let batchId = 0; batchId < batchNum; batchId += 1) {
//     yield [batchInput, batchOutput];
//   }
// }
