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
  getValuation,
  computePathLoss,
  extNegate
} from '../../../../lib/berkovich/berkovich';
import { computeGradientDetails } from '../../../../lib/berkovich/berkovich_gradients';
import { encodeBinarySearch2Adic, BerkovichDisk } from '../../berkovich-mnist/models/berkovich-mnist-learner';

export interface BooleanSample {
  inputs: number[]; // e.g. [0, 1]
  target: number; // 0 or 1
  label: string; // e.g. "(0, 1) -> 1"
}

export interface BerkovichBooleanConfig {
  prime: number;
  numPools: number; // M = 1..8
  lr: number;
  reg: number;
  beta: number;
  targetInitMode: 'pre-fixed-leaves' | 'random';
  poolInitMode: 'separated-branches' | 'random';
  repulsionReg: number;
  updateTargetCenters?: boolean;
  targetCenterMode?: 'fixed' | 'dynamic' | 'softmax-repulsion';
}

export interface BerkovichBooleanForwardResult {
  probs: number[]; // [2] (Prob 0, Prob 1)
  logits: number[]; // [2]
  activeConstraints: number[]; // [2] active constraint m for class 0 and 1
  pathLosses: number[][][]; // [2, M, numVars]
  pools: BerkovichDisk[][]; // [M, numVars] pooled hidden disks
}

export class BerkovichBooleanLearner {
  numVars: number;
  prime: bigint;
  numPools: number;

  // Target class affinoid constraints W[classK][poolM][varD]
  W: BerkovichDisk[][][];
  // Dynamic pool weights for pooling inputs
  poolWeights: BerkovichDisk[][]; // [M, numVars]

  constructor(
    numVars: number = 2,
    numPools: number = 2,
    prime: number = 2,
    targetInitMode: 'pre-fixed-leaves' | 'random' = 'pre-fixed-leaves',
    poolInitMode: 'separated-branches' | 'random' = 'separated-branches'
  ) {
    this.numVars = numVars;
    this.numPools = numPools;
    this.prime = BigInt(prime);
    this.W = [];
    this.poolWeights = [];

    // Initialize pool weights
    for (let m = 0; m < numPools; m++) {
      const poolRow: BerkovichDisk[] = [];
      for (let d = 0; d < numVars; d++) {
        if (poolInitMode === 'separated-branches') {
          // Pre-initialize pools on hypercube minterm branches of 2-adic tree
          let bit = (m >> d) & 1;
          if (numVars === 3 && numPools === 4) {
            // Balanced corner spread for 4 pools in 3D
            const corners = [
              [0, 0, 0],
              [0, 1, 1],
              [1, 0, 1],
              [1, 1, 0]
            ];
            bit = corners[m % 4][d];
          }
          const num = bit === 0 ? 1n : 3n;
          const center = simplify({ num, den: 4n });
          poolRow.push({ center, rho: -1.0 });
        } else {
          poolRow.push(this.randomDisk());
        }
      }
      this.poolWeights.push(poolRow);
    }

    // Initialize targets for class 0 and class 1
    for (let k = 0; k < 2; k++) {
      const classConstraints: BerkovichDisk[][] = [];
      for (let m = 0; m < numPools; m++) {
        const row: BerkovichDisk[] = [];
        for (let d = 0; d < numVars; d++) {
          if (targetInitMode === 'pre-fixed-leaves') {
            // Class 0 at 0, Class 1 at 1/p
            const num = k === 0 ? 0n : 1n;
            const center = simplify({ num, den: this.prime });
            row.push({ center, rho: -1.0 });
          } else {
            row.push(this.randomDisk());
          }
        }
        classConstraints.push(row);
      }
      this.W.push(classConstraints);
    }
  }

  private randomDisk(depth: number = 4): BerkovichDisk {
    const p = Number(this.prime);
    const maxDen = Math.pow(p, depth);
    const num = BigInt(Math.floor(Math.random() * maxDen));
    const center = simplify({ num, den: BigInt(maxDen) });
    const rho = -1.0 + (Math.random() - 0.5) * 1.5;
    return { center, rho };
  }

  /**
   * Encodes binary input vector (e.g. [0, 1]) into 2-adic Berkovich points.
   */
  encodeInputs(inputs: number[]): BerkovichDisk[] {
    return inputs.map((b) => encodeBinarySearch2Adic([b], 4));
  }

  forward(inputs: number[], config: BerkovichBooleanConfig): BerkovichBooleanForwardResult {
    const p = this.prime;
    const { beta, numPools } = config;
    const inputDisks = this.encodeInputs(inputs);

    // 1. Compute dynamic pools H[m][d]
    const pools: BerkovichDisk[][] = [];
    for (let m = 0; m < numPools; m++) {
      const poolRow: BerkovichDisk[] = [];
      for (let d = 0; d < this.numVars; d++) {
        const x = inputDisks[d];
        const pw = this.poolWeights[m][d];

        const cSum = add(x.center, pw.center);
        const rhoCombined = Math.max(x.rho, pw.rho);
        poolRow.push({ center: cSum, rho: rhoCombined });
      }
      pools.push(poolRow);
    }

    // 2. Compute DNF Affinoid scores: Score_k = -min_m ( max_d PathLoss(H_m, W_{k,m}) )
    const logits: number[] = [];
    const activeConstraints: number[] = [];
    const pathLosses: number[][][] = []; // [2, M, numVars]

    for (let k = 0; k < 2; k++) {
      const classLosses: number[][] = [];
      const constraintScores: number[] = [];

      for (let m = 0; m < numPools; m++) {
        const poolLosses: number[] = [];
        for (let d = 0; d < this.numVars; d++) {
          const W_kmd = this.W[k][m][d];
          const H_md = pools[m][d];
          const valDiff = getValuation(subtract(H_md.center, W_kmd.center), p);

          const loss =
            valDiff.type === 'pos-infinity' && W_kmd.rho <= H_md.rho
              ? 0
              : computePathLoss(W_kmd.rho, extNegate(valDiff), H_md.rho);
          poolLosses.push(loss);
        }
        classLosses.push(poolLosses);

        // Logical AND across dimensions (max path loss)
        const maxLoss = Math.max(...poolLosses);
        constraintScores.push(maxLoss);
      }

      pathLosses.push(classLosses);

      // Logical OR across DNF pools (min path loss)
      let minLoss = constraintScores[0];
      let activeM = 0;
      for (let m = 1; m < numPools; m++) {
        if (constraintScores[m] < minLoss) {
          minLoss = constraintScores[m];
          activeM = m;
        }
      }

      logits.push(-minLoss);
      activeConstraints.push(activeM);
    }

    // Softmax probabilities
    const maxLogit = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / (sumExps + 1e-15));

    return { probs, logits, activeConstraints, pathLosses, pools };
  }

  trainStep(
    inputs: number[],
    target: number,
    config: BerkovichBooleanConfig
  ): { loss: number; pred: number; forwardResult: BerkovichBooleanForwardResult } {
    const p = this.prime;
    const { lr, reg, beta, numPools, repulsionReg } = config;

    const fwd = this.forward(inputs, config);
    const loss = -Math.log(fwd.probs[target] + 1e-15);
    const pred = fwd.probs[1] >= fwd.probs[0] ? 1 : 0;

    // Logit gradients
    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === target ? 1 : 0)));

    for (let k = 0; k < 2; k++) {
      const gk = gLogits[k];
      const activeM = fwd.activeConstraints[k];

      // Radius regularization and pool repulsion penalty
      for (let m = 0; m < numPools; m++) {
        for (let d = 0; d < this.numVars; d++) {
          const W = this.W[k][m][d];
          let repulsionGrad = 0;

          if (repulsionReg > 0) {
            for (let mOther = 0; mOther < numPools; mOther++) {
              if (mOther !== m) {
                const W_other = this.W[k][mOther][d];
                const distVal = getValuation(subtract(W.center, W_other.center), p);
                const dVal = distVal.type === 'finite' ? distVal.value : 4;
                repulsionGrad += Math.exp(-dVal);
              }
            }
          }

          W.rho = Math.max(
            -3,
            Math.min(3, W.rho - lr * (reg + repulsionReg * repulsionGrad) * Math.log(Number(p)) * Math.exp(W.rho * Math.log(Number(p))))
          );
        }
      }

      // Update active pool & target constraint
      const inputDisks = this.encodeInputs(inputs);
      for (let d = 0; d < this.numVars; d++) {
        if (k !== target && fwd.pathLosses[k][activeM][d] > 0) {
          continue;
        }

        const W = this.W[k][activeM][d];
        const H = fwd.pools[activeM][d];
        const x_d = inputDisks[d];

        if (gk < 0) {
          const mode = config.targetCenterMode || (config.updateTargetCenters ? 'dynamic' : 'fixed');
          const shouldUpdateCenter = mode === 'dynamic' || mode === 'softmax-repulsion' || config.targetInitMode === 'random';

          if (shouldUpdateCenter) {
            const details = computeGradientDetails(W.center, W.rho, H.center, H.rho, p, lr * Math.abs(gk));
            let nextC = details.nextCenter;

            if (mode === 'softmax-repulsion') {
              // Apply Softmax Repulsion Normalization pushing W.center away from other pool targets
              let totalWeight = 0;
              for (let mOther = 0; mOther < numPools; mOther++) {
                if (mOther !== activeM) {
                  const W_other = this.W[k][mOther][d];
                  const distVal = getValuation(subtract(W.center, W_other.center), p);
                  const dVal = distVal.type === 'finite' ? distVal.value : 4;
                  totalWeight += Math.exp(-dVal);
                }
              }
              if (totalWeight > 0) {
                const repShift = Math.min(1, Math.round(totalWeight * 2));
                const shiftDen = p ** BigInt(Math.max(1, Math.abs(Math.round(W.rho))));
                nextC = add(nextC, simplify({ num: BigInt(repShift), den: shiftDen }));
              }
            }

            W.center = nextC;
            W.rho = details.nextLogRadius;
          } else {
            const dVal = getValuation(subtract(W.center, H.center), p);
            const val = dVal.type === 'finite' ? -dVal.value : -Infinity;
            const sgn = W.rho >= val ? 1 : -1;
            W.rho = Math.max(-3, Math.min(3, W.rho - lr * Math.abs(gk) * sgn));
          }

          // Target center for pw is W.center - x_d.center
          const targetPwCenter = simplify(subtract(W.center, x_d.center));
          const pw = this.poolWeights[activeM][d];
          const pwDetails = computeGradientDetails(pw.center, pw.rho, targetPwCenter, W.rho, p, lr * Math.abs(gk));
          pw.center = pwDetails.nextCenter;
          pw.rho = pwDetails.nextLogRadius;
        } else if (gk > 0) {
          const valDiff = getValuation(subtract(W.center, H.center), p);
          const dValuation = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
          const sgn = W.rho >= dValuation ? 1 : -1;
          W.rho = Math.max(-3, Math.min(3, W.rho - lr * gk * sgn));
        }
      }
    }

    return { loss, pred, forwardResult: fwd };
  }

  trainBatch(
    samples: BooleanSample[],
    config: BerkovichBooleanConfig
  ): { loss: number; accuracy: number } {
    let totalLoss = 0;
    let correct = 0;

    for (const sample of samples) {
      const res = this.trainStep(sample.inputs, sample.target, config);
      totalLoss += res.loss;
      if (res.pred === sample.target) {
        correct++;
      }
    }

    return {
      loss: totalLoss / (samples.length + 1e-15),
      accuracy: correct / (samples.length + 1e-15)
    };
  }
}

export const PRESET_BOOLEAN_FUNCTIONS: { name: string; numVars: number; truthTable: number[] }[] = [
  { name: 'XOR (x1 ⊕ x2)', numVars: 2, truthTable: [0, 1, 1, 0] },
  { name: 'AND (x1 ∧ x2)', numVars: 2, truthTable: [0, 0, 0, 1] },
  { name: 'OR (x1 ∨ x2)', numVars: 2, truthTable: [0, 1, 1, 1] },
  { name: 'NAND', numVars: 2, truthTable: [1, 1, 1, 0] },
  { name: 'NOR', numVars: 2, truthTable: [1, 0, 0, 0] },
  { name: 'XNOR', numVars: 2, truthTable: [1, 0, 0, 1] },
  { name: '3-Input Parity (XOR3)', numVars: 3, truthTable: [0, 1, 1, 0, 1, 0, 0, 1] },
  { name: '3-Input Majority', numVars: 3, truthTable: [0, 0, 0, 1, 0, 1, 1, 1] }
];

export function buildBooleanDataset(truthTable: number[], numVars: number = 2): BooleanSample[] {
  const numSamples = 1 << numVars;
  const samples: BooleanSample[] = [];

  for (let i = 0; i < numSamples; i++) {
    const inputs: number[] = [];
    for (let d = 0; d < numVars; d++) {
      inputs.push((i >> (numVars - 1 - d)) & 1);
    }
    const target = truthTable[i % truthTable.length];
    const label = `(${inputs.join(', ')}) → ${target}`;
    samples.push({ inputs, target, label });
  }

  return samples;
}
