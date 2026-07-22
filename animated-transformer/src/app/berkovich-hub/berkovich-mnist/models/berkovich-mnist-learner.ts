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
  gridSize: number; // 4x4 patches (16) or 7x7 patches (49)
  lr: number;
  reg: number;
  regEmbed: number;
  beta: number;
  aggMode: 'min' | 'average';
}

export interface BerkovichMnistForwardResult {
  probs: number[];
  logits: number[];
  activeConstraints: number[]; // [10] index of constraint achieving max loss for each class
  activeDims: number[][]; // [10, M] active dimension per constraint
  H: BerkovichDisk[]; // [embDim] aggregated hidden representation disk
  pathLosses: number[][][]; // [10, M, embDim]
  patchDisks: BerkovichDisk[][]; // [numPatches, embDim] patch embedding disks
}

export class BerkovichAffinoidMnistLearner {
  readonly vocab: string[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  readonly V = 10;
  prime: bigint;
  embDim: number;
  numConstraints: number;
  gridSize: number;
  numPatches: number;

  // Patch embeddings lookup per intensity level (quantized into 5 levels: 0.0, 0.25, 0.5, 0.75, 1.0) x patch position
  // E[patchIdx][intensityLevel][dim]
  E: BerkovichDisk[][][];
  // Target class affinoid constraints W[classK][constraintM][dim]
  W: BerkovichDisk[][][];

  constructor(
    embDim: number = 5,
    prime: number = 3,
    numConstraints: number = 3,
    gridSize: number = 4
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

    // Initialize multi-constraint class target disks
    for (let k = 0; k < this.V; k++) {
      const classConstraints: BerkovichDisk[][] = [];
      for (let m = 0; m < numConstraints; m++) {
        const row: BerkovichDisk[] = [];
        for (let d = 0; d < this.embDim; d++) {
          row.push(this.randomDisk());
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

  /**
   * Forward pass given a 784-length pixel array.
   */
  forward(pixels: number[], config: BerkovichMnistConfig): BerkovichMnistForwardResult {
    const p = this.prime;
    const { aggMode, beta, numConstraints, gridSize } = config;
    const patchMeans = extractPatches(pixels, gridSize);
    const numP = patchMeans.length;

    // Map patch means to quantized intensity levels (0..4)
    const patchLevelIndices = patchMeans.map((m) => Math.min(4, Math.floor(m * 5)));

    // 1. Context patch embedding aggregation (Tree aggregation with p^(-j) positional shift)
    const H: BerkovichDisk[] = [];
    const patchDisks: BerkovichDisk[][] = [];

    for (let pIdx = 0; pIdx < numP; pIdx++) {
      const lvl = patchLevelIndices[pIdx];
      patchDisks.push(this.E[pIdx][lvl]);
    }

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

      maxRho = Math.max(-2, Math.min(2, maxRho));
      H.push({ center: cSum, rho: maxRho });
    }

    // 2. Class distance evaluation across M constraints
    const logits: number[] = [];
    const activeConstraints: number[] = [];
    const activeDims: number[][] = [];
    const pathLosses: number[][][] = []; // [V, M, embDim]

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

      // Logit score is -MAXIMUM loss across constraints (logical AND affinoid domain)
      let maxLoss = -1;
      let activeM = 0;
      for (let m = 0; m < numConstraints; m++) {
        if (constraintScores[m] > maxLoss) {
          maxLoss = constraintScores[m];
          activeM = m;
        }
      }

      logits.push(-maxLoss);
      activeConstraints.push(activeM);
    }

    // Softmax probabilities
    const maxLogit = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / (sumExps + 1e-15));

    return { probs, logits, activeConstraints, activeDims, H, pathLosses, patchDisks };
  }

  /**
   * Train step on a single MNIST sample.
   */
  trainStep(
    pixels: number[],
    targetDigit: number,
    config: BerkovichMnistConfig
  ): { loss: number; predDigit: number; forwardResult: BerkovichMnistForwardResult } {
    const p = this.prime;
    const { lr, reg, regEmbed, aggMode, beta, numConstraints, gridSize } = config;
    const patchMeans = extractPatches(pixels, gridSize);
    const numP = patchMeans.length;
    const patchLevelIndices = patchMeans.map((m) => Math.min(4, Math.floor(m * 5)));

    // 1. Forward
    const fwd = this.forward(pixels, config);
    const loss = -Math.log(fwd.probs[targetDigit] + 1e-15);
    const predDigit = fwd.probs.indexOf(Math.max(...fwd.probs));

    // 2. Logit gradient: dL / dLogit_k = beta * (pi_k - I[k == targetDigit])
    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetDigit ? 1 : 0)));

    // 3. Geodesic & Subgradient updates
    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];
      const activeM = fwd.activeConstraints[k];

      // Regularize ALL target constraints' radii p^rho (shrinkage)
      for (let m = 0; m < numConstraints; m++) {
        for (let d = 0; d < this.embDim; d++) {
          const W = this.W[k][m][d];
          W.rho = Math.max(
            -2,
            Math.min(2, W.rho - lr * reg * Math.log(Number(p)) * Math.exp(W.rho * Math.log(Number(p))))
          );
        }
      }

      // Update active constraint of class k
      for (let d = 0; d < this.embDim; d++) {
        const isDimActive = aggMode === 'min' ? d === fwd.activeDims[k][activeM] : true;
        if (!isDimActive) continue;

        const weight = aggMode === 'min' ? 1.0 : 1.0 / this.embDim;
        const gk_dim = gk * weight;

        // Skip negative class targets if sample is already outside domain
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
          W.rho = Math.max(-2, Math.min(2, W.rho - lr * gk_dim * sgn));
        }

        // Update patch embeddings contributing to active constraint
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
            emb.rho = Math.max(-2, Math.min(2, emb.rho - lr * gk_dim * sgn));
          }

          emb.rho = Math.max(
            -2,
            Math.min(2, emb.rho - lr * regEmbed * Math.log(Number(p)) * Math.exp(emb.rho * Math.log(Number(p))))
          );
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
