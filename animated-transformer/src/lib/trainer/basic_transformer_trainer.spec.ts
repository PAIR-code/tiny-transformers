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

import * as transformer from '../transformer/transformer_gtensor';
import * as abtask from '../seqtasks/ab_task';
import {
  prepareBasicTaskTokenRep,
  strSeqPrepFn,
  singleNextTokenIdxOutputPrepFn,
} from '../tokens/token_gemb';
import { initTransformerTrainState } from './basic_transformer_trainer';
import { TrainStateConfig, trySgdTrainStep } from './train_state';
import * as jstree from '../js_tree/js_tree';
import { GTensor } from '../gtensor/gtensor';
import { varifyParams } from '../gtensor/params';

describe('basic_transformer_trainer', () => {
  it('AorBisMaxTask training', async () => {
    const taskConfig: abtask.AorBisMaxTaskConfig = {
      id: 'an AorBisMaxTask',
      kind: 'AorBisMaxTask',
      maxInputLen: 4,
      maxOutputLen: 4,
      genStateConfig: { seed: 0 },
    };
    const task = new abtask.AorBisMaxTask(taskConfig);

    const layerSpec: transformer.TransformerParamLayerSpec = {
      nHeads: 1,
      hasPosEncoding: false,
      computeSpec: { residuals: true, dropoutRate: 0 },
      // TODO: investigate: these make 0 gradients?
      layerNormFF: false,
      layerNormHeadsProjection: false,
      addLayerNormBias: false,
    };
    const decoderConfig: transformer.TransformerConfig = {
      id: 'a toy transformer',
      kind: 'Transformer',
      spec: {
        inputRep: 4,
        kqvRep: 3,
        layers: [layerSpec, layerSpec],
        dropoutRate: 0,
      },
      tokenRep: prepareBasicTaskTokenRep(task.baseVocab),
      init: {
        stddev: 0.5,
        mean: 0,
        seed: 1,
      },
    };

    const trainStateConfig: TrainStateConfig = {
      learningRate: 0.5,
      batchSize: 64,
      maxInputLength: taskConfig.maxInputLen,
      testSetSize: 0,
      trainSetSize: 64,
    };
    const params = varifyParams(transformer.initDecoderParams(decoderConfig));
    const model = {
      config: decoderConfig,
      params,
    };
    // console.log('initTransformerTrainState...');
    const trainState = initTransformerTrainState(
      task,
      model,
      strSeqPrepFn,
      singleNextTokenIdxOutputPrepFn,
      trainStateConfig
    );
    // Taking a couple of steps...
    const initLoss = trainState.batchMeanLoss;
    expect(trainState.nSteps).toBe(0);
    expect(trainState.nExamples).toBe(0);
    const stillTraining = trySgdTrainStep(trainState);
    expect(stillTraining).toBe(true);
    const newLoss = trainState.batchMeanLoss;
    expect(trainState.nSteps).toBe(1);
    expect(trainState.nExamples).toBe(trainState.batchExamples.length);
    expect(newLoss).toBeLessThan(initLoss);

    // Memory cleanup
    jstree.forEach((g: GTensor<any>) => g.dispose(), params);
    trainState.dispose();
  });
  it('AorBisMaxTaskWithDropout training', async () => {
    const taskConfig: abtask.AorBisMaxTaskConfig = {
      id: 'an AorBisMaxTask',
      kind: 'AorBisMaxTask',
      maxInputLen: 4,
      maxOutputLen: 4,
      genStateConfig: { seed: 0 },
    };
    const task = new abtask.AorBisMaxTask(taskConfig);

    const layerSpec: transformer.TransformerParamLayerSpec = {
      nHeads: 1,
      hasPosEncoding: true,
      computeSpec: { residuals: true, dropoutRate: 0.5 },
      layerNormFF: false,
      layerNormHeadsProjection: false,
      addLayerNormBias: false,
    };
    const decoderConfig: transformer.TransformerConfig = {
      id: 'a toy transformer',
      kind: 'Transformer',
      spec: {
        inputRep: 4,
        kqvRep: 3,
        layers: [layerSpec, layerSpec],
        dropoutRate: 0.5,
      },
      tokenRep: prepareBasicTaskTokenRep(task.baseVocab),
      init: {
        stddev: 0.5,
        mean: 0,
        seed: 2,
      },
    };

    const trainStateConfig: TrainStateConfig = {
      learningRate: 0.5,
      batchSize: 64,
      maxInputLength: taskConfig.maxInputLen,
      testSetSize: 0,
      trainSetSize: 64,
    };
    const tokenRep = prepareBasicTaskTokenRep(task.baseVocab);
    const params = varifyParams(transformer.initDecoderParams(decoderConfig));
    const model = {
      config: decoderConfig,
      params,
    };
    // console.log('initTransformerTrainState...');
    const trainState = initTransformerTrainState(
      task,
      model,
      strSeqPrepFn,
      singleNextTokenIdxOutputPrepFn,
      trainStateConfig
    );
    // Taking a couple of steps...
    const initLoss = trainState.batchMeanLoss;
    expect(trainState.nSteps).toBe(0);
    expect(trainState.nExamples).toBe(0);
    const stillTraining = trySgdTrainStep(trainState);
    expect(stillTraining).toBe(true);
    const newLoss = trainState.batchMeanLoss;
    expect(trainState.nSteps).toBe(1);
    expect(trainState.nExamples).toBe(trainState.batchExamples.length);
    // Transformer with 50% dropout should not learn much. However notice that both of the
    // tests here are very sensitive to the seed.
    expect(newLoss).toBeGreaterThanOrEqual(initLoss);

    // Memory cleanup
    jstree.forEach((g: GTensor<any>) => g.dispose(), params);
    trainState.dispose();
  });
});
