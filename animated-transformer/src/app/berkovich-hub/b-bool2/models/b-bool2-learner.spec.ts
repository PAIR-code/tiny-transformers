/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
  BBool2Learner,
  ALL_16_BOOLEAN_FUNCTIONS,
  computeExactCoefficients,
  buildDatasetFromTruthTable,
  BBool2Config
} from './b-bool2-learner';

describe('BBool2Learner Multilinear Boolean Models', () => {
  const defaultConfig: BBool2Config = {
    prime: 2,
    lr: 0.1,
    reg: 0.01,
    beta: 2.0,
    digitsLeft: 3,
    digitsRight: 2,
    mode: 'berkovich',
    updateCenters: true,
    updateRadii: true
  };

  it('verifies exact algebraic multilinear coefficients for all 16 boolean functions', () => {
    for (const fnInfo of ALL_16_BOOLEAN_FUNCTIONS) {
      const coeffs = computeExactCoefficients(fnInfo.truthTable);
      expect(coeffs.b).toBe(fnInfo.exactCoefficients.b);
      expect(coeffs.w1).toBe(fnInfo.exactCoefficients.w1);
      expect(coeffs.w2).toBe(fnInfo.exactCoefficients.w2);
      expect(coeffs.w3).toBe(fnInfo.exactCoefficients.w3);

      const learner = new BBool2Learner(2, 'zero');
      learner.setExactSolutionForTruthTable(fnInfo.truthTable);

      const dataset = buildDatasetFromTruthTable(fnInfo.truthTable);
      for (const sample of dataset) {
        const fwd = learner.forward(sample.inputs, defaultConfig, sample.target);
        expect(fwd.pred).toBe(sample.target);
        expect(fwd.loss).toBeLessThan(0.05);
      }
    }
  });

  it('verifies XOR (x1 ⊕ x2) multilinear evaluation with b=0, w1=1, w2=1, w3=-2', () => {
    const learner = new BBool2Learner(2, 'exact-xor');
    const xorTruthTable: [number, number, number, number] = [0, 1, 1, 0];
    const dataset = buildDatasetFromTruthTable(xorTruthTable);

    const fwd00 = learner.forward([0, 0], defaultConfig, 0);
    const fwd01 = learner.forward([0, 1], defaultConfig, 1);
    const fwd10 = learner.forward([1, 0], defaultConfig, 1);
    const fwd11 = learner.forward([1, 1], defaultConfig, 0);

    expect(fwd00.pred).toBe(0);
    expect(fwd01.pred).toBe(1);
    expect(fwd10.pred).toBe(1);
    expect(fwd11.pred).toBe(0);

    expect(fwd00.f_out.center.num).toBe(0n);
    expect(fwd01.f_out.center.num).toBe(1n);
    expect(fwd10.f_out.center.num).toBe(1n);
    expect(fwd11.f_out.center.num).toBe(0n); // 0 + 1 + 1 - 2 = 0
  });

  it('verifies training converges to 100% accuracy on XOR with gradient descent', () => {
    const learner = new BBool2Learner(2, 'zero');
    const xorTruthTable: [number, number, number, number] = [0, 1, 1, 0];
    const dataset = buildDatasetFromTruthTable(xorTruthTable);

    let finalAcc = 0;
    for (let epoch = 0; epoch < 60; epoch++) {
      const res = learner.trainBatch(dataset, defaultConfig);
      finalAcc = res.accuracy;
      if (finalAcc >= 0.9999) break;
    }

    expect(finalAcc).toBeGreaterThanOrEqual(0.9999);
  });
});
