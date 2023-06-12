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


import { trySgdTrainStep } from 'src/lib/trainer/train_state';
import * as abtask from '../../src/lib/seqtasks/ab_task';
import { BasicRandSeededTaskConfig, prepareBasicTaskTokenRep } from '../../src/lib/seqtasks/util';
import { TransformerConfig, initTransformerTrainState, examplePrepFinalMaskFn, } from '../../src/lib/trainer/basic_transformer_trainer';


const d3 = window.d3;

export function initTrainer() {
  const decoderConfig: TransformerConfig = {
    spec: {
      inputRep: 4,
      kqvRep: 3,
      layers: [
        {
          nHeads: 1,
          hasPosEncoding: false,
          computeSpec: { residuals: true },
          layerNormFF: false,
          layerNormHeadsProjection: false,
          addLayerNormBias: false,
        },
        // { nHeads: 1, hasPosEncoding: false }
      ],
    },
    init: {
      paramInitStd: 0.5,
      paramInitMean: 0,
    }
  };

  const config: BasicRandSeededTaskConfig = {
    name: 'AorBisMaxTask',
    maxInputLen: 4,
    maxOutputLen: 4,
    seed: 47,
  };

  const trainStateConfig = {
    learningRate: 0.5,
    updateEveryNsteps: 1,
    batchSize: 64,
  };

  const task = new abtask.AorBisMaxTask(config);
  const tokenRep = prepareBasicTaskTokenRep(
    task.baseVocab, decoderConfig.spec.inputRep);
  console.log('initTransformerTrainState...');
  const trainState = initTransformerTrainState(
    task, examplePrepFinalMaskFn, tokenRep, trainStateConfig, decoderConfig
  );
  console.log('SgdTrainTransfomer...');

  async function trainLoop(steps: number) {
    for (let i = 0; i < steps; i++) {
      trySgdTrainStep(trainState);
    }
  }
  // trainLoop(10)
  trySgdTrainStep(trainState);
  // trainStep()
  // trainStep()

  d3.select(window).on('click', () => trySgdTrainStep(trainState)))
}


if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    try {
      if (newModule) {
        console.clear()
        newModule.initTrainer()
      }
    } catch (e) {
      console.log(e)
    }
  })
}
