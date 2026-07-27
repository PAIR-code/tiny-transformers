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
import { extractPatches } from './mnist-data';

export interface BerkovichDisk {
  center: Rational;
  rho: number;
}

export interface BerkovichMnistConfig {
  prime: number;
  embDim: number;
  numConstraints: number;
  gridSize: number;
  lr: number;
  reg: number;
  regEmbed: number;
  beta: number;
  aggMode: 'min' | 'average';
  encodingMode?: '2adic-binary-search' | 'continuous-intensity';
  encodingDepth?: number;
  poolingMode?: '3x3-local-pooled' | 'grid-patches';
  targetInitMode?: 'pre-fixed-leaves' | 'random';
  repulsionReg?: number;
}

export interface BerkovichMnistForwardResult {
  probs: number[];
  logits: number[];
  activeConstraints: number[];
  activeDims: number[][];
  H: BerkovichDisk[];
  pathLosses: number[][][];
  patchDisks: BerkovichDisk[][];
}

/**
 * Encodes a binary string (read right to left) into a 2-adic binary search rational point.
 * Start at 0.5. Bit 1 -> go higher (+step), Bit 0 -> go lower (-step).
 */
export function encodeBinarySearch2Adic(bits: number[], depth: number = 6): BerkovichDisk {
  let num = 1n;
  let den = 2n;

  for (let i = 0; i < Math.min(bits.length, depth); i++) {
    const bit = bits[i];
    const nextDen = den * 2n;
    if (bit === 1) {
      num = num * 2n + 1n;
    } else {
      num = num * 2n - 1n;
    }
    den = nextDen;
  }

  const center = simplify({ num, den });
  const rho = -Math.min(bits.length, depth);
  return { center, rho };
}

/**
 * Converts a floating intensity in [0, 1] into a bit sequence of length `depth`
 * and performs 2-adic binary search encoding.
 */
export function intensityTo2AdicBinarySearch(val: number, depth: number = 6): BerkovichDisk {
  const bits: number[] = [];
  let current = val;
  for (let i = 0; i < depth; i++) {
    if (current >= 0.5) {
      bits.push(1);
      current = (current - 0.5) * 2;
    } else {
      bits.push(0);
      current = current * 2;
    }
  }
  return encodeBinarySearch2Adic(bits, depth);
}

export class BerkovichAffinoidMnistLearner {
  readonly vocab: string[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  readonly V = 10;
  prime: bigint;
  embDim: number;
  numConstraints: number;
  gridSize: number;
  numPatches: number;

  E: BerkovichDisk[][][];
  W: BerkovichDisk[][][];

  constructor(
    embDim: number = 5,
    prime: number = 2,
    numConstraints: number = 3,
    gridSize: number = 4,
    targetInitMode: 'pre-fixed-leaves' | 'random' = 'random'
  ) {
    this.embDim = embDim;
    this.prime = BigInt(prime);
    this.numConstraints = numConstraints;
    this.gridSize = gridSize;
    this.numPatches = gridSize * gridSize;

    this.E = [];
    this.W = [];

    // Initialize patch embeddings
    const intensityLevels = 5;
    for (let pIdx = 0; pIdx < this.numPatches; pIdx++) {
      const patchLevels: BerkovichDisk[][] = [];
      for (let lvl = 0; lvl < intensityLevels; lvl++) {
        const row: BerkovichDisk[] = [];
        for (let d = 0; d < this.embDim; d++) {
          row.push(this.randomDisk());
        }
        patchLevels.push(row);
      }
      this.E.push(patchLevels);
    }

    // Initialize multi-constraint class target disks (random or pre-fixed leaves)
    for (let k = 0; k < this.V; k++) {
      const classConstraints: BerkovichDisk[][] = [];
      for (let m = 0; m < numConstraints; m++) {
        const row: BerkovichDisk[] = [];
        for (let d = 0; d < this.embDim; d++) {
          if (targetInitMode === 'pre-fixed-leaves') {
            // Spread target centers equally across p-adic tree leaves
            const leafNum = BigInt(k % Number(this.prime));
            const center = simplify({ num: leafNum, den: this.prime });
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

  private randomDisk(): BerkovichDisk {
    const p = this.prime;
    const d0 = BigInt(Math.floor(Math.random() * Number(p)));
    const d1 = BigInt(Math.floor(Math.random() * Number(p)));
    const center = simplify(add({ num: d0, den: 1n }, { num: d1, den: p }));
    const rho = (Math.random() - 0.5) * 1.0;
    return { center, rho };
  }

  forward(pixels: number[], config: BerkovichMnistConfig): BerkovichMnistForwardResult {
    const p = this.prime;
    const { aggMode, beta, numConstraints, gridSize, encodingMode, encodingDepth = 6 } = config;
    const patchMeans = extractPatches(pixels, gridSize);
    const numP = patchMeans.length;

    const patchDisks: BerkovichDisk[][] = [];

    if (encodingMode === '2adic-binary-search') {
      // 2-adic Binary Search Pixel Encoding
      for (let pIdx = 0; pIdx < numP; pIdx++) {
        const row: BerkovichDisk[] = [];
        for (let d = 0; d < this.embDim; d++) {
          const val = patchMeans[pIdx];
          const disk = intensityTo2AdicBinarySearch(val, encodingDepth);
          row.push(disk);
        }
        patchDisks.push(row);
      }
    } else {
      // Quantized patch embeddings lookup
      const patchLevelIndices = patchMeans.map((m) => Math.min(4, Math.floor(m * 5)));
      for (let pIdx = 0; pIdx < numP; pIdx++) {
        const lvl = patchLevelIndices[pIdx];
        patchDisks.push(this.E[pIdx][lvl]);
      }
    }

    // 1. Hierarchical Pooling into Root Hidden Disks H
    const H: BerkovichDisk[] = [];
    for (let d = 0; d < this.embDim; d++) {
      let cSum = { num: 0n, den: 1n };
      let maxRho = -Infinity;

      for (let j = 1; j <= numP; j++) {
        const emb = patchDisks[j - 1][d];
        const cScaled = simplify({ num: emb.center.num, den: emb.center.den * (p ** BigInt(j)) });
        cSum = add(cSum, cScaled);

        const rhoScaled = emb.rho - j;
        if (rhoScaled > maxRho) {
          maxRho = rhoScaled;
        }
      }

      maxRho = Math.max(-3, Math.min(3, maxRho));
      H.push({ center: cSum, rho: maxRho });
    }

    // 2. Class distance evaluation across M constraints (DNF OR-of-ANDs: min_m( max_d PathLoss ))
    const logits: number[] = [];
    const activeConstraints: number[] = [];
    const activeDims: number[][] = [];
    const pathLosses: number[][][] = [];

    for (let k = 0; k < this.V; k++) {
      const classLosses: number[][] = [];
      const classActiveDims: number[] = [];
      const constraintScores: number[] = [];

      for (let m = 0; m < numConstraints; m++) {
        const constraintLosses: number[] = [];

        for (let d = 0; d < this.embDim; d++) {
          const W_kmd = this.W[k][m][d];
          const valDiff = getValuation(subtract(H[d].center, W_kmd.center), p);

          const loss =
            valDiff.type === 'pos-infinity' && W_kmd.rho <= H[d].rho
              ? 0
              : computePathLoss(W_kmd.rho, extNegate(valDiff), H[d].rho);
          constraintLosses.push(loss);
        }
        classLosses.push(constraintLosses);

        let constraintScore = 0;
        let actD = 0;

        if (aggMode === 'min') {
          let maxL = -1;
          for (let d = 0; d < this.embDim; d++) {
            if (constraintLosses[d] > maxL) {
              maxL = constraintLosses[d];
              actD = d;
            }
          }
          constraintScore = maxL;
        } else {
          let sumL = 0;
          for (let d = 0; d < this.embDim; d++) {
            sumL += constraintLosses[d];
          }
          constraintScore = sumL / this.embDim;
          actD = -1;
        }

        constraintScores.push(constraintScore);
        classActiveDims.push(actD);
      }

      pathLosses.push(classLosses);
      activeDims.push(classActiveDims);

      // Logit score is -MINIMUM loss across DNF constraints (OR of AND affinoid domains)
      let minLoss = constraintScores[0];
      let activeM = 0;
      for (let m = 1; m < numConstraints; m++) {
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

    return { probs, logits, activeConstraints, activeDims, H, pathLosses, patchDisks };
  }

  trainStep(
    pixels: number[],
    targetDigit: number,
    config: BerkovichMnistConfig
  ): { loss: number; predDigit: number; forwardResult: BerkovichMnistForwardResult } {
    const p = this.prime;
    const { lr, reg, regEmbed, aggMode, beta, numConstraints, gridSize, repulsionReg = 0.01 } = config;
    const patchMeans = extractPatches(pixels, gridSize);
    const numP = patchMeans.length;
    const patchLevelIndices = patchMeans.map((m) => Math.min(4, Math.floor(m * 5)));

    // 1. Forward
    const fwd = this.forward(pixels, config);
    const loss = -Math.log(fwd.probs[targetDigit] + 1e-15);
    const predDigit = fwd.probs.indexOf(Math.max(...fwd.probs));

    // 2. Logit gradient
    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetDigit ? 1 : 0)));

    // 3. Updates with inter-pool repulsion normalization
    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];
      const activeM = fwd.activeConstraints[k];

      // Radius regularization & inter-pool repulsion penalty
      for (let m = 0; m < numConstraints; m++) {
        for (let d = 0; d < this.embDim; d++) {
          const W = this.W[k][m][d];
          let repulsionGrad = 0;

          if (repulsionReg > 0) {
            // Push pool constraint centers/radii away from other constraints of same class
            for (let mOther = 0; mOther < numConstraints; mOther++) {
              if (mOther !== m) {
                const W_other = this.W[k][mOther][d];
                const distVal = getValuation(subtract(W.center, W_other.center), p);
                const dVal = distVal.type === 'finite' ? distVal.value : 5;
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

      // Update active constraint of class k
      for (let d = 0; d < this.embDim; d++) {
        const isDimActive = aggMode === 'min' ? d === fwd.activeDims[k][activeM] : true;
        if (!isDimActive) continue;

        const weight = aggMode === 'min' ? 1.0 : 1.0 / this.embDim;
        const gk_dim = gk * weight;

        if (k !== targetDigit && fwd.pathLosses[k][activeM][d] > 0) {
          continue;
        }

        const W = this.W[k][activeM][d];
        const H = fwd.H[d];

        if (gk_dim < 0) {
          const details = computeGradientDetails(W.center, W.rho, H.center, H.rho, p, lr * Math.abs(gk_dim));
          W.center = details.nextCenter;
          W.rho = details.nextLogRadius;
        } else if (gk_dim > 0) {
          const valDiff = getValuation(subtract(W.center, H.center), p);
          const dValuation = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
          const sgn = W.rho >= dValuation ? 1 : -1;
          W.rho = Math.max(-3, Math.min(3, W.rho - lr * gk_dim * sgn));
        }

        // Update trainable patch embeddings
        if (config.encodingMode !== '2adic-binary-search') {
          for (let j = 1; j <= numP; j++) {
            const pIdx = j - 1;
            const lvl = patchLevelIndices[pIdx];
            const emb = this.E[pIdx][lvl][d];

            const isEmbActive = Math.abs(emb.rho - j - H.rho) < 1e-7;
            if (!isEmbActive) continue;

            let otherSum = { num: 0n, den: 1n };
            for (let l = 1; l <= numP; l++) {
              if (l !== j) {
                const otherLvl = patchLevelIndices[l - 1];
                const otherEmb = this.E[l - 1][otherLvl][d];
                const term = simplify({
                  num: otherEmb.center.num,
                  den: otherEmb.center.den * (p ** BigInt(l)),
                });
                otherSum = add(otherSum, term);
              }
            }

            const diffCenter = subtract(W.center, otherSum);
            const targetCenter = simplify({
              num: diffCenter.num * (p ** BigInt(j)),
              den: diffCenter.den,
            });
            const targetLogRadius = W.rho + j;

            if (gk_dim < 0) {
              const details = computeGradientDetails(emb.center, emb.rho, targetCenter, targetLogRadius, p, lr * Math.abs(gk_dim));
              emb.center = details.nextCenter;
              emb.rho = details.nextLogRadius;
            } else if (gk_dim > 0) {
              const valDiff = getValuation(subtract(emb.center, targetCenter), p);
              const dValuation = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
              const sgn = emb.rho >= dValuation ? 1 : -1;
              emb.rho = Math.max(-3, Math.min(3, emb.rho - lr * gk_dim * sgn));
            }

            emb.rho = Math.max(
              -3,
              Math.min(3, emb.rho - lr * regEmbed * Math.log(Number(p)) * Math.exp(emb.rho * Math.log(Number(p))))
            );
          }
        }
      }
    }

    return { loss, predDigit, forwardResult: fwd };
  }

  trainBatch(
    samples: { pixels: number[]; digit: number }[],
    config: BerkovichMnistConfig
  ): { loss: number; accuracy: number } {
    const B = samples.length;
    let totalLoss = 0;
    let correctCount = 0;

    for (const sample of samples) {
      const step = this.trainStep(sample.pixels, sample.digit, config);
      totalLoss += step.loss;
      if (step.predDigit === sample.digit) {
        correctCount++;
      }
    }

    return { loss: totalLoss / (B + 1e-15), accuracy: correctCount / (B + 1e-15) };
  }
}
