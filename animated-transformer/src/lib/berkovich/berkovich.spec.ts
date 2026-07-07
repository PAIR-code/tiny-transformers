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
  truncateToTreeRange,
  formatDigitSequence,
  parseDigitSequence,
  computePathLoss,
  extValuationGe
} from './berkovich';
import {
  computeVertexCandidates,
  computeContinuousStep,
  computeGradientDetails,
  stepAdditionGradients,
  computeActiveDegrees,
  VertexResolutionMethod,
  stepMultiplicationGradients,
  stepSoftmaxGradients,
  stepUnaryOperatorGradients,
  BerkovichUnaryOperator
} from './berkovich_gradients';


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
    expect(getValuation(parseToRational('9'), p)).toEqual({ type: 'finite', value: 2 });
    // v_3(5/3) = v_3(5) - v_3(3) = 0 - 1 = -1
    expect(getValuation(parseToRational('5/3'), p)).toEqual({ type: 'finite', value: -1 });
    // v_3(10) = 0
    expect(getValuation(parseToRational('10'), p)).toEqual({ type: 'finite', value: 0 });
    // v_3(0) = infinity
    expect(getValuation(parseToRational('0'), p)).toEqual({ type: 'pos-infinity' });
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
    const candidates = computeVertexCandidates(c, 2.0, y, -2, p);
    
    // Total candidate branches: parent (+1 children) = 1 + 3 = 4 candidates
    expect(candidates.length).toBe(4);
    
    // Parent candidate
    const parent = candidates.find(cand => cand.branch === 'parent');
    expect(parent).toBeDefined();
    expect(parent?.logRadius).toBe(3);
    // Loss = |3 - 1| + 1 - (-2) = 5
    expect(parent?.lossVal).toBe(5);
    
    // Child 0 candidate
    const child0 = candidates.find(cand => cand.branch === '0');
    expect(child0).toBeDefined();
    expect(child0?.logRadius).toBe(1);
    // child0 center = 0 + 0 = 0. dist = val(0 - 5/3) = val(-5/3) = -1, d_child0 = 1.
    // Loss = |1 - 1| + 1 - (-2) = 3
    expect(child0?.lossVal).toBe(3);
  });

  it('should compute continuous steps and snapping boundaries correctly', () => {
    // 1. No snap: rho = 1.8, target d = 1.0, eta = 0.5.
    // proposed rho = 1.8 - 0.5 * 1 = 1.3. Same floor 1, so no crossesInteger.
    const res1 = computeContinuousStep(1.8, { type: 'finite', value: 1.0 }, 0.5);
    expect(res1.proposedRho).toBeCloseTo(1.3);
    expect(res1.crossesInteger).toBe(false);
    
    // 2. Snapping: rho = 1.3, target d = 1.0, eta = 0.5.
    // proposed rho = 1.3 - 0.5 * 1 = 0.8. Floor changes from 1 to 0, crossesInteger = true.
    // snapped to kLower = 1.0
    const res2 = computeContinuousStep(1.3, { type: 'finite', value: 1.0 }, 0.5);
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

describe('Berkovich Math Library - Digit Sequence Conversion', () => {
  it('should format rational to digit sequence with decimal point and no spaces', () => {
    const p = 3n;
    // 5/3 = 0 * 3^1 + 1 * 3^0 + 2 * 3^-1 + 0 * 3^-2 -> '01.20'
    expect(formatDigitSequence(parseToRational('5/3'), p)).toBe('01.20');
    // 0 = '00.00'
    expect(formatDigitSequence(parseToRational('0'), p)).toBe('00.00');
    // 4 = 1 * 3^1 + 1 * 3^0 -> '11.00'
    expect(formatDigitSequence(parseToRational('4'), p)).toBe('11.00');
    // 2/9 = 2 * 3^-2 -> '00.02'
    expect(formatDigitSequence(parseToRational('2/9'), p)).toBe('00.02');
    // 8/9 = 2 * 3^-1 + 2 * 3^-2 -> '00.22'
    expect(formatDigitSequence(parseToRational('8/9'), p)).toBe('00.22');
  });

  it('should parse digit sequence with decimal point and no spaces to rational', () => {
    const p = 3n;
    expect(parseDigitSequence('01.20', p)).toEqual(parseToRational('5/3'));
    expect(parseDigitSequence('00.00', p)).toEqual(parseToRational('0'));
    expect(parseDigitSequence('11.00', p)).toEqual(parseToRational('4'));
    expect(parseDigitSequence('00.02', p)).toEqual(parseToRational('2/9'));
    expect(parseDigitSequence('00.22', p)).toEqual(parseToRational('8/9'));
  });

  it('should format and parse with custom precision bounds correctly', () => {
    const p = 3n;
    const precision = { minPower: -3, maxPower: 2 }; // 3 digits left, 3 digits right: d2 d1 d0 . d-1 d-2 d-3
    // 5/3 = 0 * 3^2 + 0 * 3^1 + 1 * 3^0 + 2 * 3^-1 + 0 * 3^-2 + 0 * 3^-3 -> '001.200'
    const seq = formatDigitSequence(parseToRational('5/3'), p, precision);
    expect(seq).toBe('001.200');
    expect(parseDigitSequence(seq, p, precision)).toEqual(parseToRational('5/3'));

    // 35/27 = 1 * 3^0 + 0 * 3^-1 + 2 * 3^-2 + 2 * 3^-3 -> '001.022'
    const seq2 = formatDigitSequence(parseToRational('35/27'), p, precision);
    expect(seq2).toBe('001.022');
    expect(parseDigitSequence(seq2, p, precision)).toEqual(parseToRational('35/27'));
  });
});

describe('Berkovich Math Library - Shared Gradient Steps', () => {
  it('should compute gradient details at a vertex correctly', () => {
    const p = 3n;
    const c = parseToRational('0');
    const y = parseToRational('5/3'); // d = -val = -(-1) = 1
    const eta = 0.2;
    const details = computeGradientDetails(c, 2.0, y, -2, p, eta);

    expect(details.isVertex).toBe(true);
    expect(details.rho).toBe(2.0);
    expect(details.d).toEqual({ type: 'finite', value: 1 });
    // Loss = |2.0 - 1| + 1 - (-2) = 4
    expect(details.loss).toBe(4);
    expect(details.bestBranch).toBe('0');
    expect(details.nextCenter).toEqual(parseToRational('0'));
    expect(details.nextLogRadius).toBeCloseTo(1.8);
    expect(details.stepType).toBe('Vertex (Move to Child 0)');
  });

  it('should compute gradient details on an edge correctly', () => {
    const p = 3n;
    const c = parseToRational('2/3');
    const y = parseToRational('5/3'); // d = -val = -0 = 0
    const eta = 0.2;

    // 1. Continuous step without snapping
    const details1 = computeGradientDetails(c, 0.8, y, -2, p, eta);
    expect(details1.isVertex).toBe(false);
    expect(details1.rho).toBe(0.8);
    expect(details1.d).toEqual({ type: 'finite', value: 0 });
    expect(details1.gRho).toBe(1); // rho >= d, so gradient of loss w.r.t rho is +1
    expect(details1.proposedRho).toBeCloseTo(0.6);
    expect(details1.crossesInteger).toBe(false);
    expect(details1.nextCenter).toEqual(c);
    expect(details1.nextLogRadius).toBeCloseTo(0.6);
    expect(details1.stepType).toBe('Edge (Continuous descent dL/dρ=+1)');

    // 2. Continuous step with snapping to integer boundary
    const details2 = computeGradientDetails(c, 0.1, y, -2, p, eta);
    expect(details2.isVertex).toBe(false);
    expect(details2.rho).toBe(0.1);
    expect(details2.d).toEqual({ type: 'finite', value: 0 });
    expect(details2.gRho).toBe(1);
    expect(details2.proposedRho).toBeCloseTo(-0.1);
    expect(details2.crossesInteger).toBe(true);
    expect(details2.nextCenter).toEqual(parseToRational('5/3'));
    expect(details2.nextLogRadius).toBeCloseTo(-0.1);
    expect(details2.stepType).toBe('Edge (Crossed boundary; snapped to vertex ρ=0 and took branch Child 1)');
  });

  it('should clamp nextLogRadius to the represented range [-2, 2]', () => {
    const p = 3n;
    const c = parseToRational('0');
    const y = parseToRational('1/27'); // d = -(-3) = 3
    const eta = 0.2;
    
    // At vertex rho = 2.0, since d = 3, parent branch is chosen (nextLogRadius would be 2.2, clamped to 2.0)
    const details = computeGradientDetails(c, 2.0, y, -2, p, eta);
    expect(details.bestBranch).toBe('parent');
    expect(details.nextLogRadius).toBe(2.0);
  });
});

describe('Berkovich Math Library - Path Loss Helper', () => {
  it('should compute path metric loss correctly', () => {
    expect(computePathLoss(0, { type: 'finite', value: 1 }, 0)).toBe(2);
    expect(computePathLoss(2, { type: 'finite', value: 1 }, 0)).toBe(2);
    expect(computePathLoss(-1, { type: 'finite', value: 1 }, 0)).toBe(3); // |-1 - 1| + 1 = 2 + 1 = 3
    expect(computePathLoss(0, { type: 'neg-infinity' }, 0)).toBe(0);
    expect(computePathLoss(2, { type: 'neg-infinity' }, 0)).toBe(2);
  });

  it('should compute path-metric loss to target leaf correctly', () => {
    // User configuration: target y = 01.20 (5/3), current center x_c = 00.00 (0), rho = 0.0.
    // The prime is p = 3.
    // The LCA distance d between 0 and 5/3 is d = -val_3(0 - 5/3) = -val_3(-5/3) = 1.
    //
    // 1. If target leaf depth y_rho is assumed to be 0:
    //    L_path = |rho - d| + d - y_rho = |0 - 1| + 1 - 0 = 2.
    //    This is the relative path loss where target depth is the root.
    const relativeLoss = computePathLoss(0.0, { type: 'finite', value: 1.0 }, 0.0);
    expect(relativeLoss).toBe(2.0);

    // 2. In our finite tree simulator, target leaves are represented down to depth y_rho = -2.
    //    The true tree distance from parameter (0, 0.0) to target leaf (5/3, -2.0) is:
    //    L_path = |rho - d| + d - y_rho = |0 - 1| + 1 - (-2) = 4.
    //    This must be 4 so that the loss function remains positive and only reaches 0
    //    when the parameter converges exactly to the leaf disk (c = 5/3, rho = -2.0).
    const trueLeafLoss = computePathLoss(0.0, { type: 'finite', value: 1.0 }, -2.0);
    expect(trueLeafLoss).toBe(4.0);
  });
});

describe('Berkovich Tree Candidate Matching', () => {
  // Replicate the tree-building logic from BerkovichTreeVisComponent
  // to verify that every gradient candidate has a matching tree node.
  const rhoMin = -2;
  const rhoMax = 2;

  interface TreeNode {
    id: string;
    center: Rational;
    rho: number;
    isActive: boolean;
    children: TreeNode[];
  }

  function buildTree(
    c_curr: Rational, y: Rational, p: bigint
  ): TreeNode[] {
    const pNum = Number(p);
    const allNodes: TreeNode[] = [];

    const buildNode = (c: Rational, rho: number): TreeNode => {
      const nodeId = `${formatRational(c)}_${rho}`;
      const val_y = getValuation(subtract(y, c), p);
      const val_c = getValuation(subtract(c_curr, c), p);
      const nodeActive =
        extValuationGe(val_y, -rho) || extValuationGe(val_c, -rho);

      const children: TreeNode[] = [];

      if (rho > rhoMin && nodeActive) {
        for (let g = 0; g < pNum; g++) {
          const childRho = rho - 1;
          let shift: Rational;
          const power = -rho;
          if (power <= 0) {
            shift = simplify({ num: BigInt(g), den: p ** BigInt(-power) });
          } else {
            shift = simplify({ num: BigInt(g) * (p ** BigInt(power)), den: 1n });
          }
          const childCenter = add(c, shift);
          children.push(buildNode(childCenter, childRho));
        }
      }

      const node: TreeNode = { id: nodeId, center: c, rho, isActive: nodeActive, children };
      allNodes.push(node);
      return node;
    };

    const rootCenter = simplify({ num: 0n, den: 1n });
    buildNode(rootCenter, rhoMax);
    return allNodes;
  }

  // For each test case, build the tree and check that every candidate from
  // computeGradientDetails matches a node in the tree by (center, logRadius).
  const cases = [
    { label: 'default c=0 rho=0', p: 3, target: '5/3', center: '0', rho: 0 },
    { label: 'c=1/3 rho=0', p: 3, target: '5/3', center: '1/3', rho: 0 },
    { label: 'c=2/3 rho=0', p: 3, target: '5/3', center: '2/3', rho: 0 },
    { label: 'c=0 rho=1', p: 3, target: '5/3', center: '0', rho: 1 },
    { label: 'c=0 rho=-1', p: 3, target: '5/3', center: '0', rho: -1 },
    { label: 'p=2 c=0 rho=0', p: 2, target: '3/4', center: '0', rho: 0 },
    { label: 'p=2 c=1/2 rho=0', p: 2, target: '3/4', center: '1/2', rho: 0 },
    { label: 'c=7 rho=1 p=3', p: 3, target: '52/9', center: '7', rho: 1 },
    { label: 'c=5/9 rho=-1', p: 3, target: '5/3', center: '5/9', rho: -1 },
    { label: 'c=14/9 rho=-1', p: 3, target: '5/3', center: '14/9', rho: -1 },
  ];

  for (const tc of cases) {
    it(`candidate nodes should exist in tree for: ${tc.label}`, () => {
      const p = BigInt(tc.p);
      const c = parseToRational(tc.center);
      const y = parseToRational(tc.target);
      const eta = 0.2;

      const nodes = buildTree(c, y, p);
      const details = computeGradientDetails(c, tc.rho, y, tc.rho, p, eta);

      if (!details.candidates || details.candidates.length === 0) return;

      for (const cand of details.candidates) {
        // Skip parent if it's above rhoMax (not in tree)
        if (cand.logRadius > rhoMax) continue;
        // Skip children below rhoMin (not in tree)
        if (cand.logRadius < rhoMin) continue;

        // 1. Try exact match by center and logRadius (child candidates).
        const exactMatch = nodes.find(
          n => n.rho === cand.logRadius && formatRational(n.center) === formatRational(cand.center)
        );

        // 2. If no exact match, find containing node (parent candidate case:
        //    the candidate center is the current parameter, but the tree node
        //    at the parent level has a different center that contains it).
        const containingMatch = exactMatch ? null : nodes.find(n => {
          if (n.rho !== cand.logRadius) return false;
          return extValuationGe(getValuation(subtract(cand.center, n.center), p), -n.rho);
        });

        if (!exactMatch && !containingMatch) {
          const nodesAtLevel = nodes.filter(n => n.rho === cand.logRadius)
            .map(n => formatRational(n.center));
          expect.fail(
            `No tree node (exact or containing) for candidate branch '${cand.branch}' ` +
            `(center=${formatRational(cand.center)}, logRadius=${cand.logRadius}). ` +
            `Tree nodes at this level: [${nodesAtLevel.join(', ')}]`
          );
        }
      }
    });
  }
});

describe('Berkovich Gradient Descent Convergence', () => {
  const rhoMin = -2;
  const eta = 0.2;
  const maxSteps = 200;

  function runDescent(
    p: bigint, startCenter: Rational, startRho: number, target: Rational
  ): { converged: boolean; steps: number; finalCenter: Rational; finalRho: number; trace: string[] } {
    let c = startCenter;
    let rho = startRho;
    const trace: string[] = [];

    for (let i = 0; i < maxSteps; i++) {
      const details = computeGradientDetails(c, rho, target, rhoMin, p, eta);
      trace.push(
        `step ${i}: rho=${rho.toFixed(4)} c=${formatRational(c)} ` +
        `d=${details.d.type === 'finite' ? details.d.value : details.d.type} ` +
        `loss=${details.loss.toFixed(4)} type=${details.stepType}`
      );
      if (details.loss <= 1e-7) {
        return { converged: true, steps: i, finalCenter: c, finalRho: rho, trace };
      }
      c = details.nextCenter;
      rho = details.nextLogRadius;
    }
    return { converged: false, steps: maxSteps, finalCenter: c, finalRho: rho, trace };
  }

  const cases = [
    // Default: y=5/3, c=0, rho=0
    { label: 'default y=5/3 c=0 rho=0', p: 3, target: '5/3', center: '0', rho: 0 },
    // User-reported: y=5/3 (01.20), c=2/3 (00.20), rho=0
    { label: 'y=5/3 c=2/3 rho=0', p: 3, target: '5/3', center: '2/3', rho: 0 },
    // Same target, different start
    { label: 'y=5/3 c=1/3 rho=0', p: 3, target: '5/3', center: '1/3', rho: 0 },
    // Start at rho=1
    { label: 'y=5/3 c=0 rho=1', p: 3, target: '5/3', center: '0', rho: 1 },
    // Start at rho=2
    { label: 'y=5/3 c=0 rho=2', p: 3, target: '5/3', center: '0', rho: 2 },
    // p=2 case
    { label: 'p=2 y=3/4 c=0 rho=0', p: 2, target: '3/4', center: '0', rho: 0 },
    // Already at target center, but rho is too large
    { label: 'y=5/3 c=5/3 rho=0', p: 3, target: '5/3', center: '5/3', rho: 0 },
    { label: 'y=5/3 c=5/3 rho=1', p: 3, target: '5/3', center: '5/3', rho: 1 },
    // Identical start and target
    { label: 'y=5/3 c=5/3 rho=-2', p: 3, target: '5/3', center: '5/3', rho: -2 },
  ];

  for (const tc of cases) {
    it(`should converge for: ${tc.label}`, () => {
      const result = runDescent(
        BigInt(tc.p),
        parseToRational(tc.center),
        tc.rho,
        parseToRational(tc.target)
      );
      if (!result.converged) {
        const lastLines = result.trace.slice(-10).join('\n');
        expect.fail(
          `Did not converge in ${maxSteps} steps.\n` +
          `Final: rho=${result.finalRho.toFixed(4)} c=${formatRational(result.finalCenter)}\n` +
          `Last 10 steps:\n${lastLines}`
        );
      }
    });
  }
});

describe('Berkovich Math Library - Active Degrees', () => {
  it('should assign full gradient to the larger rho', () => {
    expect(computeActiveDegrees(1.5, 0.5)).toEqual(
      { drhoSum_drhoX1: 1, drhoSum_drhoX2: 0 }
    );
    expect(computeActiveDegrees(0.5, 1.5)).toEqual(
      { drhoSum_drhoX1: 0, drhoSum_drhoX2: 1 }
    );
  });

  it('should split gradient equally when rho values are equal', () => {
    expect(computeActiveDegrees(1.0, 1.0)).toEqual(
      { drhoSum_drhoX1: 0.5, drhoSum_drhoX2: 0.5 }
    );
  });
});

describe('Berkovich Addition - Vertex Resolution Methods', () => {
  const methods: Array<'exact-per-coord' | 'heuristic-joint' | 'exact-joint'> =
    ['exact-per-coord', 'heuristic-joint', 'exact-joint'];

  it('all methods should produce valid output structure', () => {
    const p = 3n;
    const cX1 = parseToRational('0');
    const cX2 = parseToRational('1');
    const targetY = parseToRational('5/3');

    for (const method of methods) {
      const result = stepAdditionGradients(
        cX1, 0.0, cX2, 0.0, targetY, p, 1 / 3, method
      );
      expect(result.sumCenter).toBeDefined();
      expect(result.sumRho).toBeDefined();
      expect(typeof result.loss).toBe('number');
      expect(typeof result.drhoSum_drhoX1).toBe('number');
      expect(typeof result.drhoSum_drhoX2).toBe('number');
      expect(typeof result.drSum).toBe('number');
    }
  });

  it('exact-joint should find the globally optimal joint branch', () => {
    const p = 3n;
    // Both at integer vertices: rhoX1 = 0, rhoX2 = 0
    const cX1 = parseToRational('0');
    const cX2 = parseToRational('0');
    const targetY = parseToRational('5/3'); // = 01.20 in base 3

    const result = stepAdditionGradients(
      cX1, 0.0, cX2, 0.0, targetY, p, 1 / 3, 'exact-joint'
    );

    // After one step, the sum center should move closer to 5/3
    const newSum = add(result.nextCenterX1, result.nextCenterX2);
    const oldDiff = subtract(add(cX1, cX2), targetY);
    const newDiff = subtract(newSum, targetY);
    const oldVal = getValuation(oldDiff, p);
    const newVal = getValuation(newDiff, p);

    // The new valuation should be >= old valuation (closer match)
    if (oldVal.type === 'finite' && newVal.type === 'finite') {
      expect(newVal.value).toBeGreaterThanOrEqual(oldVal.value);
    }
  });

  it('heuristic-joint should use residual-based digit selection', () => {
    const p = 3n;
    const cX1 = parseToRational('0');
    const cX2 = parseToRational('0');
    const targetY = parseToRational('5/3');

    const result = stepAdditionGradients(
      cX1, 0.0, cX2, 0.0, targetY, p, 1 / 3, 'heuristic-joint'
    );

    // Should produce a step (not stay in place)
    const moved =
      formatRational(result.nextCenterX1) !== formatRational(cX1) ||
      formatRational(result.nextCenterX2) !== formatRational(cX2) ||
      result.nextRhoX1 !== 0.0 ||
      result.nextRhoX2 !== 0.0;
    expect(moved).toBe(true);
  });

  it('methods should fall back to per-coord when only one is at vertex', () => {
    const p = 3n;
    const cX1 = parseToRational('0');
    const cX2 = parseToRational('1');
    const targetY = parseToRational('5/3');

    // X1 at vertex (0.0), X2 on edge (0.5)
    const perCoord = stepAdditionGradients(
      cX1, 0.0, cX2, 0.5, targetY, p, 1 / 3, 'exact-per-coord'
    );
    const heuristic = stepAdditionGradients(
      cX1, 0.0, cX2, 0.5, targetY, p, 1 / 3, 'heuristic-joint'
    );
    const exact = stepAdditionGradients(
      cX1, 0.0, cX2, 0.5, targetY, p, 1 / 3, 'exact-joint'
    );

    // All should give same result since only one is at vertex
    expect(heuristic.nextRhoX2).toBeCloseTo(perCoord.nextRhoX2);
    expect(exact.nextRhoX2).toBeCloseTo(perCoord.nextRhoX2);
  });
});

describe('Berkovich Addition Gradient Descent Convergence', () => {
  const rhoMin = -2;
  const eta = 0.2;
  const maxSteps = 300;

  function runAdditionDescent(
    p: bigint,
    startX1: { center: Rational; rho: number },
    startX2: { center: Rational; rho: number },
    targetY: Rational,
    method?: VertexResolutionMethod
  ) {
    let cX1 = startX1.center;
    let rhoX1 = startX1.rho;
    let cX2 = startX2.center;
    let rhoX2 = startX2.rho;
    const trace: string[] = [];

    for (let i = 0; i < maxSteps; i++) {
      const result = stepAdditionGradients(cX1, rhoX1, cX2, rhoX2, targetY, p, eta, method);
      trace.push(
        `step ${i}: x1=(${formatRational(cX1)}, ${rhoX1.toFixed(3)}) x2=(${formatRational(cX2)}, ${rhoX2.toFixed(3)}) ` +
        `sum=(${formatRational(result.sumCenter)}, ${result.sumRho.toFixed(3)}) loss=${result.loss.toFixed(4)}`
      );
      if (result.loss <= 1e-7) {
        return { converged: true, steps: i, cX1, rhoX1, cX2, rhoX2, sumCenter: result.sumCenter, sumRho: result.sumRho, trace };
      }
      cX1 = result.nextCenterX1;
      rhoX1 = result.nextRhoX1;
      cX2 = result.nextCenterX2;
      rhoX2 = result.nextRhoX2;
    }
    return { converged: false, steps: maxSteps, cX1, rhoX1, cX2, rhoX2, sumCenter: add(cX1, cX2), sumRho: Math.max(rhoX1, rhoX2), trace };
  }

  const methods: VertexResolutionMethod[] = ['exact-per-coord', 'heuristic-joint', 'exact-joint'];

  for (const method of methods) {
    it(`should converge x1 + x2 to target y using method: ${method}`, () => {
      const p = 3n;
      const targetY = parseToRational('5/3'); // 01.20 in base 3
      const startX1 = { center: parseToRational('0'), rho: 0.0 };
      const startX2 = { center: parseToRational('1'), rho: -1.0 }; // sum starts at center 1.0, rho 0.0

      const result = runAdditionDescent(p, startX1, startX2, targetY, method);
      if (!result.converged) {
        const lastLines = result.trace.slice(-10).join('\n');
        expect.fail(
          `Method ${method} did not converge in ${maxSteps} steps.\n` +
          `Final Sum: (${formatRational(result.sumCenter)}, ${result.sumRho.toFixed(4)})\n` +
          `Last 10 steps:\n${lastLines}`
        );
      }

      // After convergence:
      const diff = subtract(result.sumCenter, targetY);
      const valDiff = getValuation(diff, p);
      expect(valDiff.type === 'pos-infinity' || (valDiff.type === 'finite' && valDiff.value >= 2)).toBe(true);
      expect(result.sumRho).toBeLessThanOrEqual(-2.0);
    });
  }

  it('should converge with simultaneous vertices using exact-joint', () => {
    const p = 3n;
    const targetY = parseToRational('8/9'); // 00.22 in base 3
    // Both start at vertex rho=0 — forces simultaneous resolution
    const startX1 = { center: parseToRational('0'), rho: 0.0 };
    const startX2 = { center: parseToRational('0'), rho: 0.0 };

    const result = runAdditionDescent(
      p, startX1, startX2, targetY, 'exact-joint'
    );
    if (!result.converged) {
      const lastLines = result.trace.slice(-10).join('\n');
      expect.fail(
        `Did not converge in ${maxSteps} steps.\n` +
        `Final Sum: (${formatRational(result.sumCenter)}, ${result.sumRho.toFixed(4)})\n` +
        `Last 10 steps:\n${lastLines}`
      );
    }
  });
});

describe('Berkovich Multiplication Gradient Descent Convergence', () => {
  const rhoMin = -2;
  const eta = 0.2;
  const maxSteps = 300;

  function runMultiplicationDescent(
    p: bigint,
    startX1: { center: Rational; rho: number },
    startX2: { center: Rational; rho: number },
    targetY: Rational,
    method?: VertexResolutionMethod
  ) {
    let cX1 = startX1.center;
    let rhoX1 = startX1.rho;
    let cX2 = startX2.center;
    let rhoX2 = startX2.rho;
    const trace: string[] = [];

    for (let i = 0; i < maxSteps; i++) {
      const result = stepMultiplicationGradients(cX1, rhoX1, cX2, rhoX2, targetY, p, eta, method);
      trace.push(
        `step ${i}: x1=(${formatRational(cX1)}, ${rhoX1.toFixed(3)}) x2=(${formatRational(cX2)}, ${rhoX2.toFixed(3)}) ` +
        `prod=(${formatRational(result.prodCenter)}, ${result.prodRho.toFixed(3)}) loss=${result.loss.toFixed(4)}`
      );
      if (result.loss <= 1e-7) {
        return { converged: true, steps: i, cX1, rhoX1, cX2, rhoX2, prodCenter: result.prodCenter, prodRho: result.prodRho, trace };
      }
      cX1 = result.nextCenterX1;
      rhoX1 = result.nextRhoX1;
      cX2 = result.nextCenterX2;
      rhoX2 = result.nextRhoX2;
    }
    return { converged: false, steps: maxSteps, cX1, rhoX1, cX2, rhoX2, prodCenter: multiply(cX1, cX2), prodRho: rhoMin, trace };
  }

  it('should converge x1 * x2 to target y using exact-per-coord', () => {
    const p = 3n;
    const targetY = parseToRational('2'); // 2 in base 3
    const startX1 = { center: parseToRational('1'), rho: 0.0 };
    const startX2 = { center: parseToRational('1'), rho: -1.0 };

    const result = runMultiplicationDescent(p, startX1, startX2, targetY, 'exact-per-coord');
    if (!result.converged) {
      expect.fail(result.trace.join('\n'));
    }
    expect(result.prodRho).toBeLessThanOrEqual(-2.0);
  });

  it('should converge x1 * x2 to target y using exact-joint', () => {
    const p = 3n;
    const targetY = parseToRational('2');
    const startX1 = { center: parseToRational('1'), rho: 0.0 };
    const startX2 = { center: parseToRational('1'), rho: -1.0 };

    const result = runMultiplicationDescent(p, startX1, startX2, targetY, 'exact-joint');
    expect(result.converged).toBe(true);
  });
});

describe('Berkovich Softmax Gradient Descent Convergence', () => {
  const eta = 0.2;
  const maxSteps = 300;

  it('should converge centroids X1 and X2 to classify target Y as Class 1', () => {
    const p = 3n;
    const targetY = parseToRational('0');
    let cX1 = parseToRational('1');
    let rhoX1 = 0.0;
    let cX2 = parseToRational('0');
    let rhoX2 = 0.0;

    const trace: string[] = [];
    let converged = false;
    for (let i = 0; i < maxSteps; i++) {
      const result = stepSoftmaxGradients(cX1, rhoX1, cX2, rhoX2, targetY, p, eta, 3.0, 'exact-per-coord');
      trace.push(
        `step ${i}: x1=(${formatRational(cX1)}, ${rhoX1.toFixed(3)}) x2=(${formatRational(cX2)}, ${rhoX2.toFixed(3)}) ` +
        `pi1=${result.pi1.toFixed(4)} pi2=${result.pi2.toFixed(4)} loss=${result.loss.toFixed(4)}`
      );
      if (result.loss < 0.05) {
        converged = true;
        break;
      }
      cX1 = result.nextCenterX1;
      rhoX1 = result.nextRhoX1;
      cX2 = result.nextCenterX2;
      rhoX2 = result.nextRhoX2;
    }

    if (!converged) {
      expect.fail(trace.join('\n'));
    }
    const valDiff1 = getValuation(subtract(cX1, targetY), p);
    expect(valDiff1.type === 'pos-infinity' || (valDiff1.type === 'finite' && valDiff1.value >= 1)).toBe(true);
  });
});

describe('Berkovich Unary Operator Gradient Descent Convergence', () => {
  const eta = 0.2;
  const maxSteps = 100;

  function runUnaryDescent(
    p: bigint,
    startX: { center: Rational; rho: number },
    op: BerkovichUnaryOperator,
    targetY: Rational
  ) {
    let cX = startX.center;
    let rhoX = startX.rho;
    const trace: string[] = [];

    for (let i = 0; i < maxSteps; i++) {
      const result = stepUnaryOperatorGradients(cX, rhoX, op, targetY, p, eta);
      trace.push(
        `step ${i}: x=(${formatRational(cX)}, ${rhoX.toFixed(3)}) ` +
        `out=(${formatRational(result.outCenter)}, ${result.outRho.toFixed(3)}) loss=${result.loss.toFixed(4)}`
      );
      if (result.loss <= 1e-7) {
        return { converged: true, steps: i, cX, rhoX, outCenter: result.outCenter, outRho: result.outRho, trace };
      }
      cX = result.nextCenterX;
      rhoX = result.nextRhoX;
    }
    return { converged: false, steps: maxSteps, cX, rhoX, outCenter: startX.center, outRho: -2.0, trace };
  }

  it('should converge shift (x + 1) to target 3', () => {
    const p = 3n;
    const targetY = parseToRational('3'); // 3
    const startX = { center: parseToRational('1'), rho: 0.0 };

    const result = runUnaryDescent(p, startX, 'shift', targetY);
    if (!result.converged) {
      expect.fail(result.trace.join('\n'));
    }
    expect(result.outRho).toBeLessThanOrEqual(-2.0 + 1e-9);
    const valDiff = getValuation(subtract(result.cX, parseToRational('2')), p);
    expect(valDiff.type).toBe('pos-infinity');
  });

  it('should converge scale (x * 3) to target 3', () => {
    const p = 3n;
    const targetY = parseToRational('3'); // 3
    const startX = { center: simplify({ num: 1n, den: 3n }), rho: 0.0 }; // x = 1/3

    const result = runUnaryDescent(p, startX, 'scale', targetY);
    if (!result.converged) {
      expect.fail(result.trace.join('\n'));
    }
    expect(result.outRho).toBeLessThanOrEqual(-2.0 + 1e-9);
    const valDiff = getValuation(subtract(result.cX, parseToRational('1')), p);
    expect(valDiff.type).toBe('pos-infinity');
  });

  it('should converge square (x^2) to target 4', () => {
    const p = 3n;
    const targetY = parseToRational('4'); // 4
    const startX = { center: parseToRational('1'), rho: 0.0 }; // x = 1

    const result = runUnaryDescent(p, startX, 'square', targetY);
    if (!result.converged) {
      expect.fail(result.trace.join('\n'));
    }
    expect(result.outRho).toBeLessThanOrEqual(-2.0 + 1e-9);
    // Assert that the output matches the target 4
    const valDiff = getValuation(subtract(result.outCenter, targetY), p);
    expect(valDiff.type).toBe('pos-infinity');
  });

  it('should converge cube (x^3) to target 8', () => {
    const p = 3n;
    const targetY = parseToRational('8'); // 8
    const startX = { center: parseToRational('1'), rho: 0.0 }; // x = 1

    const result = runUnaryDescent(p, startX, 'cube', targetY);
    if (!result.converged) {
      expect.fail(result.trace.join('\n'));
    }
    expect(result.outRho).toBeLessThanOrEqual(-2.0 + 1e-9);
    // Assert that the output matches the target 8
    const valDiff = getValuation(subtract(result.outCenter, targetY), p);
    expect(valDiff.type).toBe('pos-infinity');
  });
});



