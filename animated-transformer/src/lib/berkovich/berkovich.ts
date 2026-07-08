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

export interface PrecisionBounds {
  minPower: number;
  maxPower: number;
}

export const DEFAULT_PRECISION: PrecisionBounds = {
  minPower: -2,
  maxPower: 1,
};

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

export function isVertex(rho: number): boolean {
  return Math.abs(rho - Math.round(rho)) < 1e-7;
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

export function formatDigitSequence(
  r: Rational,
  p: bigint,
  precision: PrecisionBounds = DEFAULT_PRECISION
): string {
  const aligned = getAlignedDigits(r, p, precision.minPower, precision.maxPower);
  
  let left = '';
  for (let pow = precision.maxPower; pow >= 0; pow--) {
    const digit = aligned.find(item => item.power === pow)?.digit ?? 0;
    left += digit.toString();
  }
  
  let right = '';
  for (let pow = -1; pow >= precision.minPower; pow--) {
    const digit = aligned.find(item => item.power === pow)?.digit ?? 0;
    right += digit.toString();
  }
  
  return right.length > 0 ? `${left}.${right}` : left;
}

export function parseDigitSequence(
  seq: string,
  p: bigint,
  precision: PrecisionBounds = DEFAULT_PRECISION
): Rational {
  const parts = seq.trim().split('.');
  const leftStr = parts[0] || '';
  const rightStr = parts[1] || '';
  
  const expectedLeftLen = precision.maxPower + 1;
  const expectedRightLen = -precision.minPower;
  
  const paddedLeft = leftStr.length > expectedLeftLen 
    ? leftStr.slice(leftStr.length - expectedLeftLen)
    : leftStr.padStart(expectedLeftLen, '0');
    
  const paddedRight = rightStr.length > expectedRightLen
    ? rightStr.slice(0, expectedRightLen)
    : rightStr.padEnd(expectedRightLen, '0');
  
  const pNum = Number(p);
  let sum = simplify({ num: 0n, den: 1n });
  
  // Left of decimal: powers from maxPower down to 0
  for (let i = 0; i < paddedLeft.length; i++) {
    const digit = Number(paddedLeft[i]);
    if (digit >= pNum) {
      throw new Error(`Digit ${digit} exceeds base ${p}`);
    }
    const power = precision.maxPower - i;
    const term = simplify({ num: BigInt(digit) * (p ** BigInt(power)), den: 1n });
    sum = add(sum, term);
  }
  
  // Right of decimal: powers from -1 down to minPower
  for (let i = 0; i < paddedRight.length; i++) {
    const digit = Number(paddedRight[i]);
    if (digit >= pNum) {
      throw new Error(`Digit ${digit} exceeds base ${p}`);
    }
    const power = -1 - i;
    const term = simplify({ num: BigInt(digit), den: p ** BigInt(-power) });
    sum = add(sum, term);
  }
  
  return simplify(sum);
}
