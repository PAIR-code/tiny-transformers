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

import {
  Rational,
  simplify,
  add,
  subtract,
  multiply,
  getValuation,
  computePathLoss,
  extNegate,
  parsePadicOrRationalInput,
  formatDigitSequence,
  formatRational,
  DEFAULT_PRECISION,
  PrecisionBounds
} from '../../../../lib/berkovich/berkovich';
import { computeGradientDetails } from '../../../../lib/berkovich/berkovich_gradients';
import { BerkovichDisk } from '../../berkovich-mnist/models/berkovich-mnist-learner';

export interface BooleanSample {
  inputs: [number, number]; // [x1, x2]
  target: number; // 0 or 1
  label: string; // e.g. "(0, 1) -> 1"
}

export interface BBool2FunctionInfo {
  index: number;
  name: string;
  symbol: string;
  expression: string;
  truthTable: [number, number, number, number]; // [y(0,0), y(0,1), y(1,0), y(1,1)]
  description: string;
  exactCoefficients: { b: number; w1: number; w2: number; w3: number };
}

/**
 * All 16 two-variable Boolean functions indexed by their truth table binary value.
 * Standard input ordering: [ (0,0), (0,1), (1,0), (1,1) ]
 *
 * For any function g: {0, 1}^2 -> {0, 1}, its multilinear polynomial expansion is:
 *   f(x1, x2) = b + w1*x1 + w2*x2 + w3*x1*x2
 * where:
 *   b  = g(0,0)
 *   w1 = g(1,0) - g(0,0)
 *   w2 = g(0,1) - g(0,0)
 *   w3 = g(1,1) - g(1,0) - g(0,1) + g(0,0)
 */
export const ALL_16_BOOLEAN_FUNCTIONS: BBool2FunctionInfo[] = [
  {
    index: 0,
    name: 'Constant 0 (False)',
    symbol: '0',
    expression: '0',
    truthTable: [0, 0, 0, 0],
    description: 'Always outputs 0 regardless of inputs.',
    exactCoefficients: { b: 0, w1: 0, w2: 0, w3: 0 }
  },
  {
    index: 1,
    name: 'NOR (¬(x₁ ∨ x₂))',
    symbol: 'NOR',
    expression: '¬(x₁ ∨ x₂)',
    truthTable: [1, 0, 0, 0],
    description: 'Outputs 1 only when both x₁=0 and x₂=0.',
    exactCoefficients: { b: 1, w1: -1, w2: -1, w3: 1 }
  },
  {
    index: 2,
    name: 'x₁ AND NOT x₂',
    symbol: 'x₁ ∧ ¬x₂',
    expression: 'x₁ ∧ ¬x₂',
    truthTable: [0, 0, 1, 0],
    description: 'Material non-implication (x₁ ↛ x₂): True only when x₁=1 and x₂=0.',
    exactCoefficients: { b: 0, w1: 1, w2: 0, w3: -1 }
  },
  {
    index: 3,
    name: 'NOT x₂',
    symbol: '¬x₂',
    expression: '¬x₂',
    truthTable: [1, 0, 1, 0],
    description: 'Inversion of x₂; ignores x₁.',
    exactCoefficients: { b: 1, w1: 0, w2: -1, w3: 0 }
  },
  {
    index: 4,
    name: 'NOT x₁ AND x₂',
    symbol: '¬x₁ ∧ x₂',
    expression: '¬x₁ ∧ x₂',
    truthTable: [0, 1, 0, 0],
    description: 'Converse non-implication: True only when x₁=0 and x₂=1.',
    exactCoefficients: { b: 0, w1: 0, w2: 1, w3: -1 }
  },
  {
    index: 5,
    name: 'NOT x₁',
    symbol: '¬x₁',
    expression: '¬x₁',
    truthTable: [1, 1, 0, 0],
    description: 'Inversion of x₁; ignores x₂.',
    exactCoefficients: { b: 1, w1: -1, w2: 0, w3: 0 }
  },
  {
    index: 6,
    name: 'XOR (x₁ ⊕ x₂)',
    symbol: 'XOR',
    expression: 'x₁ ⊕ x₂',
    truthTable: [0, 1, 1, 0],
    description: 'Exclusive OR: True when exactly one input is 1. Requires non-linear term w₃ = -2.',
    exactCoefficients: { b: 0, w1: 1, w2: 1, w3: -2 }
  },
  {
    index: 7,
    name: 'NAND (¬(x₁ ∧ x₂))',
    symbol: 'NAND',
    expression: '¬(x₁ ∧ x₂)',
    truthTable: [1, 1, 1, 0],
    description: 'Universal Sheffer stroke: False only when both x₁=1 and x₂=1.',
    exactCoefficients: { b: 1, w1: 0, w2: 0, w3: -1 }
  },
  {
    index: 8,
    name: 'AND (x₁ ∧ x₂)',
    symbol: 'AND',
    expression: 'x₁ ∧ x₂',
    truthTable: [0, 0, 0, 1],
    description: 'Logical conjunction: True only when both x₁=1 and x₂=1.',
    exactCoefficients: { b: 0, w1: 0, w2: 0, w3: 1 }
  },
  {
    index: 9,
    name: 'XNOR (x₁ ⊙ x₂)',
    symbol: 'XNOR',
    expression: 'x₁ ↔ x₂',
    truthTable: [1, 0, 0, 1],
    description: 'Equivalence / Bi-conditional: True when x₁ and x₂ are identical.',
    exactCoefficients: { b: 1, w1: -1, w2: -1, w3: 2 }
  },
  {
    index: 10,
    name: 'x₁ (Identity x₁)',
    symbol: 'x₁',
    expression: 'x₁',
    truthTable: [0, 0, 1, 1],
    description: 'Pass-through projection of x₁; ignores x₂.',
    exactCoefficients: { b: 0, w1: 1, w2: 0, w3: 0 }
  },
  {
    index: 11,
    name: 'x₁ OR NOT x₂',
    symbol: 'x₁ ∨ ¬x₂',
    expression: 'x₂ → x₁',
    truthTable: [1, 0, 1, 1],
    description: 'Converse implication (x₂ → x₁): False only when x₁=0 and x₂=1.',
    exactCoefficients: { b: 1, w1: 0, w2: -1, w3: 1 }
  },
  {
    index: 12,
    name: 'x₂ (Identity x₂)',
    symbol: 'x₂',
    expression: 'x₂',
    truthTable: [0, 1, 0, 1],
    description: 'Pass-through projection of x₂; ignores x₁.',
    exactCoefficients: { b: 0, w1: 0, w2: 1, w3: 0 }
  },
  {
    index: 13,
    name: 'NOT x₁ OR x₂',
    symbol: '¬x₁ ∨ x₂',
    expression: 'x₁ → x₂',
    truthTable: [1, 1, 0, 1],
    description: 'Material implication (x₁ → x₂): False only when x₁=1 and x₂=0.',
    exactCoefficients: { b: 1, w1: -1, w2: 0, w3: 1 }
  },
  {
    index: 14,
    name: 'OR (x₁ ∨ x₂)',
    symbol: 'OR',
    expression: 'x₁ ∨ x₂',
    truthTable: [0, 1, 1, 1],
    description: 'Logical disjunction: True when at least one of x₁ or x₂ is 1.',
    exactCoefficients: { b: 0, w1: 1, w2: 1, w3: -1 }
  },
  {
    index: 15,
    name: 'Constant 1 (True)',
    symbol: '1',
    expression: '1',
    truthTable: [1, 1, 1, 1],
    description: 'Always outputs 1 regardless of inputs.',
    exactCoefficients: { b: 1, w1: 0, w2: 0, w3: 0 }
  }
];

export function computeExactCoefficients(truthTable: [number, number, number, number]) {
  const [y00, y01, y10, y11] = truthTable;
  const b = y00;
  const w1 = y10 - y00;
  const w2 = y01 - y00;
  const w3 = y11 - y10 - y01 + y00;
  return { b, w1, w2, w3 };
}

export interface BBool2Config {
  prime: number;
  lr: number;
  reg: number;
  beta: number;
  digitsLeft: number;
  digitsRight: number;
  mode: 'berkovich' | 'padic'; // Berkovich disks vs pure p-adic points
  updateCenters: boolean;
  updateRadii: boolean;
}

export interface IntermediateComputationTree {
  // Input nodes
  x1: BerkovichDisk;
  x2: BerkovichDisk;
  // Parameters
  b: BerkovichDisk;
  w1: BerkovichDisk;
  w2: BerkovichDisk;
  w3: BerkovichDisk;
  // Product of inputs
  p12_x1x2: BerkovichDisk;
  // Scaled terms
  t0_b: BerkovichDisk;
  t1_w1x1: BerkovichDisk;
  t2_w2x2: BerkovichDisk;
  t3_w3x1x2: BerkovichDisk;
  // Sum combinations
  s12_w1x1_plus_w2x2: BerkovichDisk;
  s012_b_plus_s12: BerkovichDisk;
  f_out: BerkovichDisk;
  // Target & Loss
  targetDisk: BerkovichDisk;
  loss0: number;
  loss1: number;
  probs: [number, number];
  pred: number;
  loss: number;
}

export interface BBool2ForwardResult {
  inputs: [number, number];
  target: number;
  tree: IntermediateComputationTree;
  f_out: BerkovichDisk;
  probs: [number, number];
  pred: number;
  loss: number;
}

export class BBool2Learner {
  prime: bigint;

  // Trainable parameters
  b: BerkovichDisk;
  w1: BerkovichDisk;
  w2: BerkovichDisk;
  w3: BerkovichDisk;

  constructor(
    prime: number = 2,
    initMode: 'exact-xor' | 'zero' | 'random' | 'linear' = 'random'
  ) {
    this.prime = BigInt(prime);
    this.b = { center: { num: 0n, den: 1n }, rho: -1.0 };
    this.w1 = { center: { num: 0n, den: 1n }, rho: -1.0 };
    this.w2 = { center: { num: 0n, den: 1n }, rho: -1.0 };
    this.w3 = { center: { num: 0n, den: 1n }, rho: -1.0 };

    if (initMode === 'exact-xor') {
      this.setFromCoefficients(0, 1, 1, -2);
    } else if (initMode === 'zero') {
      this.setFromCoefficients(0, 0, 0, 0);
    } else if (initMode === 'linear') {
      this.setFromCoefficients(0, 1, 1, 0);
    } else {
      this.randomize(prime);
    }
  }

  setFromCoefficients(b: number, w1: number, w2: number, w3: number, rho: number = -1.0) {
    this.b = { center: simplify({ num: BigInt(b), den: 1n }), rho };
    this.w1 = { center: simplify({ num: BigInt(w1), den: 1n }), rho };
    this.w2 = { center: simplify({ num: BigInt(w2), den: 1n }), rho };
    this.w3 = { center: simplify({ num: BigInt(w3), den: 1n }), rho };
  }

  setExactSolutionForTruthTable(truthTable: [number, number, number, number], rho: number = -1.0) {
    const coeffs = computeExactCoefficients(truthTable);
    this.setFromCoefficients(coeffs.b, coeffs.w1, coeffs.w2, coeffs.w3, rho);
  }

  setAllRho(rho: number) {
    this.b.rho = rho;
    this.w1.rho = rho;
    this.w2.rho = rho;
    this.w3.rho = rho;
  }

  randomizeAllRho(minRho: number = -2.0, maxRho: number = 1.0) {
    this.b.rho = Number((minRho + Math.random() * (maxRho - minRho)).toFixed(2));
    this.w1.rho = Number((minRho + Math.random() * (maxRho - minRho)).toFixed(2));
    this.w2.rho = Number((minRho + Math.random() * (maxRho - minRho)).toFixed(2));
    this.w3.rho = Number((minRho + Math.random() * (maxRho - minRho)).toFixed(2));
  }

  randomize(prime: number = 2, depth: number = 3, baseRho: number = -1.0) {
    this.prime = BigInt(prime);
    this.b = this.randomDisk(depth, baseRho);
    this.w1 = this.randomDisk(depth, baseRho);
    this.w2 = this.randomDisk(depth, baseRho);
    this.w3 = this.randomDisk(depth, baseRho);
  }

  private randomDisk(depth: number = 3, baseRho: number = -1.0): BerkovichDisk {
    const p = Number(this.prime);
    const maxVal = Math.pow(p, depth);
    // Random integer between -maxVal and maxVal
    const val = Math.floor(Math.random() * (2 * maxVal + 1)) - maxVal;
    const center = simplify({ num: BigInt(val), den: 1n });
    const rho = baseRho + (Math.random() - 0.5) * 0.4;
    return { center, rho };
  }

  /**
   * Encodes scalar input x into a Berkovich disk in B(Q_p).
   * For binary inputs 0 and 1, encodes as leaf points (0, rhoLeaf) and (1, rhoLeaf).
   */
  encodeInput(val: number, precisionBounds?: PrecisionBounds): BerkovichDisk {
    const rhoLeaf = precisionBounds ? precisionBounds.minPower : -2.0;
    const center = simplify({ num: BigInt(Math.round(val)), den: 1n });
    return { center, rho: rhoLeaf };
  }

  /**
   * Berkovich multiplication of two disks: (c1, rho1) * (c2, rho2)
   */
  multiplyDisks(d1: BerkovichDisk, d2: BerkovichDisk): BerkovichDisk {
    const p = this.prime;
    const prodCenter = multiply(d1.center, d2.center);

    const val1 = getValuation(d1.center, p);
    const val2 = getValuation(d2.center, p);
    const logNorm1 = val1.type === 'finite' ? -val1.value : -Infinity;
    const logNorm2 = val2.type === 'finite' ? -val2.value : -Infinity;

    const t1 = logNorm2 + d1.rho;
    const t2 = logNorm1 + d2.rho;
    const t3 = d1.rho + d2.rho;
    const prodRho = Math.max(t1, t2, t3);

    return { center: prodCenter, rho: prodRho };
  }

  /**
   * Berkovich addition of two disks: (c1, rho1) + (c2, rho2)
   */
  addDisks(d1: BerkovichDisk, d2: BerkovichDisk): BerkovichDisk {
    const sumCenter = add(d1.center, d2.center);
    const sumRho = Math.max(d1.rho, d2.rho);
    return { center: sumCenter, rho: sumRho };
  }

  /**
   * Computes the full computation tree and model output for inputs [x1, x2].
   */
  forward(
    inputs: [number, number],
    config: BBool2Config,
    target: number = 0
  ): BBool2ForwardResult {
    const p = this.prime;
    const [x1_val, x2_val] = inputs;
    const precisionBounds: PrecisionBounds = {
      minPower: -config.digitsRight,
      maxPower: config.digitsLeft - 1
    };

    // 1. Encode Inputs
    const x1_disk = this.encodeInput(x1_val, precisionBounds);
    const x2_disk = this.encodeInput(x2_val, precisionBounds);

    // 2. Product of inputs: P12 = x1 * x2
    const p12_x1x2 = this.multiplyDisks(x1_disk, x2_disk);

    // 3. Scaled terms
    const t0_b = { center: this.b.center, rho: this.b.rho };
    const t1_w1x1 = this.multiplyDisks(this.w1, x1_disk);
    const t2_w2x2 = this.multiplyDisks(this.w2, x2_disk);
    const t3_w3x1x2 = this.multiplyDisks(this.w3, p12_x1x2);

    // 4. Summation tree
    const s12_w1x1_plus_w2x2 = this.addDisks(t1_w1x1, t2_w2x2);
    const s012_b_plus_s12 = this.addDisks(t0_b, s12_w1x1_plus_w2x2);
    const f_out = this.addDisks(s012_b_plus_s12, t3_w3x1x2);

    // 5. Target comparison & Loss
    const y_rho = precisionBounds.minPower;
    const target0: Rational = { num: 0n, den: 1n };
    const target1: Rational = { num: 1n, den: 1n };

    const diff0 = subtract(f_out.center, target0);
    const diff1 = subtract(f_out.center, target1);

    const valDiff0 = getValuation(diff0, p);
    const valDiff1 = getValuation(diff1, p);

    const loss0 = valDiff0.type === 'pos-infinity' && f_out.rho <= y_rho
      ? 0
      : computePathLoss(f_out.rho, extNegate(valDiff0), y_rho);

    const loss1 = valDiff1.type === 'pos-infinity' && f_out.rho <= y_rho
      ? 0
      : computePathLoss(f_out.rho, extNegate(valDiff1), y_rho);

    // Softmax probabilities
    const beta = config.beta;
    const logit0 = -loss0;
    const logit1 = -loss1;
    const maxLogit = Math.max(logit0, logit1);

    const exp0 = Math.exp(beta * (logit0 - maxLogit));
    const exp1 = Math.exp(beta * (logit1 - maxLogit));
    const sumExp = exp0 + exp1 + 1e-15;

    const prob0 = exp0 / sumExp;
    const prob1 = exp1 / sumExp;
    const probs: [number, number] = [prob0, prob1];

    const pred = prob1 >= prob0 ? 1 : 0;
    const loss = target === 1 ? -Math.log(prob1 + 1e-15) : -Math.log(prob0 + 1e-15);

    const targetCenter = target === 1 ? target1 : target0;
    const targetDisk: BerkovichDisk = { center: targetCenter, rho: y_rho };

    const tree: IntermediateComputationTree = {
      x1: x1_disk,
      x2: x2_disk,
      b: this.b,
      w1: this.w1,
      w2: this.w2,
      w3: this.w3,
      p12_x1x2,
      t0_b,
      t1_w1x1,
      t2_w2x2,
      t3_w3x1x2,
      s12_w1x1_plus_w2x2,
      s012_b_plus_s12,
      f_out,
      targetDisk,
      loss0,
      loss1,
      probs,
      pred,
      loss
    };

    return {
      inputs,
      target,
      tree,
      f_out,
      probs,
      pred,
      loss
    };
  }

  /**
   * Performs one training step on sample [x1, x2] with target y.
   */
  trainStep(
    inputs: [number, number],
    target: number,
    config: BBool2Config
  ): BBool2ForwardResult {
    const fwd = this.forward(inputs, config, target);
    const p = this.prime;
    const { lr, reg, beta, updateCenters, updateRadii } = config;
    const [x1_val, x2_val] = inputs;

    // Logit gradients
    // dLoss / dLogit_k = prob_k - (k == target ? 1 : 0)
    const g0 = beta * (fwd.probs[0] - (target === 0 ? 1 : 0));
    const g1 = beta * (fwd.probs[1] - (target === 1 ? 1 : 0));

    // Desired output direction in Q_p: target value y (0 or 1)
    const targetRational = target === 1 ? { num: 1n, den: 1n } : { num: 0n, den: 1n };
    const stepScale = lr * (target === 1 ? Math.abs(g1) : Math.abs(g0));

    if (stepScale > 1e-6) {
      const effLr = Math.max(0.25, lr * (target === 1 ? Math.abs(g1) : Math.abs(g0)));

      // Count active contributing parameters for this sample to distribute step
      const isX1 = x1_val > 0.5;
      const isX2 = x2_val > 0.5;
      const isX1X2 = isX1 && isX2;
      const numActive = 1 + (isX1 ? 1 : 0) + (isX2 ? 1 : 0) + (isX1X2 ? 1 : 0);
      const paramLr = effLr / numActive;

      // 1. Bias b is active for ALL samples because d(f)/db = 1
      if (updateCenters || updateRadii) {
        let otherTerms: Rational = { num: 0n, den: 1n };
        if (isX1) otherTerms = add(otherTerms, this.w1.center);
        if (isX2) otherTerms = add(otherTerms, this.w2.center);
        if (isX1X2) otherTerms = add(otherTerms, this.w3.center);
        const targetB = subtract(targetRational, otherTerms);

        const detailsB = computeGradientDetails(this.b.center, this.b.rho, targetB, -2, p, paramLr);
        if (updateCenters) this.b.center = detailsB.nextCenter;
        if (updateRadii) this.b.rho = Math.max(-4, Math.min(2, detailsB.nextLogRadius - lr * reg));
      }

      // 2. Weight w1 is active whenever x1 = 1 (d(f)/dw1 = x1)
      if (isX1) {
        if (updateCenters || updateRadii) {
          let otherTerms: Rational = this.b.center;
          if (isX2) {
            otherTerms = add(add(otherTerms, this.w2.center), this.w3.center);
          }
          const targetW1 = subtract(targetRational, otherTerms);
          const detailsW1 = computeGradientDetails(this.w1.center, this.w1.rho, targetW1, -2, p, paramLr);
          if (updateCenters) this.w1.center = detailsW1.nextCenter;
          if (updateRadii) this.w1.rho = Math.max(-4, Math.min(2, detailsW1.nextLogRadius - lr * reg));
        }
      }

      // 3. Weight w2 is active whenever x2 = 1 (d(f)/dw2 = x2)
      if (isX2) {
        if (updateCenters || updateRadii) {
          let otherTerms: Rational = this.b.center;
          if (isX1) {
            otherTerms = add(add(otherTerms, this.w1.center), this.w3.center);
          }
          const targetW2 = subtract(targetRational, otherTerms);
          const detailsW2 = computeGradientDetails(this.w2.center, this.w2.rho, targetW2, -2, p, paramLr);
          if (updateCenters) this.w2.center = detailsW2.nextCenter;
          if (updateRadii) this.w2.rho = Math.max(-4, Math.min(2, detailsW2.nextLogRadius - lr * reg));
        }
      }

      // 4. Weight w3 is active whenever x1 = 1 AND x2 = 1 (d(f)/dw3 = x1*x2)
      if (isX1X2) {
        if (updateCenters || updateRadii) {
          const sumLinear = add(add(this.b.center, this.w1.center), this.w2.center);
          const targetW3 = subtract(targetRational, sumLinear);
          const detailsW3 = computeGradientDetails(this.w3.center, this.w3.rho, targetW3, -2, p, paramLr);
          if (updateCenters) this.w3.center = detailsW3.nextCenter;
          if (updateRadii) this.w3.rho = Math.max(-4, Math.min(2, detailsW3.nextLogRadius - lr * reg));
        }
      }
    }

    return fwd;
  }

  /**
   * Trains on a full dataset epoch of 4 samples.
   */
  trainBatch(
    samples: BooleanSample[],
    config: BBool2Config
  ): { loss: number; accuracy: number; results: BBool2ForwardResult[] } {
    let totalLoss = 0;
    let correct = 0;
    const results: BBool2ForwardResult[] = [];

    for (const sample of samples) {
      const res = this.trainStep(sample.inputs, sample.target, config);
      totalLoss += res.loss;
      if (res.pred === sample.target) {
        correct++;
      }
      results.push(res);
    }

    return {
      loss: totalLoss / (samples.length + 1e-15),
      accuracy: correct / (samples.length + 1e-15),
      results
    };
  }
}

export function buildDatasetFromTruthTable(truthTable: [number, number, number, number]): BooleanSample[] {
  const inputsList: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1]
  ];

  return inputsList.map((inputs, idx) => {
    const target = truthTable[idx];
    const label = `(${inputs.join(', ')}) → ${target}`;
    return { inputs, target, label };
  });
}
