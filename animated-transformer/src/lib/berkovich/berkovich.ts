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
      explanation: `The parameter $x = (${formatRational(c)}, ${rho.toFixed(4)})$ matches the target disk $y = (${formatRational(y)}, ${y_rho.toFixed(4)})$ perfectly. The loss is $0$, and optimization is complete.`,
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
    
    let nextLogRadius: number;
    let stepType: string;
    if (crossesInteger) {
      nextLogRadius = gRho > 0 ? kLower : kUpper;
      stepType = `Edge (Continuous snap to ρ=${nextLogRadius})`;
    } else {
      nextLogRadius = proposedRho;
      stepType = `Edge (Continuous descent dL/dρ=${gRho > 0 ? '+1' : '-1'})`;
    }
    nextLogRadius = Math.max(rhoMin, Math.min(rhoMax, nextLogRadius));
    
    const snappedRho = crossesInteger ? (gRho > 0 ? kLower : kUpper) : proposedRho;
    const explanation = `On Type III edge ($\\rho = ${rho.toFixed(4)}$), the gradient of the loss with respect to $\\rho$ is $\\frac{dL}{d\\rho} = \\text{sgn}(\\rho - \\max(d, \\rho_y)) = ${gRho > 0 ? '+1.0' : '-1.0'}$ (since $\\rho ${rho >= max_d_yrho ? '\\ge' : '<'} \\max(d, \\rho_y)$). Under gradient descent, the proposed update is $\\rho_{\\text{new}} = \\rho - \\eta \\cdot \\frac{dL}{d\\rho} = ${proposedRho.toFixed(4)}$.${crossesInteger ? ` This crosses the integer boundary ${snappedRho}, so the step is intercepted and snapped to $\\rho = ${snappedRho}$ to land exactly on a Type II vertex.` : ''}`;
    
    return {
      isVertex: false,
      rho,
      d,
      loss,
      nextCenter: c,
      nextLogRadius,
      stepType,
      explanation,
      gRho,
      proposedRho,
      crossesInteger,
      snappedRho
    };
  }
}

