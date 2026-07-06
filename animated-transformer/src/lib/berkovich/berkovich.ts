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

// ============================================================================
// MATHEMATICAL BACKGROUND REFERENCE
// Before modifying or reasoning about the mathematics in this file, please refer
// to the LaTeX reference file for the mathematical definitions and notation:
// /Users/ldixon/code/tiny-transformers/animated-transformer/src/lib/berkovich/berkovich.tex
// ============================================================================

// ============================================================================
// P-ADIC ARITHMETIC INTERFACE & HELPERS
// ============================================================================

export interface Rational {
  num: bigint;
  den: bigint;
}

export function simplify(r: Rational): Rational {
  const g = gcd(abs(r.num), abs(r.den));
  let num = r.num / g;
  let den = r.den / g;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  return { num, den };
}

export function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

export function abs(a: bigint): bigint {
  return a < 0n ? -a : a;
}

export function add(r1: Rational, r2: Rational): Rational {
  return simplify({
    num: r1.num * r2.den + r2.num * r1.den,
    den: r1.den * r2.den
  });
}

export function subtract(r1: Rational, r2: Rational): Rational {
  return simplify({
    num: r1.num * r2.den - r2.num * r1.den,
    den: r1.den * r2.den
  });
}

export function multiply(r1: Rational, r2: Rational): Rational {
  return simplify({
    num: r1.num * r2.num,
    den: r1.den * r2.den
  });
}

export function rationalToNumber(r: Rational): number {
  return Number(r.num) / Number(r.den);
}

export function formatRational(r: Rational): string {
  const simplified = simplify(r);
  if (simplified.den === 1n) {
    return simplified.num.toString();
  }
  return `${simplified.num}/${simplified.den}`;
}

export type ExtendedNumber =
  | { type: 'finite'; value: number }
  | { type: 'pos-infinity' }
  | { type: 'neg-infinity' };

export function extNegate(x: ExtendedNumber): ExtendedNumber {
  if (x.type === 'pos-infinity') return { type: 'neg-infinity' };
  if (x.type === 'neg-infinity') return { type: 'pos-infinity' };
  const val = -x.value;
  return { type: 'finite', value: val === 0 ? 0 : val };
}

export function extCompare(x: ExtendedNumber, y: ExtendedNumber): number {
  if (x.type === y.type) {
    if (x.type === 'finite') {
      return x.value - (y as { value: number }).value;
    }
    return 0;
  }
  if (x.type === 'neg-infinity' || y.type === 'pos-infinity') return -1;
  if (x.type === 'pos-infinity' || y.type === 'neg-infinity') return 1;
  return 0;
}

export function extValuationGe(val: ExtendedNumber, limit: number): boolean {
  if (val.type === 'pos-infinity') return true;
  if (val.type === 'neg-infinity') return false;
  return val.value >= limit;
}

export function getValuation(r: Rational, p: bigint): ExtendedNumber {
  if (r.num === 0n) return { type: 'pos-infinity' };
  let numVal = 0;
  let num = abs(r.num);
  while (num % p === 0n) {
    numVal++;
    num /= p;
  }
  let denVal = 0;
  let den = abs(r.den);
  while (den % p === 0n) {
    denVal++;
    den /= p;
  }
  return { type: 'finite', value: numVal - denVal };
}

export function computePathLoss(rho: number, d: ExtendedNumber, y_rho: number): number {
  if (d.type === 'neg-infinity') return rho - y_rho;
  if (d.type === 'pos-infinity') return Infinity;
  return Math.abs(rho - d.value) + d.value - y_rho;
}

export function parseToRational(input: string): Rational {
  const cleaned = input.trim();
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/');
    if (parts.length === 2) {
      const num = BigInt(parts[0].trim());
      const den = BigInt(parts[1].trim());
      return simplify({ num, den });
    }
  }
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    const integerPart = parts[0];
    const fractionalPart = parts[1];
    const denPower = fractionalPart.length;
    const num = BigInt(integerPart + fractionalPart);
    const den = 10n ** BigInt(denPower);
    return simplify({ num, den });
  }
  return simplify({ num: BigInt(cleaned), den: 1n });
}

export function getPadicDigits(r: Rational, p: bigint, count: number): { startPower: number; digits: number[] } {
  const rSim = simplify(r);
  if (rSim.num === 0n) {
    return { startPower: 0, digits: Array(count).fill(0) };
  }
  const valResult = getValuation(rSim, p);
  if (valResult.type !== 'finite') {
    return { startPower: 0, digits: Array(count).fill(0) };
  }
  const v = valResult.value;
  
  let r0: Rational;
  if (v >= 0) {
    r0 = simplify({ num: rSim.num, den: rSim.den * (p ** BigInt(v)) });
  } else {
    r0 = simplify({ num: rSim.num * (p ** BigInt(-v)), den: rSim.den });
  }
  
  const digits: number[] = [];
  let curr = r0;
  for (let i = 0; i < count; i++) {
    const nMod = Number((curr.num % p + p) % p);
    const dMod = Number((curr.den % p + p) % p);
    
    let dInv = 1;
    for (let k = 1; k < Number(p); k++) {
      if ((dMod * k) % Number(p) === 1) {
        dInv = k;
        break;
      }
    }
    const digit = (nMod * dInv) % Number(p);
    digits.push(digit);
    
    // next term: (curr - digit)/p
    const diff = subtract(curr, simplify({ num: BigInt(digit), den: 1n }));
    curr = simplify({ num: diff.num, den: diff.den * p });
  }
  
  return { startPower: v, digits };
}

export function getAlignedDigits(
  r: Rational,
  p: bigint,
  minPower: number,
  maxPower: number
): { power: number; digit: number }[] {
  const result: { power: number; digit: number }[] = [];
  
  for (let k = minPower; k <= maxPower; k++) {
    let rShift: Rational;
    if (k >= 0) {
      rShift = simplify({ num: r.num, den: r.den * (p ** BigInt(k)) });
    } else {
      rShift = simplify({ num: r.num * (p ** BigInt(-k)), den: r.den });
    }
    
    const val = getValuation(rShift, p);
    let digit = 0;
    if (val.type === 'finite') {
      const v = val.value;
      if (v > 0) {
        digit = 0;
      } else if (v < 0) {
        const startV = v;
        const count = -startV + 1;
        const { startPower, digits } = getPadicDigits(rShift, p, count);
        digit = digits[-startPower] || 0;
      } else {
        const { digits } = getPadicDigits(rShift, p, 1);
        digit = digits[0] || 0;
      }
    } else {
      digit = 0;
    }
    
    result.push({ power: k, digit });
  }
  
  return result;
}

// ============================================================================
// BERKOVICH GRADIENT DESCENT & OPTIMIZATION CORE
// ============================================================================

export interface VertexCandidate {
  branch: string;
  branchLabel: string;
  center: Rational;
  centerStr: string;
  logRadius: number;
  distVal: ExtendedNumber;
  lossVal: number;
}

export interface ContinuousStepResult {
  proposedRho: number;
  crossesInteger: boolean;
  snappedRho: number;
  gRho: number;
}

export function isVertex(rho: number): boolean {
  return Math.abs(rho - Math.round(rho)) < 1e-7;
}

export function computeVertexCandidates(
  c: Rational,
  rho: number,
  y: Rational,
  y_rho: number,
  p: bigint
): VertexCandidate[] {
  const k = Math.round(rho);
  const candidates: VertexCandidate[] = [];
  const d = extNegate(getValuation(subtract(c, y), p));
  
  // Parent candidate
  candidates.push({
    branch: 'parent',
    branchLabel: 'Parent (∞)',
    center: c,
    centerStr: formatRational(c),
    logRadius: k + 1,
    distVal: d,
    lossVal: computePathLoss(k + 1, d, y_rho)
  });
  
  // Children candidates
  for (let g = 0; g < Number(p); g++) {
    let shift: Rational;
    const power = -k;
    if (power <= 0) {
      shift = simplify({ num: BigInt(g), den: p ** BigInt(-power) });
    } else {
      shift = simplify({ num: BigInt(g) * (p ** BigInt(power)), den: 1n });
    }
    const childCenter = add(c, shift);
    const childDiff = subtract(childCenter, y);
    const childVal = getValuation(childDiff, p);
    const childD = extNegate(childVal);
    const childLoss = computePathLoss(k - 1, childD, y_rho);
    
    candidates.push({
      branch: g.toString(),
      branchLabel: `Child ${g}`,
      center: childCenter,
      centerStr: formatRational(childCenter),
      logRadius: k - 1,
      distVal: childD,
      lossVal: childLoss
    });
  }
  return candidates;
}

export function computeContinuousStep(
  rho: number,
  d: ExtendedNumber,
  eta: number
): ContinuousStepResult {
  const isRhoGreaterOrEqual =
    d.type === 'neg-infinity' ? true :
    d.type === 'pos-infinity' ? false :
    rho >= d.value;
  const gRho = isRhoGreaterOrEqual ? 1 : -1;
  const proposedRho = rho - eta * gRho;
  
  const kUpper = Math.ceil(rho);
  const kLower = Math.floor(rho);
  const crossesInteger = (proposedRho < kLower && rho >= kLower) || (proposedRho > kUpper && rho <= kUpper);
  const snappedRho = gRho > 0 ? kLower : kUpper;
  
  return {
    proposedRho,
    crossesInteger,
    snappedRho,
    gRho
  };
}

export function truncateToTreeRange(
  r: Rational,
  p: bigint,
  minPower: number,
  maxPower: number
): Rational {
  const aligned = getAlignedDigits(r, p, minPower, maxPower);
  let sum = { num: 0n, den: 1n };
  for (const entry of aligned) {
    let term: Rational;
    if (entry.power >= 0) {
      term = simplify({ num: BigInt(entry.digit) * (p ** BigInt(entry.power)), den: 1n });
    } else {
      term = simplify({ num: BigInt(entry.digit), den: p ** BigInt(-entry.power) });
    }
    sum = add(sum, term);
  }
  return sum;
}

// ============================================================================
// NEW GRADIENT & DIGIT SEQUENCE CONVERSION INTERFACES & FUNCTIONS
// ============================================================================

export interface GradientDetails {
  isVertex: boolean;
  rho: number;
  d: ExtendedNumber;
  loss: number;
  nextCenter: Rational;
  nextLogRadius: number;
  stepType: string;
  explanation: string;
  candidates?: {
    branch: string;
    branchLabel: string;
    center: Rational;
    centerStr: string;
    logRadius: number;
    distVal: ExtendedNumber;
    lossVal: number;
  }[];
  bestBranch?: string;
  bestBranchLabel?: string;
  gRho?: number;
  proposedRho?: number;
  crossesInteger?: boolean;
  snappedRho?: number;
}

export function formatDigitSequence(r: Rational, p: bigint): string {
  const aligned = getAlignedDigits(r, p, -2, 1);
  const d_minus2 = aligned.find(item => item.power === -2)?.digit ?? 0;
  const d_minus1 = aligned.find(item => item.power === -1)?.digit ?? 0;
  const d_0 = aligned.find(item => item.power === 0)?.digit ?? 0;
  const d_1 = aligned.find(item => item.power === 1)?.digit ?? 0;
  return `${d_1}${d_0}.${d_minus1}${d_minus2}`;
}

export function parseDigitSequence(seq: string, p: bigint): Rational {
  const match = seq.trim().match(/^([0-9])([0-9])\.([0-9])([0-9])$/);
  if (!match) {
    throw new Error(`Invalid digit sequence format: ${seq}`);
  }
  const d1 = Number(match[1]);
  const d0 = Number(match[2]);
  const d_minus1 = Number(match[3]);
  const d_minus2 = Number(match[4]);
  
  const pNum = Number(p);
  if (d1 >= pNum || d0 >= pNum || d_minus1 >= pNum || d_minus2 >= pNum) {
    throw new Error(`Digits in sequence ${seq} exceed base ${p}`);
  }
  
  const term1 = simplify({ num: BigInt(d1) * p, den: 1n });
  const term2 = simplify({ num: BigInt(d0), den: 1n });
  const term3 = simplify({ num: BigInt(d_minus1), den: p });
  const term4 = simplify({ num: BigInt(d_minus2), den: p ** 2n });
  
  return simplify(add(add(add(term1, term2), term3), term4));
}

export function computeGradientDetails(
  c: Rational,
  rho: number,
  y: Rational,
  y_rho: number,
  p: bigint,
  eta: number
): GradientDetails {
  const rhoMin = -2;
  const rhoMax = 2;

  const diff = subtract(c, y);
  const val = getValuation(diff, p);
  // If they match exactly, log-radius distance d is -infinity.
  const d = extNegate(val);
  const loss = val.type === 'pos-infinity' && rho <= y_rho ? 0 : computePathLoss(rho, d, y_rho);
  
  const vertexState = isVertex(rho);

  if (loss < 1e-7) {
    return {
      isVertex: vertexState,
      rho,
      d,
      loss: 0,
      nextCenter: c,
      nextLogRadius: rho,
      stepType: 'Converged (Loss = 0)',
      explanation: `The parameter $x = (x_c=${formatDigitSequence(c, p)}, x_\\rho=${rho.toFixed(4)})$ matches the target disk $y = (y_c=${formatDigitSequence(y, p)}, y_\\rho=${y_rho.toFixed(4)})$ perfectly. The loss is $0$, and optimization is complete.`,
      candidates: []
    };
  }
  
  if (vertexState) {
    const k = Math.round(rho);
    const candidates = computeVertexCandidates(c, rho, y, y_rho, p);
    
    // Find candidate that minimizes loss, breaking ties by maximizing p-adic valuation to target y
    let minLoss = Infinity;
    let maxValuation: ExtendedNumber = { type: 'neg-infinity' };
    let bestCand = candidates[0];
    for (const cand of candidates) {
      const valShift = getValuation(subtract(y, cand.center), p);
      if (cand.lossVal < minLoss) {
        minLoss = cand.lossVal;
        maxValuation = valShift;
        bestCand = cand;
      } else if (Math.abs(cand.lossVal - minLoss) < 1e-7) {
        if (extCompare(valShift, maxValuation) > 0) {
          maxValuation = valShift;
          bestCand = cand;
        }
      }
    }
    
    const nextCenter = bestCand.center;
    const nextLogRadiusUnclamped = bestCand.branch === 'parent' ? k + eta : k - eta;
    const nextLogRadius = Math.max(rhoMin, Math.min(rhoMax, nextLogRadiusUnclamped));
    const stepType = bestCand.branch === 'parent' ? 'Vertex (Move to Parent)' : `Vertex (Move to Child ${bestCand.branch})`;
    
    const explanation = `At Type II vertex ($\\rho = ${k}$), the tangent space has ${Number(p) + 1} branches (parent and ${Number(p)} children). We evaluate the path-metric loss for each branch and choose the one with the smallest loss: **${bestCand.branchLabel}**.`;
    
    return {
      isVertex: true,
      rho,
      d,
      loss,
      nextCenter,
      nextLogRadius,
      stepType,
      explanation,
      candidates,
      bestBranch: bestCand.branch,
      bestBranchLabel: bestCand.branchLabel
    };
  } else {
    const maxDVal = d.type === 'neg-infinity' ? -Infinity : d.type === 'pos-infinity' ? Infinity : d.value;
    const max_d_yrho = Math.max(maxDVal, y_rho);
    const gRho = rho >= max_d_yrho ? 1 : -1;
    const proposedRho = rho - eta * gRho;
    
    const kUpper = Math.ceil(rho);
    const kLower = Math.floor(rho);
    const crossesInteger = (proposedRho < kLower && rho >= kLower) || (proposedRho > kUpper && rho <= kUpper);
    
    let nextCenter = c;
    let nextLogRadius: number;
    let stepType: string;
    let explanation = '';
    let candidates: VertexCandidate[] | undefined = undefined;
    let bestBranch: string | undefined = undefined;
    let bestBranchLabel: string | undefined = undefined;

    if (crossesInteger) {
      const snapped = gRho > 0 ? kLower : kUpper;
      const dist = Math.abs(rho - snapped);
      const etaRemaining = eta - dist;
      
      const vertexCandidates = computeVertexCandidates(c, snapped, y, y_rho, p);
      
      let minLoss = Infinity;
      let maxValuation: ExtendedNumber = { type: 'neg-infinity' };
      let bestCand = vertexCandidates[0];
      for (const cand of vertexCandidates) {
        const valShift = getValuation(subtract(y, cand.center), p);
        if (cand.lossVal < minLoss) {
          minLoss = cand.lossVal;
          maxValuation = valShift;
          bestCand = cand;
        } else if (Math.abs(cand.lossVal - minLoss) < 1e-7) {
          if (extCompare(valShift, maxValuation) > 0) {
            maxValuation = valShift;
            bestCand = cand;
          }
        }
      }
      
      nextCenter = bestCand.center;
      const nextLogRadiusUnclamped = bestCand.branch === 'parent' ? snapped + etaRemaining : snapped - etaRemaining;
      nextLogRadius = Math.max(rhoMin, Math.min(rhoMax, nextLogRadiusUnclamped));
      
      stepType = `Edge (Crossed boundary; snapped to vertex ρ=${snapped} and took branch ${bestCand.branchLabel})`;
      explanation = `On Type III edge ($\\rho = ${rho.toFixed(4)}$), the gradient points ${gRho > 0 ? 'down' : 'up'} ($g_\\rho = ${gRho > 0 ? '+1.0' : '-1.0'}$). Moving by $\\eta = ${eta}$ crosses the integer boundary at $\\rho = ${snapped}$ with remaining step $\\eta_{\\text{rem}} = ${etaRemaining.toFixed(4)}$. At that vertex, we evaluate the tangent branches and proceed along the best branch **${bestCand.branchLabel}** by $\\eta_{\\text{rem}}$, landing at $\\rho_{\\text{new}} = ${nextLogRadius.toFixed(4)}$.`;
      candidates = vertexCandidates;
      bestBranch = bestCand.branch;
      bestBranchLabel = bestCand.branchLabel;
    } else {
      nextCenter = c;
      nextLogRadius = Math.max(rhoMin, Math.min(rhoMax, proposedRho));
      stepType = `Edge (Continuous descent dL/dρ=${gRho > 0 ? '+1' : '-1'})`;
      explanation = `On Type III edge ($\\rho = ${rho.toFixed(4)}$), the gradient of the loss with respect to $\\rho$ is $\\frac{dL}{d\\rho} = \\text{sgn}(\\rho - \\max(d, \\rho_y)) = ${gRho > 0 ? '+1.0' : '-1.0'}$ (since $\\rho ${rho >= max_d_yrho ? '\\ge' : '<'} \\max(d, \\rho_y)$). Under gradient descent, the proposed update is $\\rho_{\\text{new}} = \\rho - \\eta \\cdot \\frac{dL}{d\\rho} = ${proposedRho.toFixed(4)}$.`;
    }

    return {
      isVertex: false,
      rho,
      d,
      loss,
      nextCenter,
      nextLogRadius,
      stepType,
      explanation,
      gRho,
      proposedRho,
      crossesInteger,
      snappedRho: crossesInteger ? (gRho > 0 ? kLower : kUpper) : proposedRho,
      candidates,
      bestBranch,
      bestBranchLabel
    };
  }
}

export interface AdditionGradientsStepResult {
  nextCenterX1: Rational;
  nextRhoX1: number;
  nextCenterX2: Rational;
  nextRhoX2: number;
  sumCenter: Rational;
  sumRho: number;
  loss: number;
  drhoSum_drhoX1: number;
  drhoSum_drhoX2: number;
  drSum: number;
}

/**
 * Three methods for resolving simultaneous Type II vertex branch points,
 * as described in §3.3 (Numerical Implementation) of berkovich.tex.
 *
 * - 'exact-per-coord': Each coordinate independently evaluates all p children
 *   + parent, selects argmin loss per coordinate. O(k·p) per step.
 * - 'heuristic-joint': Uses finite-field residual projection of the
 *   combined residuals to select correlated branches. O(k·p) per step.
 * - 'exact-joint': Evaluates all p^s combinations for s simultaneous
 *   vertices and selects the global argmin. O(p^s) per step.
 */
export type VertexResolutionMethod =
  | 'exact-per-coord'
  | 'heuristic-joint'
  | 'exact-joint';

/**
 * Compute the active degrees (partial derivatives of sumRho with respect
 * to each input rho). This determines how gradient flows backward through
 * the max operation.
 */
export function computeActiveDegrees(
  rhoX1: number,
  rhoX2: number
): { drhoSum_drhoX1: number; drhoSum_drhoX2: number } {
  if (rhoX1 > rhoX2) {
    return { drhoSum_drhoX1: 1, drhoSum_drhoX2: 0 };
  } else if (rhoX2 > rhoX1) {
    return { drhoSum_drhoX1: 0, drhoSum_drhoX2: 1 };
  }
  // When equal, both contribute — use 0.5 each for gradient splitting
  return { drhoSum_drhoX1: 0.5, drhoSum_drhoX2: 0.5 };
}

/**
 * Get the digit of a p-adic number at a specific power level.
 * This extracts the residue class modulo p after shifting.
 */
function getDigitAtLevel(
  c: Rational,
  level: number,
  p: bigint
): number {
  const aligned = getAlignedDigits(c, p, level, level);
  return aligned[0]?.digit ?? 0;
}

/**
 * Exact Per-Coordinate vertex resolution.
 * Each coordinate independently selects its best branch by evaluating
 * all p children + parent against its own residual target.
 */
function stepExactPerCoord(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  targetY: Rational,
  p: bigint,
  eta: number,
  y_rho: number,
  activeDegrees: { drhoSum_drhoX1: number; drhoSum_drhoX2: number }
): { nextCX1: Rational; nextRhoX1: number; nextCX2: Rational; nextRhoX2: number } {
  let nextCX1 = cX1;
  let nextRhoX1 = rhoX1;
  let nextCX2 = cX2;
  let nextRhoX2 = rhoX2;

  // Update X1 independently: target for X1 is y - X2_center
  const targetX1 = subtract(targetY, cX2);
  const etaX1 = eta * activeDegrees.drhoSum_drhoX1;
  if (etaX1 > 0) {
    const detailsX1 = computeGradientDetails(
      cX1, rhoX1, targetX1, y_rho, p, etaX1
    );
    nextCX1 = detailsX1.nextCenter;
    nextRhoX1 = detailsX1.nextLogRadius;
  }

  // Update X2 independently: target for X2 is y - X1_center (original)
  const targetX2 = subtract(targetY, cX1);
  const etaX2 = eta * activeDegrees.drhoSum_drhoX2;
  if (etaX2 > 0) {
    const detailsX2 = computeGradientDetails(
      cX2, rhoX2, targetX2, y_rho, p, etaX2
    );
    nextCX2 = detailsX2.nextCenter;
    nextRhoX2 = detailsX2.nextLogRadius;
  }

  return { nextCX1, nextRhoX1, nextCX2, nextRhoX2 };
}

/**
 * Heuristic Joint vertex resolution.
 * When both coordinates are simultaneously at Type II vertices, uses
 * the combined residual to select correlated branches via finite-field
 * projection. When only one coordinate is at a vertex, falls back to
 * exact per-coordinate.
 */
function stepHeuristicJoint(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  targetY: Rational,
  p: bigint,
  eta: number,
  y_rho: number,
  activeDegrees: { drhoSum_drhoX1: number; drhoSum_drhoX2: number }
): { nextCX1: Rational; nextRhoX1: number; nextCX2: Rational; nextRhoX2: number } {
  const isX1Vertex = isVertex(rhoX1);
  const isX2Vertex = isVertex(rhoX2);

  // If not both at vertices, fall back to per-coordinate
  if (!isX1Vertex || !isX2Vertex) {
    return stepExactPerCoord(
      cX1, rhoX1, cX2, rhoX2, targetY, p, eta, y_rho, activeDegrees
    );
  }

  // Both at vertices: use joint residual projection.
  // The residual is r = y - (x1 + x2). We want to find digits
  // g1 for x1 and g2 for x2 such that the updated sum
  // (x1 + g1·p^(-k1)) + (x2 + g2·p^(-k2)) is closest to y.
  const k1 = Math.round(rhoX1);
  const k2 = Math.round(rhoX2);
  const sumCenter = add(cX1, cX2);
  const residual = subtract(targetY, sumCenter);

  // Extract the target digit from the residual at the relevant level.
  // For the heuristic, when k1 == k2, the combined effect at that level
  // is (g1 + g2) mod p = target_digit, so we set g1 = target_digit and
  // g2 = 0 (or vice versa based on which has larger active degree).
  const pNum = Number(p);

  let bestG1 = 0;
  let bestG2 = 0;
  let bestLoss = Infinity;

  if (k1 === k2) {
    // Same level: combined constraint (g1 + g2) ≡ target mod p
    const targetDigit = getDigitAtLevel(residual, -(k1 - 1), p);
    for (let g1 = 0; g1 < pNum; g1++) {
      const g2 = ((targetDigit - g1) % pNum + pNum) % pNum;
      const c1New = addShift(cX1, g1, k1, p);
      const c2New = addShift(cX2, g2, k2, p);
      const newSum = add(c1New, c2New);
      const loss = computeJointLoss(
        newSum, k1 - 1, targetY, y_rho, p
      );
      if (loss < bestLoss) {
        bestLoss = loss;
        bestG1 = g1;
        bestG2 = g2;
      }
    }
  } else {
    // Different levels: select each digit independently from residual
    const targetDigit1 = getDigitAtLevel(residual, -(k1 - 1), p);
    const targetDigit2 = getDigitAtLevel(residual, -(k2 - 1), p);
    bestG1 = targetDigit1;
    bestG2 = targetDigit2;
  }

  // Also consider parent moves (moving up instead of down)
  const c1Down = addShift(cX1, bestG1, k1, p);
  const c2Down = addShift(cX2, bestG2, k2, p);
  const lossDown = computeJointLoss(
    add(c1Down, c2Down), Math.min(k1, k2) - 1, targetY, y_rho, p
  );
  const lossUp = computeJointLoss(
    sumCenter, Math.max(k1, k2) + 1, targetY, y_rho, p
  );

  let nextCX1: Rational;
  let nextRhoX1: number;
  let nextCX2: Rational;
  let nextRhoX2: number;

  if (lossUp < lossDown) {
    // Move both up (parent)
    nextCX1 = cX1;
    nextRhoX1 = Math.min(2, k1 + eta);
    nextCX2 = cX2;
    nextRhoX2 = Math.min(2, k2 + eta);
  } else {
    // Move both down with selected digits
    nextCX1 = c1Down;
    nextRhoX1 = Math.max(-2, k1 - eta);
    nextCX2 = c2Down;
    nextRhoX2 = Math.max(-2, k2 - eta);
  }

  return { nextCX1, nextRhoX1, nextCX2, nextRhoX2 };
}

/**
 * Exact Joint vertex resolution.
 * When both coordinates are simultaneously at Type II vertices, evaluates
 * all p^2 combinations (plus parent options) and selects the global argmin.
 * Falls back to per-coordinate when only one is at a vertex.
 */
function stepExactJoint(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  targetY: Rational,
  p: bigint,
  eta: number,
  y_rho: number,
  activeDegrees: { drhoSum_drhoX1: number; drhoSum_drhoX2: number }
): { nextCX1: Rational; nextRhoX1: number; nextCX2: Rational; nextRhoX2: number } {
  const isX1Vertex = isVertex(rhoX1);
  const isX2Vertex = isVertex(rhoX2);

  // If not both at vertices, fall back to per-coordinate
  if (!isX1Vertex || !isX2Vertex) {
    return stepExactPerCoord(
      cX1, rhoX1, cX2, rhoX2, targetY, p, eta, y_rho, activeDegrees
    );
  }

  // Both at vertices: exhaustive search over all (p+1)^2 combinations
  const k1 = Math.round(rhoX1);
  const k2 = Math.round(rhoX2);
  const pNum = Number(p);

  interface JointCandidate {
    cX1: Rational;
    rhoX1: number;
    cX2: Rational;
    rhoX2: number;
    loss: number;
  }

  let bestCandidate: JointCandidate | undefined;

  // Generate candidates for X1: p children + 1 parent
  const x1Candidates: { center: Rational; rho: number }[] = [];
  for (let g = 0; g < pNum; g++) {
    x1Candidates.push({
      center: addShift(cX1, g, k1, p),
      rho: k1 - 1
    });
  }
  x1Candidates.push({ center: cX1, rho: k1 + 1 }); // parent

  // Generate candidates for X2: p children + 1 parent
  const x2Candidates: { center: Rational; rho: number }[] = [];
  for (let g = 0; g < pNum; g++) {
    x2Candidates.push({
      center: addShift(cX2, g, k2, p),
      rho: k2 - 1
    });
  }
  x2Candidates.push({ center: cX2, rho: k2 + 1 }); // parent

  // Evaluate all combinations
  for (const c1 of x1Candidates) {
    for (const c2 of x2Candidates) {
      const newSumCenter = add(c1.center, c2.center);
      const newSumRho = Math.max(c1.rho, c2.rho);
      const clampedSumRho = Math.max(-2, Math.min(2, newSumRho));
      const diffVal = getValuation(subtract(newSumCenter, targetY), p);
      const dExt = extNegate(diffVal);
      const loss = (diffVal.type === 'pos-infinity' && clampedSumRho <= y_rho)
        ? 0
        : computePathLoss(clampedSumRho, dExt, y_rho);

      if (!bestCandidate || loss < bestCandidate.loss) {
        bestCandidate = {
          cX1: c1.center,
          rhoX1: c1.rho,
          cX2: c2.center,
          rhoX2: c2.rho,
          loss
        };
      }
    }
  }

  if (!bestCandidate) {
    return { nextCX1: cX1, nextRhoX1: rhoX1, nextCX2: cX2, nextRhoX2: rhoX2 };
  }

  // Apply eta-scaled step toward the selected rho
  const nextRhoX1 = Math.max(-2, Math.min(2,
    bestCandidate.rhoX1 > k1
      ? k1 + eta  // moving to parent
      : k1 - eta  // moving to child
  ));
  const nextRhoX2 = Math.max(-2, Math.min(2,
    bestCandidate.rhoX2 > k2
      ? k2 + eta
      : k2 - eta
  ));

  return {
    nextCX1: bestCandidate.cX1,
    nextRhoX1,
    nextCX2: bestCandidate.cX2,
    nextRhoX2
  };
}

/** Helper: add a digit shift to a center at a given vertex level. */
function addShift(
  c: Rational,
  digit: number,
  k: number,
  p: bigint
): Rational {
  const power = -k;
  let shift: Rational;
  if (power <= 0) {
    shift = simplify({ num: BigInt(digit), den: p ** BigInt(-power) });
  } else {
    shift = simplify({
      num: BigInt(digit) * (p ** BigInt(power)),
      den: 1n
    });
  }
  return add(c, shift);
}

/** Helper: compute loss for a joint candidate sum. */
function computeJointLoss(
  sumCenter: Rational,
  sumRho: number,
  targetY: Rational,
  y_rho: number,
  p: bigint
): number {
  const clampedRho = Math.max(-2, Math.min(2, sumRho));
  const diffVal = getValuation(subtract(sumCenter, targetY), p);
  const dExt = extNegate(diffVal);
  return (diffVal.type === 'pos-infinity' && clampedRho <= y_rho)
    ? 0
    : computePathLoss(clampedRho, dExt, y_rho);
}

export function stepAdditionGradients(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  targetY: Rational,
  p: bigint,
  eta: number,
  method: VertexResolutionMethod = 'exact-per-coord'
): AdditionGradientsStepResult {
  const sumCenter = add(cX1, cX2);
  const sumRho = Math.max(rhoX1, rhoX2);

  // Distance between sum disk and target
  const diff = subtract(sumCenter, targetY);
  const valDiff = getValuation(diff, p);
  const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;

  // L1 loss is |sumRho - d| + d - y_rho
  const y_rho = -2;
  const loss = valDiff.type === 'pos-infinity' && sumRho <= y_rho
    ? 0
    : computePathLoss(sumRho, extNegate(valDiff), y_rho);

  // Gradient of loss w.r.t sumRho
  let drSum = 0;
  if (sumRho > d) drSum = 1;
  else if (sumRho < d) drSum = -1;

  // Active degrees
  const activeDegrees = computeActiveDegrees(rhoX1, rhoX2);

  // Dispatch to the appropriate resolution method
  let result: {
    nextCX1: Rational;
    nextRhoX1: number;
    nextCX2: Rational;
    nextRhoX2: number;
  };

  switch (method) {
    case 'heuristic-joint':
      result = stepHeuristicJoint(
        cX1, rhoX1, cX2, rhoX2, targetY, p, eta, y_rho, activeDegrees
      );
      break;
    case 'exact-joint':
      result = stepExactJoint(
        cX1, rhoX1, cX2, rhoX2, targetY, p, eta, y_rho, activeDegrees
      );
      break;
    case 'exact-per-coord':
    default:
      result = stepExactPerCoord(
        cX1, rhoX1, cX2, rhoX2, targetY, p, eta, y_rho, activeDegrees
      );
      break;
  }

  return {
    nextCenterX1: result.nextCX1,
    nextRhoX1: result.nextRhoX1,
    nextCenterX2: result.nextCX2,
    nextRhoX2: result.nextRhoX2,
    sumCenter,
    sumRho,
    loss,
    drhoSum_drhoX1: activeDegrees.drhoSum_drhoX1,
    drhoSum_drhoX2: activeDegrees.drhoSum_drhoX2,
    drSum
  };
}

export interface MultiplicationGradientsStepResult {
  nextCenterX1: Rational;
  nextRhoX1: number;
  nextCenterX2: Rational;
  nextRhoX2: number;
  prodCenter: Rational;
  prodRho: number;
  loss: number;
  drhoProd_drhoX1: number;
  drhoProd_drhoX2: number;
  drProd: number;
}

export function computeMultiplicationActiveDegrees(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  p: bigint
): { drhoProd_drhoX1: number; drhoProd_drhoX2: number } {
  const val1 = getValuation(cX1, p);
  const val2 = getValuation(cX2, p);

  const logNorm1 = val1.type === 'finite' ? -val1.value : -Infinity;
  const logNorm2 = val2.type === 'finite' ? -val2.value : -Infinity;

  const t1 = logNorm2 + rhoX1;
  const t2 = logNorm1 + rhoX2;
  const t3 = rhoX1 + rhoX2;

  const maxVal = Math.max(t1, t2, t3);

  let d1 = 0;
  let d2 = 0;
  let activeCount = 0;

  if (Math.abs(t1 - maxVal) < 1e-9) {
    d1 += 1;
    activeCount++;
  }
  if (Math.abs(t2 - maxVal) < 1e-9) {
    d2 += 1;
    activeCount++;
  }
  if (Math.abs(t3 - maxVal) < 1e-9) {
    d1 += 1;
    d2 += 1;
    activeCount++;
  }

  return {
    drhoProd_drhoX1: d1 / activeCount,
    drhoProd_drhoX2: d2 / activeCount
  };
}

function computeMultiplicationJointLoss(
  prodCenter: Rational,
  prodRho: number,
  targetY: Rational,
  y_rho: number,
  p: bigint
): number {
  const clampedRho = Math.max(-2, Math.min(2, prodRho));
  const diffVal = getValuation(subtract(prodCenter, targetY), p);
  const dExt = extNegate(diffVal);
  return (diffVal.type === 'pos-infinity' && clampedRho <= y_rho)
    ? 0
    : computePathLoss(clampedRho, dExt, y_rho);
}

function computeProdRho(
  c1: Rational,
  rho1: number,
  c2: Rational,
  rho2: number,
  p: bigint
): number {
  const val1 = getValuation(c1, p);
  const val2 = getValuation(c2, p);
  const logNorm1 = val1.type === 'finite' ? -val1.value : -Infinity;
  const logNorm2 = val2.type === 'finite' ? -val2.value : -Infinity;
  return Math.max(logNorm2 + rho1, logNorm1 + rho2, rho1 + rho2);
}

function stepMultiplicationExactPerCoord(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  targetY: Rational,
  p: bigint,
  eta: number,
  y_rho: number,
  activeDegrees: { drhoProd_drhoX1: number; drhoProd_drhoX2: number }
): { nextCX1: Rational; nextRhoX1: number; nextCX2: Rational; nextRhoX2: number } {
  let nextCX1 = cX1;
  let nextRhoX1 = rhoX1;
  let nextCX2 = cX2;
  let nextRhoX2 = rhoX2;

  const k1 = Math.round(rhoX1);
  const k2 = Math.round(rhoX2);
  const pNum = Number(p);

  if (activeDegrees.drhoProd_drhoX1 > 0) {
    if (isVertex(rhoX1)) {
      let bestLoss = Infinity;
      let bestC1 = cX1;
      let bestRho1 = rhoX1;

      for (let g = 0; g < pNum; g++) {
        const c1Cand = addShift(cX1, g, k1, p);
        const rho1Cand = k1 - 1;
        const loss = computeMultiplicationJointLoss(
          multiply(c1Cand, cX2),
          computeProdRho(c1Cand, rho1Cand, cX2, rhoX2, p),
          targetY, y_rho, p
        );
        if (loss < bestLoss) {
          bestLoss = loss;
          bestC1 = c1Cand;
          bestRho1 = rho1Cand;
        }
      }
      const lossParent = computeMultiplicationJointLoss(
        multiply(cX1, cX2),
        computeProdRho(cX1, k1 + 1, cX2, rhoX2, p),
        targetY, y_rho, p
      );
      if (lossParent < bestLoss) {
        bestLoss = lossParent;
        bestC1 = cX1;
        bestRho1 = k1 + 1;
      }

      nextCX1 = bestC1;
      nextRhoX1 = Math.max(-2, Math.min(2, bestRho1 > k1 ? k1 + eta : k1 - eta));
    } else {
      const diff = subtract(multiply(cX1, cX2), targetY);
      const valDiff = getValuation(diff, p);
      const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
      const prodRho = computeProdRho(cX1, rhoX1, cX2, rhoX2, p);
      let drProd = 0;
      if (prodRho > d) drProd = 1;
      else if (prodRho < d) drProd = -1;

      const grad1 = drProd * activeDegrees.drhoProd_drhoX1;
      nextRhoX1 = Math.max(-2, Math.min(2, rhoX1 - eta * grad1));
    }
  }

  if (activeDegrees.drhoProd_drhoX2 > 0) {
    if (isVertex(rhoX2)) {
      let bestLoss = Infinity;
      let bestC2 = cX2;
      let bestRho2 = rhoX2;

      for (let g = 0; g < pNum; g++) {
        const c2Cand = addShift(cX2, g, k2, p);
        const rho2Cand = k2 - 1;
        const loss = computeMultiplicationJointLoss(
          multiply(cX1, c2Cand),
          computeProdRho(cX1, rhoX1, c2Cand, rho2Cand, p),
          targetY, y_rho, p
        );
        if (loss < bestLoss) {
          bestLoss = loss;
          bestC2 = c2Cand;
          bestRho2 = rho2Cand;
        }
      }
      const lossParent = computeMultiplicationJointLoss(
        multiply(cX1, cX2),
        computeProdRho(cX1, rhoX1, cX2, k2 + 1, p),
        targetY, y_rho, p
      );
      if (lossParent < bestLoss) {
        bestLoss = lossParent;
        bestC2 = cX2;
        bestRho2 = k2 + 1;
      }

      nextCX2 = bestC2;
      nextRhoX2 = Math.max(-2, Math.min(2, bestRho2 > k2 ? k2 + eta : k2 - eta));
    } else {
      const diff = subtract(multiply(cX1, cX2), targetY);
      const valDiff = getValuation(diff, p);
      const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
      const prodRho = computeProdRho(cX1, rhoX1, cX2, rhoX2, p);
      let drProd = 0;
      if (prodRho > d) drProd = 1;
      else if (prodRho < d) drProd = -1;

      const grad2 = drProd * activeDegrees.drhoProd_drhoX2;
      nextRhoX2 = Math.max(-2, Math.min(2, rhoX2 - eta * grad2));
    }
  }

  return { nextCX1: nextCX1, nextRhoX1: nextRhoX1, nextCX2: nextCX2, nextRhoX2: nextRhoX2 };
}

function stepMultiplicationExactJoint(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  targetY: Rational,
  p: bigint,
  eta: number,
  y_rho: number,
  activeDegrees: { drhoProd_drhoX1: number; drhoProd_drhoX2: number }
): { nextCX1: Rational; nextRhoX1: number; nextCX2: Rational; nextRhoX2: number } {
  const isX1Vertex = isVertex(rhoX1);
  const isX2Vertex = isVertex(rhoX2);

  if (!isX1Vertex || !isX2Vertex) {
    return stepMultiplicationExactPerCoord(
      cX1, rhoX1, cX2, rhoX2, targetY, p, eta, y_rho, activeDegrees
    );
  }

  const k1 = Math.round(rhoX1);
  const k2 = Math.round(rhoX2);
  const pNum = Number(p);

  interface JointCandidate {
    cX1: Rational;
    rhoX1: number;
    cX2: Rational;
    rhoX2: number;
    loss: number;
  }

  let bestCandidate: JointCandidate | undefined;

  const x1Candidates: { center: Rational; rho: number }[] = [];
  for (let g = 0; g < pNum; g++) {
    x1Candidates.push({ center: addShift(cX1, g, k1, p), rho: k1 - 1 });
  }
  x1Candidates.push({ center: cX1, rho: k1 + 1 });

  const x2Candidates: { center: Rational; rho: number }[] = [];
  for (let g = 0; g < pNum; g++) {
    x2Candidates.push({ center: addShift(cX2, g, k2, p), rho: k2 - 1 });
  }
  x2Candidates.push({ center: cX2, rho: k2 + 1 });

  for (const c1 of x1Candidates) {
    for (const c2 of x2Candidates) {
      const prodCenter = multiply(c1.center, c2.center);
      const prodRho = computeProdRho(c1.center, c1.rho, c2.center, c2.rho, p);
      const loss = computeMultiplicationJointLoss(prodCenter, prodRho, targetY, y_rho, p);

      if (!bestCandidate || loss < bestCandidate.loss) {
        bestCandidate = {
          cX1: c1.center,
          rhoX1: c1.rho,
          cX2: c2.center,
          rhoX2: c2.rho,
          loss
        };
      }
    }
  }

  if (!bestCandidate) {
    return { nextCX1: cX1, nextRhoX1: rhoX1, nextCX2: cX2, nextRhoX2: rhoX2 };
  }

  const nextRhoX1 = Math.max(-2, Math.min(2, bestCandidate.rhoX1 > k1 ? k1 + eta : k1 - eta));
  const nextRhoX2 = Math.max(-2, Math.min(2, bestCandidate.rhoX2 > k2 ? k2 + eta : k2 - eta));

  return {
    nextCX1: bestCandidate.cX1,
    nextRhoX1,
    nextCX2: bestCandidate.cX2,
    nextRhoX2
  };
}

export function stepMultiplicationGradients(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  targetY: Rational,
  p: bigint,
  eta: number,
  method: VertexResolutionMethod = 'exact-per-coord'
): MultiplicationGradientsStepResult {
  const prodCenter = multiply(cX1, cX2);

  const val1 = getValuation(cX1, p);
  const val2 = getValuation(cX2, p);
  const logNorm1 = val1.type === 'finite' ? -val1.value : -Infinity;
  const logNorm2 = val2.type === 'finite' ? -val2.value : -Infinity;

  const t1 = logNorm2 + rhoX1;
  const t2 = logNorm1 + rhoX2;
  const t3 = rhoX1 + rhoX2;
  const prodRho = Math.max(t1, t2, t3);

  const diff = subtract(prodCenter, targetY);
  const valDiff = getValuation(diff, p);
  const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;

  const y_rho = -2;
  const loss = valDiff.type === 'pos-infinity' && prodRho <= y_rho
    ? 0
    : computePathLoss(prodRho, extNegate(valDiff), y_rho);

  let drProd = 0;
  if (prodRho > d) drProd = 1;
  else if (prodRho < d) drProd = -1;

  const activeDegrees = computeMultiplicationActiveDegrees(cX1, rhoX1, cX2, rhoX2, p);

  let result: {
    nextCX1: Rational;
    nextRhoX1: number;
    nextCX2: Rational;
    nextRhoX2: number;
  };

  if (method === 'exact-joint') {
    result = stepMultiplicationExactJoint(
      cX1, rhoX1, cX2, rhoX2, targetY, p, eta, y_rho, activeDegrees
    );
  } else {
    result = stepMultiplicationExactPerCoord(
      cX1, rhoX1, cX2, rhoX2, targetY, p, eta, y_rho, activeDegrees
    );
  }

  return {
    nextCenterX1: result.nextCX1,
    nextRhoX1: result.nextRhoX1,
    nextCenterX2: result.nextCX2,
    nextRhoX2: result.nextRhoX2,
    prodCenter,
    prodRho,
    loss,
    drhoProd_drhoX1: activeDegrees.drhoProd_drhoX1,
    drhoProd_drhoX2: activeDegrees.drhoProd_drhoX2,
    drProd
  };
}

export interface SoftmaxGradientsStepResult {
  nextCenterX1: Rational;
  nextRhoX1: number;
  nextCenterX2: Rational;
  nextRhoX2: number;
  loss: number;
  pi1: number;
  pi2: number;
  drho1: number;
  drho2: number;
}

function computeSoftmaxLoss(
  c1: Rational,
  rho1: number,
  c2: Rational,
  rho2: number,
  targetY: Rational,
  p: bigint,
  beta: number
): number {
  const d1Ext = getValuation(subtract(c1, targetY), p);
  const d2Ext = getValuation(subtract(c2, targetY), p);
  const d1 = d1Ext.type === 'finite' ? -d1Ext.value : -Infinity;
  const d2 = d2Ext.type === 'finite' ? -d2Ext.value : -Infinity;

  const M1 = 2 * Math.max(rho1, d1) - rho1;
  const M2 = 2 * Math.max(rho2, d2) - rho2;

  const D1 = -M1;
  const D2 = -M2;

  const maxD = Math.max(D1, D2);
  const exp1 = Math.exp(beta * (D1 - maxD));
  const exp2 = Math.exp(beta * (D2 - maxD));
  return -Math.log(exp1 / (exp1 + exp2) + 1e-15);
}

function stepSoftmaxExactPerCoord(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  targetY: Rational,
  p: bigint,
  eta: number,
  beta: number
): { nextCX1: Rational; nextRhoX1: number; nextCX2: Rational; nextRhoX2: number } {
  let nextCX1 = cX1;
  let nextRhoX1 = rhoX1;
  let nextCX2 = cX2;
  let nextRhoX2 = rhoX2;

  const k1 = Math.round(rhoX1);
  const k2 = Math.round(rhoX2);
  const pNum = Number(p);

  if (isVertex(rhoX1)) {
    let bestLoss = Infinity;
    let bestC1 = cX1;
    let bestRho1 = rhoX1;

    for (let g = 0; g < pNum; g++) {
      const c1Cand = addShift(cX1, g, k1, p);
      const rho1Cand = k1 - 1;
      const loss = computeSoftmaxLoss(c1Cand, rho1Cand, cX2, rhoX2, targetY, p, beta);
      if (loss < bestLoss) {
        bestLoss = loss;
        bestC1 = c1Cand;
        bestRho1 = rho1Cand;
      }
    }
    const lossParent = computeSoftmaxLoss(cX1, k1 + 1, cX2, rhoX2, targetY, p, beta);
    if (lossParent < bestLoss) {
      bestLoss = lossParent;
      bestC1 = cX1;
      bestRho1 = k1 + 1;
    }

    nextCX1 = bestC1;
    nextRhoX1 = Math.max(-2, Math.min(2, bestRho1 > k1 ? k1 + eta : k1 - eta));
  } else {
    const d1Ext = getValuation(subtract(cX1, targetY), p);
    const d1 = d1Ext.type === 'finite' ? -d1Ext.value : -Infinity;
    const loss = computeSoftmaxLoss(cX1, rhoX1, cX2, rhoX2, targetY, p, beta);
    const pi1 = Math.exp(-loss);
    let sgn1 = 0;
    if (rhoX1 > d1) sgn1 = 1;
    else if (rhoX1 < d1) sgn1 = -1;
    const drho1 = beta * (1 - pi1) * sgn1;
    nextRhoX1 = Math.max(-2, Math.min(2, rhoX1 - eta * drho1));
  }

  if (isVertex(rhoX2)) {
    let bestLoss = Infinity;
    let bestC2 = cX2;
    let bestRho2 = rhoX2;

    for (let g = 0; g < pNum; g++) {
      const c2Cand = addShift(cX2, g, k2, p);
      const rho2Cand = k2 - 1;
      const loss = computeSoftmaxLoss(cX1, rhoX1, c2Cand, rho2Cand, targetY, p, beta);
      if (loss < bestLoss) {
        bestLoss = loss;
        bestC2 = c2Cand;
        bestRho2 = rho2Cand;
      }
    }
    const lossParent = computeSoftmaxLoss(cX1, rhoX1, cX2, k2 + 1, targetY, p, beta);
    if (lossParent < bestLoss) {
      bestLoss = lossParent;
      bestC2 = cX2;
      bestRho2 = k2 + 1;
    }

    nextCX2 = bestC2;
    nextRhoX2 = Math.max(-2, Math.min(2, bestRho2 > k2 ? k2 + eta : k2 - eta));
  } else {
    const d2Ext = getValuation(subtract(cX2, targetY), p);
    const d2 = d2Ext.type === 'finite' ? -d2Ext.value : -Infinity;
    const loss = computeSoftmaxLoss(cX1, rhoX1, cX2, rhoX2, targetY, p, beta);
    const pi2 = 1 - Math.exp(-loss);
    let sgn2 = 0;
    if (rhoX2 > d2) sgn2 = 1;
    else if (rhoX2 < d2) sgn2 = -1;
    const drho2 = rhoX2 >= d2 ? -beta * pi2 * sgn2 : 0;
    nextRhoX2 = Math.max(-2, Math.min(2, rhoX2 - eta * drho2));
  }

  return { nextCX1, nextRhoX1, nextCX2, nextRhoX2 };
}

function stepSoftmaxExactJoint(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  targetY: Rational,
  p: bigint,
  eta: number,
  beta: number
): { nextCX1: Rational; nextRhoX1: number; nextCX2: Rational; nextRhoX2: number } {
  const isX1Vertex = isVertex(rhoX1);
  const isX2Vertex = isVertex(rhoX2);

  if (!isX1Vertex || !isX2Vertex) {
    return stepSoftmaxExactPerCoord(cX1, rhoX1, cX2, rhoX2, targetY, p, eta, beta);
  }

  const k1 = Math.round(rhoX1);
  const k2 = Math.round(rhoX2);
  const pNum = Number(p);

  interface JointCandidate {
    cX1: Rational;
    rhoX1: number;
    cX2: Rational;
    rhoX2: number;
    loss: number;
  }

  let bestCandidate: JointCandidate | undefined;

  const x1Candidates: { center: Rational; rho: number }[] = [];
  for (let g = 0; g < pNum; g++) {
    x1Candidates.push({ center: addShift(cX1, g, k1, p), rho: k1 - 1 });
  }
  x1Candidates.push({ center: cX1, rho: k1 + 1 });

  const x2Candidates: { center: Rational; rho: number }[] = [];
  for (let g = 0; g < pNum; g++) {
    x2Candidates.push({ center: addShift(cX2, g, k2, p), rho: k2 - 1 });
  }
  x2Candidates.push({ center: cX2, rho: k2 + 1 });

  for (const c1 of x1Candidates) {
    for (const c2 of x2Candidates) {
      const loss = computeSoftmaxLoss(c1.center, c1.rho, c2.center, c2.rho, targetY, p, beta);

      if (!bestCandidate || loss < bestCandidate.loss) {
        bestCandidate = {
          cX1: c1.center,
          rhoX1: c1.rho,
          cX2: c2.center,
          rhoX2: c2.rho,
          loss
        };
      }
    }
  }

  if (!bestCandidate) {
    return { nextCX1: cX1, nextRhoX1: rhoX1, nextCX2: cX2, nextRhoX2: rhoX2 };
  }

  const nextRhoX1 = Math.max(-2, Math.min(2, bestCandidate.rhoX1 > k1 ? k1 + eta : k1 - eta));
  const nextRhoX2 = Math.max(-2, Math.min(2, bestCandidate.rhoX2 > k2 ? k2 + eta : k2 - eta));

  return {
    nextCX1: bestCandidate.cX1,
    nextRhoX1,
    nextCX2: bestCandidate.cX2,
    nextRhoX2
  };
}

export function stepSoftmaxGradients(
  cX1: Rational,
  rhoX1: number,
  cX2: Rational,
  rhoX2: number,
  targetY: Rational,
  p: bigint,
  eta: number,
  beta: number = 1.0,
  method: VertexResolutionMethod = 'exact-per-coord'
): SoftmaxGradientsStepResult {
  const d1Ext = getValuation(subtract(cX1, targetY), p);
  const d2Ext = getValuation(subtract(cX2, targetY), p);

  const d1 = d1Ext.type === 'finite' ? -d1Ext.value : -Infinity;
  const d2 = d2Ext.type === 'finite' ? -d2Ext.value : -Infinity;

  const M1 = 2 * Math.max(rhoX1, d1) - rhoX1;
  const M2 = 2 * Math.max(rhoX2, d2) - rhoX2;

  const D1 = -M1;
  const D2 = -M2;

  const maxD = Math.max(D1, D2);
  const exp1 = Math.exp(beta * (D1 - maxD));
  const exp2 = Math.exp(beta * (D2 - maxD));
  const sumExp = exp1 + exp2;

  const pi1 = exp1 / sumExp;
  const pi2 = exp2 / sumExp;

  const loss = -Math.log(pi1 + 1e-15);

  let sgn1 = 0;
  if (rhoX1 > d1) sgn1 = 1;
  else if (rhoX1 < d1) sgn1 = -1;
  const drho1 = beta * (1 - pi1) * sgn1;

  let sgn2 = 0;
  if (rhoX2 > d2) sgn2 = 1;
  else if (rhoX2 < d2) sgn2 = -1;
  const drho2 = rhoX2 >= d2 ? -beta * pi2 * sgn2 : 0;

  let result: {
    nextCX1: Rational;
    nextRhoX1: number;
    nextCX2: Rational;
    nextRhoX2: number;
  };

  if (method === 'exact-joint') {
    result = stepSoftmaxExactJoint(cX1, rhoX1, cX2, rhoX2, targetY, p, eta, beta);
  } else {
    result = stepSoftmaxExactPerCoord(cX1, rhoX1, cX2, rhoX2, targetY, p, eta, beta);
  }

  return {
    nextCenterX1: result.nextCX1,
    nextRhoX1: result.nextRhoX1,
    nextCenterX2: result.nextCX2,
    nextRhoX2: result.nextRhoX2,
    loss,
    pi1,
    pi2,
    drho1,
    drho2
  };
}

export type BerkovichUnaryOperator = 'shift' | 'scale' | 'square' | 'cube';

export interface UnaryGradientsStepResult {
  nextCenterX: Rational;
  nextRhoX: number;
  outCenter: Rational;
  outRho: number;
  loss: number;
  drhoOut_drhoX: number;
  drOut: number;
}

export function stepUnaryOperatorGradients(
  cX: Rational,
  rhoX: number,
  op: BerkovichUnaryOperator,
  targetY: Rational,
  p: bigint,
  eta: number,
  method: VertexResolutionMethod = 'exact-per-coord'
): UnaryGradientsStepResult {
  const y_rho = -2;
  const pNum = Number(p);

  // Constants
  // Shift: b = 1
  const b = simplify({ num: 1n, den: 1n });
  // Scale: a = p
  const a = simplify({ num: p, den: 1n });

  // 1. Forward Pass
  let outCenter: Rational;
  let outRho: number;
  let activeDegree = 1.0;

  if (op === 'shift') {
    outCenter = add(cX, b);
    outRho = rhoX;
    activeDegree = 1.0;
  } else if (op === 'scale') {
    outCenter = multiply(a, cX);
    // log_p |p|_p = -1
    outRho = -1.0 + rhoX;
    activeDegree = 1.0;
  } else if (op === 'square') {
    // square: f(x) = x^2
    outCenter = multiply(cX, cX);
    const valC = getValuation(cX, p);
    const logNormC = valC.type === 'finite' ? -valC.value : -Infinity;
    const t1 = logNormC + rhoX;
    const t2 = 2.0 * rhoX;
    outRho = Math.max(t1, t2);

    if (Math.abs(t1 - t2) < 1e-9) {
      activeDegree = 1.5;
    } else if (t1 > t2) {
      activeDegree = 1.0;
    } else {
      activeDegree = 2.0;
    }
  } else {
    // cube: f(x) = x^3
    outCenter = multiply(cX, multiply(cX, cX));
    const valC = getValuation(cX, p);
    const logNormC = valC.type === 'finite' ? -valC.value : -Infinity;
    const log3 = (p === 3n) ? -1.0 : 0.0;
    const t1 = log3 + 2.0 * logNormC + rhoX;
    const t2 = log3 + logNormC + 2.0 * rhoX;
    const t3 = 3.0 * rhoX;
    outRho = Math.max(t1, t2, t3);

    let maxVal = outRho;
    let sumDegrees = 0;
    let count = 0;
    if (Math.abs(t1 - maxVal) < 1e-9) { sumDegrees += 1.0; count++; }
    if (Math.abs(t2 - maxVal) < 1e-9) { sumDegrees += 2.0; count++; }
    if (Math.abs(t3 - maxVal) < 1e-9) { sumDegrees += 3.0; count++; }
    activeDegree = sumDegrees / count;
  }

  // Truncate outCenter to tree range [-2, 1] for visual and boundary consistency
  const outCenterTrunc = truncateToTreeRange(outCenter, p, -2, 1);

  // 2. Loss & Distance
  const diff = subtract(outCenterTrunc, targetY);
  const valDiff = getValuation(diff, p);
  const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;

  const loss = valDiff.type === 'pos-infinity' && outRho <= y_rho
    ? 0
    : computePathLoss(outRho, extNegate(valDiff), y_rho);

  // 3. Gradient w.r.t outRho
  let drOut = 0;
  if (outRho > d) drOut = 1;
  else if (outRho < d) drOut = -1;

  // 4. Backward Pass & Resolution
  let nextCX = cX;
  let nextRhoX = rhoX;

  const isInteger = Math.abs(rhoX - Math.round(rhoX)) < 1e-9;

  if (!isInteger) {
    // Continuous update
    const rawNextRhoX = rhoX - eta * drOut * activeDegree;
    nextRhoX = Math.max(-2, Math.min(2, rawNextRhoX));
    nextCX = cX;
  } else {
    // Vertex transition: evaluate parent and children
    const intRhoX = Math.round(rhoX);
    
    // Candidate 1: Move up (parent)
    const parentRhoX = Math.min(2, intRhoX + 1);
    const parentLoss = evaluateCandidateLoss(cX, parentRhoX, op, targetY, p, y_rho, a, b);

    let bestLoss = parentLoss;
    let bestCX = cX;
    let bestRhoX = parentRhoX;

    // Candidates 2..p+1: Move down to children
    const childRhoX = Math.max(-2, intRhoX - 1);
    if (childRhoX >= -2) {
      const power = -intRhoX;
      for (let g = 0; g < pNum; g++) {
        let shift: Rational;
        if (power <= 0) {
          shift = simplify({ num: BigInt(g), den: p ** BigInt(-power) });
        } else {
          shift = simplify({ num: BigInt(g) * (p ** BigInt(power)), den: 1n });
        }
        const childCX = add(cX, shift);
        const childLoss = evaluateCandidateLoss(childCX, childRhoX, op, targetY, p, y_rho, a, b);

        if (childLoss < bestLoss - 1e-9) {
          bestLoss = childLoss;
          bestCX = childCX;
          bestRhoX = childRhoX;
        }
      }
    }

    nextCX = bestCX;
    const isParent = bestRhoX > intRhoX;
    nextRhoX = Math.max(-2, Math.min(2, isParent ? intRhoX + eta : intRhoX - eta));
  }

  return {
    nextCenterX: nextCX,
    nextRhoX,
    outCenter: outCenterTrunc,
    outRho,
    loss,
    drhoOut_drhoX: activeDegree,
    drOut
  };
}

function evaluateCandidateLoss(
  cX: Rational,
  rhoX: number,
  op: BerkovichUnaryOperator,
  targetY: Rational,
  p: bigint,
  y_rho: number,
  a: Rational,
  b: Rational
): number {
  let outCenter: Rational;
  let outRho: number;

  if (op === 'shift') {
    outCenter = add(cX, b);
    outRho = rhoX;
  } else if (op === 'scale') {
    outCenter = multiply(a, cX);
    outRho = -1.0 + rhoX;
  } else if (op === 'square') {
    // square
    outCenter = multiply(cX, cX);
    const valC = getValuation(cX, p);
    const logNormC = valC.type === 'finite' ? -valC.value : -Infinity;
    outRho = Math.max(logNormC + rhoX, 2.0 * rhoX);
  } else {
    // cube
    outCenter = multiply(cX, multiply(cX, cX));
    const valC = getValuation(cX, p);
    const logNormC = valC.type === 'finite' ? -valC.value : -Infinity;
    const log3 = (p === 3n) ? -1.0 : 0.0;
    outRho = Math.max(
      log3 + 2.0 * logNormC + rhoX,
      log3 + logNormC + 2.0 * rhoX,
      3.0 * rhoX
    );
  }

  const outCenterTrunc = truncateToTreeRange(outCenter, p, -2, 1);
  const diff = subtract(outCenterTrunc, targetY);
  const valDiff = getValuation(diff, p);

  return valDiff.type === 'pos-infinity' && outRho <= y_rho
    ? 0
    : computePathLoss(outRho, extNegate(valDiff), y_rho);
}
