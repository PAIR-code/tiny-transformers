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
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { TrainConfig, ModelInit, ModelInitKind, Batch } from './common.types';
import { trainerCellKind } from './trainer-cell.kind';
import { LabEnv } from 'src/lib/distr-signals/lab-env';
import { defaultTinyWorldTaskConfig, TinyWorldTask } from 'src/lib/seqtasks/tiny_worlds';
import { indexExample } from 'src/lib/seqtasks/util';

describe('tiny-transformer-example/trainer-cell', () => {
  beforeEach(() => {});

  it('Send a few batches to a trainer cell, and watch the loss', async () => {
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
      batchSize: 16,
      maxInputLength: 2,
      trainForBatches: 3,
      randomSeed: 42,
      // Reporting / eval
      checkpointFrequencyInBatches: 4,
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
    const task = setable(new TinyWorldTask(defaultTinyWorldTaskConfig));

    // TODO: make state iterator take in the state for easier random stream
    // management?
    // CONSIDER: RandomStreamOf<Example> having a fork op. But also being savable.
    const dataSplitByTrainAndTest = derived(() => {
      const examplesIter = task().exampleIter.copy();
      const testExamples = examplesIter.takeOutN(16);
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

    // ------------------------------------------------------------------------
    // Trainer cell
    const trainer = env.start(
      trainerCellKind,
      new Worker(new URL('./trainer-cell.worker', import.meta.url)),
      {
        inputs: {
          modelInit,
          trainConfig,
          testSet,
        },
      },
    );

    const trainBatchSender = trainer.cell.inStreams.trainBatches.connect();
    trainBatchSender.send(makeBatch(0, trainConfig().batchSize));
    trainBatchSender.send(makeBatch(1, trainConfig().batchSize));
    trainBatchSender.send(makeBatch(2, trainConfig().batchSize));
    trainBatchSender.send(makeBatch(3, trainConfig().batchSize));
    trainBatchSender.send(makeBatch(4, trainConfig().batchSize));
    trainBatchSender.done();

    // ------------------------------------------------------------------------
    // Congestion control & run report/watch what's up...
    const lastMetricsIter = trainer.cell.outStreams.metrics.connect();
    const ckptIter = trainer.cell.outStreams.checkpoint.connect();

    const m0 = (await lastMetricsIter.next()).value;
    const c0 = (await ckptIter.next()).value;
    const m1 = (await lastMetricsIter.next()).value;
    const m2 = (await lastMetricsIter.next()).value;
    const c2 = (await ckptIter.next()).value;

    expect(m0!.batchId).toEqual(0);
    expect(c0!.lastBatch.batchId).toEqual(0);
    // expect(countSerializedParams(c1.serializedParams)).toEqual(2);
    expect(m1!.batchId).toEqual(2);
    expect(m2!.batchId).toEqual(4);
    expect(c2!.lastBatch.batchId).toEqual(4);

    trainer.cell.requestStop();
    await trainer.cell.onceFinished;
  }, 7000);
});
