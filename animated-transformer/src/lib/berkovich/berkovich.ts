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

export function getValuation(r: Rational, p: bigint): number {
  if (r.num === 0n) return 30; // represents infinity in practice for local visualization
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
  return numVal - denVal;
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
  const v = getValuation(rSim, p);
  
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
    
    curr = simplify({
      num: curr.num - BigInt(digit) * curr.den,
      den: curr.den * p
    });
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
    if (val > 0) {
      digit = 0;
    } else if (val < 0) {
      const startV = val;
      const count = -startV + 1;
      const { startPower, digits } = getPadicDigits(rShift, p, count);
      digit = digits[-startPower] || 0;
    } else {
      const { digits } = getPadicDigits(rShift, p, 1);
      digit = digits[0] || 0;
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
  center: Rational;
  logRadius: number;
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
  p: bigint
): VertexCandidate[] {
  const k = Math.round(rho);
  const candidates: VertexCandidate[] = [];
  const d = -getValuation(subtract(c, y), p);
  
  // Parent candidate
  candidates.push({
    branch: 'parent',
    center: c,
    logRadius: k + 1,
    lossVal: Math.abs((k + 1) - d) + d
  });
  
  // Children candidates
  for (let g = 0; g < Number(p); g++) {
    let shift: Rational;
    if (k >= 0) {
      shift = simplify({ num: BigInt(g), den: p ** BigInt(k) });
    } else {
      shift = simplify({ num: BigInt(g) * (p ** BigInt(-k)), den: 1n });
    }
    const childCenter = add(c, shift);
    const childDiff = subtract(childCenter, y);
    const childVal = getValuation(childDiff, p);
    const childD = -childVal;
    const childLoss = Math.abs((k - 1) - childD) + childD;
    
    candidates.push({
      branch: g.toString(),
      center: childCenter,
      logRadius: k - 1,
      lossVal: childLoss
    });
  }
  return candidates;
}

export function computeContinuousStep(
  rho: number,
  d: number,
  eta: number
): ContinuousStepResult {
  const gRho = rho >= d ? 1 : -1;
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
