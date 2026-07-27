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

  it('verifies 2D Unit Square Embedding Map heatmap shading is NOT all-blue or all-red when 100% accuracy is reached on XOR', () => {
    const numPools = 4;
    const xorPreset = PRESET_BOOLEAN_FUNCTIONS[0]; // XOR
    const dataset = buildBooleanDataset(xorPreset.truthTable, xorPreset.numVars);

    const learner = new BerkovichBooleanLearner(
      xorPreset.numVars,
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

    for (let epoch = 0; epoch < 100; epoch++) {
      const res = learner.trainBatch(dataset, config);
      if (res.accuracy >= 0.9999) break;
    }

    // Evaluate predictions across the 4 quadrants of [0, 1] x [0, 1]
    const prob00 = learner.forward([0.1, 0.1], config).probs[1]; // (0,0) -> 0 (Red)
    const prob01 = learner.forward([0.1, 0.9], config).probs[1]; // (0,1) -> 1 (Blue)
    const prob10 = learner.forward([0.9, 0.1], config).probs[1]; // (1,0) -> 1 (Blue)
    const prob11 = learner.forward([0.9, 0.9], config).probs[1]; // (1,1) -> 0 (Red)

    expect(prob00).toBeLessThan(0.5); // Red
    expect(prob01).toBeGreaterThan(0.5); // Blue
    expect(prob10).toBeGreaterThan(0.5); // Blue
    expect(prob11).toBeLessThan(0.5); // Red

    // Verify heatmap grid across 16x16 sampling points contains both blue (>0.5) and red (<0.5) regions
    let blueCount = 0;
    let redCount = 0;
    for (let i = 0; i < 16; i++) {
      const x1 = (i + 0.5) / 16;
      for (let j = 0; j < 16; j++) {
        const x2 = (j + 0.5) / 16;
        const p1 = learner.forward([x1, x2], config).probs[1];
        if (p1 >= 0.5) blueCount++;
        else redCount++;
      }
    }

    expect(blueCount).toBeGreaterThan(0);
    expect(redCount).toBeGreaterThan(0);
    expect(blueCount + redCount).toBe(256);
  });
});
