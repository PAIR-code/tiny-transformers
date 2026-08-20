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
  computeBkBinarySearchSteps,
  decodeBkExactReal,
  decodeBkBiasedReal,
  getBkCertaintyInterval
} from './bk-bounded-real-encoding';

describe('bk-bounded-real-encoding', () => {
  it('should compute binary search steps correctly for x = 0.6875 with depth = 2', () => {
    const steps = computeBkBinarySearchSteps(0.6875, 2);
    expect(steps.length).toBe(4);
    expect(steps.map((s) => s.bit)).toEqual([1, 0, 1, 1]);
    expect(decodeBkExactReal(steps)).toBeCloseTo(0.6875, 4);
  });

  it('should calculate biased real values across rho regularization levels', () => {
    const steps = computeBkBinarySearchSteps(0.6875, 2); // 1011_2

    // At rho = 4 (m = 0), regularized target is root midpoint 0.5
    expect(decodeBkBiasedReal(steps, 4, true)).toBeCloseTo(0.5, 4);

    // At rho = 3 (m = 1), regularized target is 0.75 (since b_{-1} = 1)
    expect(decodeBkBiasedReal(steps, 3, true)).toBeCloseTo(0.75, 4);

    // At rho = 0 (m = 4), regularized target is exact leaf midpoint 0.6875
    expect(decodeBkBiasedReal(steps, 0, true)).toBeCloseTo(0.6875, 4);

    // When disabled, returns exact leaf midpoint for any rho
    expect(decodeBkBiasedReal(steps, 4, false)).toBeCloseTo(0.6875, 4);
  });

  it('should calculate certainty intervals correctly', () => {
    const steps = computeBkBinarySearchSteps(0.6875, 2);
    const interval0 = getBkCertaintyInterval(steps, 0);
    expect(interval0).toEqual({ lower: 0, upper: 1, mid: 0.5 });

    const interval1 = getBkCertaintyInterval(steps, 1);
    expect(interval1.lower).toBe(0.5);
    expect(interval1.upper).toBe(1.0);
  });
});
