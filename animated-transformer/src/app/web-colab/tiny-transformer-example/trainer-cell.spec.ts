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
  ModelUpdate,
  ModelUpdateKind,
  Batch,
} from './ailab';
import { LabEnv } from 'src/lib/weblab/lab-env';
import { defaultTinyWorldTaskConfig, TinyWorldTask } from 'src/lib/seqtasks/tiny_worlds';
import { indexExample } from 'src/lib/seqtasks/util';

fdescribe('Trainer-Cell', () => {
  beforeEach(() => {});

  it('Send a few batches to a trainer cell, and watch the loss', async () => {
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
      checkpointFrequencyInBatches: 1,
      metricReporting: {
        metricFrequencyInBatches: 1,
      },
    });
    const modelUpdateEvents = setable<ModelUpdate>({
      kind: ModelUpdateKind.ReinitFromConfig,
      config: defaultTransformerConfig(),
    });

    // ------------------------------------------------------------------------
    //  Task
    const task = setable(new TinyWorldTask(defaultTinyWorldTaskConfig));

    // TODO: make state iterator take in the state for easier random stream
    // management?
    // CONSIDER: RandomStreamOf<Example> having a fork op. But also being savable.
    const dataSplitByTrainAndTest = derived(() => {
      const examplesIter = task().exampleIter.copy();
      const testExamples = examplesIter.takeOutN(50);
      const testSetIndex = new Set(testExamples.map(indexExample));
      const trainExamplesIter = examplesIter.copy();
      // With a generative synthetic world you can guarentee no duplicate example in
      // the test set and train set by filtering the test from the train.
      // This gives the optimal quality of test metric measurement.
      trainExamplesIter.filter((example) => !testSetIndex.has(indexExample(example)));
      return { testExamples, trainExamplesIter };
    });
    const trainExamplesIter = dataSplitByTrainAndTest().trainExamplesIter;
    const testSet = setable(dataSplitByTrainAndTest().testExamples);

    function makeBatch(batchId: number, batchSize: number): Batch {
      const batchOriginal = trainExamplesIter.takeOutN(batchSize);
      const inputs = batchOriginal.map((example) => example.input);
      const outputs = batchOriginal.map((example) => example.output);
      const batchSeed = trainExamplesIter.state.seed;
      return { batchId, nextSeed: batchSeed, inputs, outputs };
    }
    const nextTrainBatch = setable(makeBatch(0, trainConfig().batchSize));

    // ------------------------------------------------------------------------
    // Trainer cell
    const trainerCell = env.start(trainerCellSpec, {
      modelUpdateEvents,
      trainConfig,
      nextTrainBatch,
      testSet,
    });

    nextTrainBatch.set(makeBatch(1, trainConfig().batchSize));
    nextTrainBatch.set(makeBatch(2, trainConfig().batchSize));

    // ------------------------------------------------------------------------
    // Congestion control & run report/watch what's up...
    console.log('waiting for lastMetrics...');
    const lastMetrics = await trainerCell.outputs.lastTrainMetric;
    console.log('waiting for ckpt...');
    const ckpt = await trainerCell.outputs.checkpoint;

    expect(lastMetrics().batchId).toEqual(0);
    expect(ckpt().lastBatch.batchId).toEqual(0);

    console.log('waiting for terminate...');
    trainerCell.worker.terminate();
    // await trainerCell.onceFinished;
  });
});
