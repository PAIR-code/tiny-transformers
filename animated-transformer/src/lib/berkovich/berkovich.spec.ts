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
  Rational,
  simplify,
  add,
  subtract,
  multiply,
  rationalToNumber,
  formatRational,
  parseToRational,
  getValuation,
  getPadicDigits,
  getAlignedDigits,
  isVertex,
  computeVertexCandidates,
  computeContinuousStep,
  truncateToTreeRange
} from './berkovich';

describe('Berkovich Math Library - Rational Arithmetic', () => {
  it('should simplify fractions correctly', () => {
    expect(simplify({ num: 4n, den: 6n })).toEqual({ num: 2n, den: 3n });
    expect(simplify({ num: -5n, den: -10n })).toEqual({ num: 1n, den: 2n });
    expect(simplify({ num: 3n, den: -9n })).toEqual({ num: -1n, den: 3n });
  });

  it('should add fractions correctly', () => {
    const r1 = { num: 1n, den: 3n };
    const r2 = { num: 1n, den: 6n };
    expect(add(r1, r2)).toEqual({ num: 1n, den: 2n });
  });

  it('should subtract fractions correctly', () => {
    const r1 = { num: 1n, den: 2n };
    const r2 = { num: 1n, den: 3n };
    expect(subtract(r1, r2)).toEqual({ num: 1n, den: 6n });
  });

  it('should multiply fractions correctly', () => {
    const r1 = { num: 2n, den: 3n };
    const r2 = { num: 3n, den: 4n };
    expect(multiply(r1, r2)).toEqual({ num: 1n, den: 2n });
  });

  it('should convert rational to number correctly', () => {
    expect(rationalToNumber({ num: 3n, den: 4n })).toBe(0.75);
  });

  it('should parse strings to rational correctly', () => {
    expect(parseToRational('5')).toEqual({ num: 5n, den: 1n });
    expect(parseToRational('5/3')).toEqual({ num: 5n, den: 3n });
    expect(parseToRational('0.75')).toEqual({ num: 3n, den: 4n });
    expect(parseToRational('  -2/3 ')).toEqual({ num: -2n, den: 3n });
  });

  it('should format rational correctly', () => {
    expect(formatRational({ num: 5n, den: 1n })).toBe('5');
    expect(formatRational({ num: 10n, den: 6n })).toBe('5/3');
  });
});

describe('Berkovich Math Library - P-adic Valuation', () => {
  it('should calculate p-adic valuations correctly', () => {
    const p = 3n;
    // v_3(9) = 2
    expect(getValuation(parseToRational('9'), p)).toBe(2);
    // v_3(5/3) = v_3(5) - v_3(3) = 0 - 1 = -1
    expect(getValuation(parseToRational('5/3'), p)).toBe(-1);
    // v_3(10) = 0
    expect(getValuation(parseToRational('10'), p)).toBe(0);
    // v_3(0) = 30 (infinity representation)
    expect(getValuation(parseToRational('0'), p)).toBe(30);
  });
});

describe('Berkovich Math Library - P-adic Digits', () => {
  it('should compute p-adic digits correctly', () => {
    const p = 3n;
    // 5/3 = 2 * 3^-1 + 1 * 3^0
    // so digits starting from power -1 are: [2, 1]
    const { startPower, digits } = getPadicDigits(parseToRational('5/3'), p, 3);
    expect(startPower).toBe(-1);
    expect(digits.slice(0, 2)).toEqual([2, 1]);
  });

  it('should align digits across a range of powers', () => {
    const p = 3n;
    const r = parseToRational('5/3'); // 2 * 3^-1 + 1 * 3^0
    const aligned = getAlignedDigits(r, p, -2, 2);
    // power -2: 0
    // power -1: 2
    // power  0: 1
    // power  1: 0
    // power  2: 0
    expect(aligned).toEqual([
      { power: -2, digit: 0 },
      { power: -1, digit: 2 },
      { power:  0, digit: 1 },
      { power:  1, digit: 0 },
      { power:  2, digit: 0 }
    ]);
  });
});

describe('Berkovich Math Library - Optimization Step Calculations', () => {
  it('should identify vertex states correctly', () => {
    expect(isVertex(2.0)).toBe(true);
    expect(isVertex(2.00000001)).toBe(true);
    expect(isVertex(1.5)).toBe(false);
  });

  it('should compute correct vertex candidate branches', () => {
    const p = 3n;
    const c = parseToRational('0');
    const y = parseToRational('5/3'); // d = 1
    const candidates = computeVertexCandidates(c, 2.0, y, p);
    
    // Total candidate branches: parent (+1 children) = 1 + 3 = 4 candidates
    expect(candidates.length).toBe(4);
    
    // Parent candidate
    const parent = candidates.find(cand => cand.branch === 'parent');
    expect(parent).toBeDefined();
    expect(parent?.logRadius).toBe(3);
    // Loss = |3 - 1| + 1 = 3
    expect(parent?.lossVal).toBe(3);
    
    // Child 0 candidate
    const child0 = candidates.find(cand => cand.branch === '0');
    expect(child0).toBeDefined();
    expect(child0?.logRadius).toBe(1);
    // child0 center = 0 + 0 = 0. dist = val(0 - 5/3) = val(-5/3) = -1, d_child0 = 1.
    // Loss = |1 - 1| + 1 = 1
    expect(child0?.lossVal).toBe(1);
  });

  it('should compute continuous steps and snapping boundaries correctly', () => {
    // 1. No snap: rho = 1.8, target d = 1.0, eta = 0.5.
    // proposed rho = 1.8 - 0.5 * 1 = 1.3. Same floor 1, so no crossesInteger.
    const res1 = computeContinuousStep(1.8, 1.0, 0.5);
    expect(res1.proposedRho).toBeCloseTo(1.3);
    expect(res1.crossesInteger).toBe(false);
    
    // 2. Snapping: rho = 1.3, target d = 1.0, eta = 0.5.
    // proposed rho = 1.3 - 0.5 * 1 = 0.8. Floor changes from 1 to 0, crossesInteger = true.
    // snapped to kLower = 1.0
    const res2 = computeContinuousStep(1.3, 1.0, 0.5);
    expect(res2.proposedRho).toBeCloseTo(0.8);
    expect(res2.crossesInteger).toBe(true);
    expect(res2.snappedRho).toBe(1.0);
  });

  it('should truncate rational values to the tree range [-2, 2] correctly', () => {
    const p = 3n;
    // 5/3 (base 3) = 2 * 3^-1 + 1 * 3^0 (inside [-2, 2], should remain 5/3)
    const val1 = parseToRational('5/3');
    expect(truncateToTreeRange(val1, p, -2, 2)).toEqual(val1);

    // 20/27 (base 3) = 2 * 3^-1 + 2 * 3^-3 (outside [-2, 2], so the 3^-3 term is removed, leaving 2 * 3^-1 = 2/3)
    const val2 = parseToRational('20/27');
    expect(truncateToTreeRange(val2, p, -2, 2)).toEqual({ num: 2n, den: 3n });

    // 26/27 (base 3) = 2 * 3^-1 + 2 * 3^-2 + 2 * 3^-3 (outside [-2, 2], so the 3^-3 term is removed, leaving 2/3 + 2/9 = 8/9)
    const val3 = parseToRational('26/27');
    expect(truncateToTreeRange(val3, p, -2, 2)).toEqual({ num: 8n, den: 9n });
  });
});
