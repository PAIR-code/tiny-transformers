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
import { asyncIterToSignal, DepKind, SignalSpace } from 'src/lib/signalspace/signalspace';
import { TrainConfig, ModelInit, ModelInitKind, TaskGenConfig } from './common.types';
import { trainerCellKind } from './trainer-cell.kind';
import { taskCellKind } from './task-cell.kind';
import { LabEnv } from 'src/lib/distr-signals/lab-env';
import { defaultTinyWorldTaskConfig } from 'src/lib/seqtasks/tiny_worlds';

describe('tiny-transformer-example/test-and-trainer', () => {
  beforeEach(() => {});

  it('simple task cell test: make 5 batches of data and trains a model', async () => {
    const space = new SignalSpace();
    const env = new LabEnv(space);
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
      trainForBatches: 11,
      randomSeed: 42, // for things like dropout.
      // Reporting / eval
      checkpointFrequencyInBatches: 10,
      metricReporting: {
        metricFrequencyInBatches: 2,
      },
    });
    const modelInit = setable<ModelInit>({
      kind: ModelInitKind.ReinitFromConfig,
      config: defaultTransformerConfig(),
    });

    // ------------------------------------------------------------------------
    //  Task
    const taskConfig = setable(defaultTinyWorldTaskConfig);
    const genConfig = setable<TaskGenConfig>({
      testSetSize: 5,
      initBatchId: 0,
      batchSize: trainConfig().batchSize,
      maxBatches: 11,
      initBatchSeed: 0,
    });

    const taskCell = env.init(taskCellKind, {
      inputs: { taskConfig, genConfig },
    });

    // ------------------------------------------------------------------------
    // Trainer cell
    const trainerCell = env.init(trainerCellKind, {
      inputs: { modelInit, trainConfig },
    });

    // ------------------------------------------------------------------------
    // Directly connect the cells streams... TODO: consider a pipe value in the
    // start function that can take in a pipe stream, and that modifies the
    // inStreams signature to not have the pipe value. Or maybe a very fancy
    // joint definition thing that takes both out and in and has some kind of
    // connecting syntax that removes piped values from both...
    trainerCell.inputs.testSet.addPipeFrom(taskCell.outputs.testSet);
    trainerCell.inStreams.trainBatches.addPipeFrom(taskCell.outStreams.trainBatches);

    taskCell.startWithWorker(new Worker(new URL('./task-cell.worker', import.meta.url)));
    trainerCell.startWithWorker(new Worker(new URL('./trainer-cell.worker', import.meta.url)));

    const testSet = await taskCell.outputs.testSet.connect();
    expect(testSet().length).toEqual(5);

    // ------------------------------------------------------------------------
    // Two different ways to think about working with output streams...
    // 1. reactive by turning it into a signal.

    const metrics = asyncIterToSignal(trainerCell.outStreams.metrics.connect(), space);
    // Note: only do this if you are sure that you will get some value.otherwise
    // you might get stuck waiting forever. If the metrics stream is empty, then
    // this will reject, which if not handled will crash stuff.
    const latestMetrics = await metrics.onceSignal;

    // 2. In thread, with async for loop. This is safer in the sense that the
    //    loop will end if the checkpoint stream is empty.
    const chpts = [];
    for await (const chpt of trainerCell.outStreams.checkpoint.connect()) {
      chpts.push(chpt);
    }

    taskCell.requestStop();
    trainerCell.requestStop();

    await taskCell.onceFinished;
    await trainerCell.onceFinished;

    expect(latestMetrics().batchId).toEqual(10);
    expect(chpts.length).toEqual(2);
  }, 20000);
});
