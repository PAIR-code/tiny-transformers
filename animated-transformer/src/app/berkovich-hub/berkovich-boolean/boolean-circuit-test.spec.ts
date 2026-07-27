/* Copyright 2026 Google LLC. All Rights Reserved.

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

import { describe, it, expect } from 'vitest';
import {
  BerkovichBooleanLearner,
  PRESET_BOOLEAN_FUNCTIONS,
  buildBooleanDataset,
  BerkovichBooleanConfig
} from './models/berkovich-boolean-learner';

describe('Universal Boolean Circuit Learning Verification', () => {
  for (const preset of PRESET_BOOLEAN_FUNCTIONS) {
    it(`verifies 100% accuracy on ${preset.name} with 4 DNF pools`, () => {
      const numPools = 4;
      const dataset = buildBooleanDataset(preset.truthTable, preset.numVars);

      const learner = new BerkovichBooleanLearner(
        preset.numVars,
        numPools,
        2,
        'pre-fixed-leaves',
        'separated-branches'
      );

      const config: BerkovichBooleanConfig = {
        prime: 2,
        numPools,
        lr: 0.05,
        reg: 0.01,
        beta: 2.0,
        targetInitMode: 'pre-fixed-leaves',
        poolInitMode: 'separated-branches',
        repulsionReg: 0.02,
        updateTargetCenters: false
      };

      let finalAcc = 0;
      for (let epoch = 0; epoch < 100; epoch++) {
        const res = learner.trainBatch(dataset, config);
        finalAcc = res.accuracy;
        if (finalAcc === 1.0) break;
      }

      console.log(`Preset: ${preset.name} -> Final Accuracy: ${(finalAcc * 100).toFixed(1)}%`);
      expect(finalAcc).toBeGreaterThanOrEqual(0.9999);
    });
  }
});
