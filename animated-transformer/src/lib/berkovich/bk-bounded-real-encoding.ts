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

import { Rational, simplify } from './berkovich';

export interface BkBinarySearchStep {
  step: number;
  lower: number;
  upper: number;
  midpoint: number;
  rationalCenter: Rational;
  bit: number; // 1 for higher (>= mid), 0 for lower (< mid)
  direction: 'higher' | 'lower';
  rho: number;
  diskRadius: number;
}

/**
 * Computes binary search steps for a real target value x in [0, 1].
 * Each step halves the remaining sub-interval and produces a 2-adic bit.
 * Total steps = depth * 2 (digits right + digits left).
 */
export function computeBkBinarySearchSteps(
  x: number,
  depth: number = 2,
  prime: number = 2
): BkBinarySearchStep[] {
  const clampedX = Math.max(0, Math.min(1, x));
  const totalSteps = depth * 2;
  const result: BkBinarySearchStep[] = [];

  let lower = 0;
  let upper = 1;
  let num = 1n;
  let den = 2n;

  for (let k = 0; k < totalSteps; k++) {
    const mid = (lower + upper) / 2;
    const bit = clampedX >= mid ? 1 : 0;
    const direction = bit === 1 ? 'higher' : 'lower';

    let nextLower = lower;
    let nextUpper = upper;
    const nextDen = den * 2n;
    let nextNum = num;
    if (bit === 1) {
      nextLower = mid;
      nextNum = num * 2n + 1n;
    } else {
      nextUpper = mid;
      nextNum = num * 2n - 1n;
    }

    const rationalCenter = simplify({ num: nextNum, den: nextDen });
    const nextMid = (nextLower + nextUpper) / 2;

    result.push({
      step: k + 1,
      lower: nextLower,
      upper: nextUpper,
      midpoint: nextMid,
      rationalCenter,
      bit,
      direction,
      rho: -(k + 1),
      diskRadius: Math.pow(prime, -(k + 1))
    });

    lower = nextLower;
    upper = nextUpper;
    num = nextNum;
    den = nextDen;
  }

  return result;
}

/**
 * Calculates the exact leaf midpoint for decoded p-adic digits.
 */
export function decodeBkExactReal(steps: BkBinarySearchStep[]): number {
  if (!steps || steps.length === 0) return 0.5;
  const N = steps.length;
  const targetStep = N >= 2 ? steps[N - 2] : steps[N - 1];
  const den = Number(targetStep.rationalCenter.den);
  return den === 0 ? 0.5 : Number(targetStep.rationalCenter.num) / den;
}

/**
 * Decodes real value regularized by Berkovich disk log-radius rho.
 * - max large rho (rho = N) -> level of certainty m = 0 -> exactly 0.5 (root center)
 * - rho = N - 1 -> m = 1 -> 0.25 or 0.75 depending on rightmost digit b_{-1}
 * - rho = 0 -> exact leaf midpoint
 * - continuous rho -> linear interpolation between interval midpoints at floor(m) and ceil(m)
 */
export function decodeBkBiasedReal(
  steps: BkBinarySearchStep[],
  rho: number,
  useRhoNormalization: boolean = true
): number {
  if (!steps || steps.length === 0) return 0.5;
  if (!useRhoNormalization) {
    return decodeBkExactReal(steps);
  }
  const N = steps.length;
  const maxM = N - 1;
  const m = Math.max(0, Math.min(maxM, N - rho));
  if (m <= 0) {
    return 0.5;
  }
  if (m >= maxM) {
    return decodeBkExactReal(steps);
  }
  const k = Math.floor(m);
  const t = m - k;
  const mK = k === 0 ? 0.5 : steps[k - 1].midpoint;
  const mKNext = steps[k].midpoint;
  return (1 - t) * mK + t * mKNext;
}

/**
 * Returns the sub-interval bounds at level of certainty m.
 */
export function getBkCertaintyInterval(
  steps: BkBinarySearchStep[],
  m: number
): { lower: number; upper: number; mid: number } {
  if (!steps || steps.length === 0 || m <= 0) {
    return { lower: 0, upper: 1, mid: 0.5 };
  }
  const N = steps.length;
  if (m >= N) {
    const last = steps[N - 1];
    return { lower: last.lower, upper: last.upper, mid: last.midpoint };
  }
  const k = Math.min(Math.floor(m), N - 1);
  if (k === 0) {
    return { lower: 0, upper: 1, mid: 0.5 };
  }
  const step = steps[k - 1];
  return { lower: step.lower, upper: step.upper, mid: step.midpoint };
}
