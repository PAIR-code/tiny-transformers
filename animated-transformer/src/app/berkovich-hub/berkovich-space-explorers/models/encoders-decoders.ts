/* Copyright 2026 Google LLC. All Rights Reserved.
==============================================================================*/

import {
  Rational,
  simplify,
  add,
  subtract,
  getValuation,
  computePathLoss,
  extNegate,
  multiply
} from '../../../../lib/berkovich/berkovich';
import {
  computeGradientDetails
} from '../../../../lib/berkovich/berkovich_gradients';
import { BerkovichDisk, BerkovichConfig } from './berkovich-char-learner';

// ==============================================================================
// ENCODERS
// ==============================================================================

/**
 * Standard Berkovich Embedding Encoder:
 * Maps characters to dynamic, learnable Berkovich disks.
 */
export class BerkovichEmbeddingEncoder {
  E: BerkovichDisk[][];
  readonly V: number;
  readonly embDim: number;
  readonly prime: bigint;

  constructor(vocab: string[], embDim: number, prime: bigint) {
    this.V = vocab.length;
    this.embDim = embDim;
    this.prime = prime;
    this.E = [];
  }

  reset() {
    this.E = [];
    const p = this.prime;
    for (let k = 0; k < this.V; k++) {
      const row: BerkovichDisk[] = [];
      for (let d = 0; d < this.embDim; d++) {
        const d0 = BigInt(Math.floor(Math.random() * Number(p)));
        const d1 = BigInt(Math.floor(Math.random() * Number(p)));
        const center = simplify(add({ num: d0, den: 1n }, { num: d1, den: p }));
        const rho = (Math.random() - 0.5) * 1.0;
        row.push({ center, rho });
      }
      this.E.push(row);
    }
  }

  encode(charIdx: number): BerkovichDisk[] {
    return this.E[charIdx];
  }

  update(
    contextIndices: number[],
    H: BerkovichDisk[],
    W: BerkovichDisk[][],
    gLogits: number[],
    activeDims: number[],
    pathLosses: number[][],
    targetIdx: number,
    config: BerkovichConfig
  ) {
    const p = this.prime;
    const N = contextIndices.length;
    const { lr, regEmbed, aggMode } = config;

    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];

      for (let d = 0; d < this.embDim; d++) {
        const isDimActive = aggMode === 'min' ? (d === activeDims[k]) : true;
        if (!isDimActive) continue;

        const weight = aggMode === 'min' ? 1.0 : (1.0 / this.embDim);
        const gk_dim = gk * weight;

        // Skip if negative class is already outside
        if (k !== targetIdx && pathLosses[k][d] > 0) continue;

        // Update Embedding Weights of context characters
        // Find which character(s) in context were active for H_d (max pooled)
        for (let j = 1; j <= N; j++) {
          const charIdx = contextIndices[j - 1];
          const emb = this.E[charIdx][d];

          const isEmbActive = Math.abs((emb.rho - j) - H[d].rho) < 1e-7;
          if (!isEmbActive) continue;

          // Target center and target log-radius for the active embedding component
          let otherSum = { num: 0n, den: 1n };
          for (let l = 1; l <= N; l++) {
            if (l !== j) {
              const otherEmb = this.E[contextIndices[l - 1]][d];
              const term = simplify({
                num: otherEmb.center.num,
                den: otherEmb.center.den * (p ** BigInt(l))
              });
              otherSum = add(otherSum, term);
            }
          }

          const diffCenter = subtract(W[k][d].center, otherSum);
          const targetCenter = simplify({
            num: diffCenter.num * (p ** BigInt(j)),
            den: diffCenter.den
          });
          const targetLogRadius = W[k][d].rho + j;

          if (gk_dim < 0) {
            // Pull closer
            const details = computeGradientDetails(emb.center, emb.rho, targetCenter, targetLogRadius, p, lr * Math.abs(gk_dim));
            emb.center = details.nextCenter;
            emb.rho = details.nextLogRadius;
          } else if (gk_dim > 0) {
            // Push away
            const valuationDiff = getValuation(subtract(emb.center, targetCenter), p);
            const dValuation = valuationDiff.type === 'finite' ? -valuationDiff.value : -Infinity;
            const sgn = emb.rho >= dValuation ? 1 : -1;
            emb.rho = Math.max(-2, Math.min(2, emb.rho - lr * gk_dim * sgn));
          }

          // Apply embedding log-radius shrinkage regularization
          emb.rho = Math.max(-2, Math.min(2, emb.rho - lr * regEmbed * Math.log(Number(p)) * Math.exp(emb.rho * Math.log(Number(p)))));
        }
      }
    }
  }

  regularize(lr: number, regEmbed: number) {
    const p = this.prime;
    const logP = Math.log(Number(p));
    for (let k = 0; k < this.V; k++) {
      for (let d = 0; d < this.embDim; d++) {
        const emb = this.E[k][d];
        emb.rho = Math.max(-2, Math.min(2, emb.rho - lr * regEmbed * logP * Math.exp(emb.rho * logP)));
      }
    }
  }
}

/**
 * P-Adic Digit Encoder:
 * Maps characters to fixed (non-learnable) base-p digit coordinates in Q_p.
 */
export class PadicDigitEncoder {
  C: Rational[][];
  readonly V: number;
  readonly embDim: number;
  readonly prime: bigint;

  constructor(vocab: string[], embDim: number, prime: bigint) {
    this.V = vocab.length;
    this.embDim = embDim;
    this.prime = prime;
    this.C = [];
  }

  reset() {
    this.C = [];
    for (let k = 0; k < this.V; k++) {
      const cRow: Rational[] = [];
      let val = k;
      for (let d = 0; d < this.embDim; d++) {
        const digit = val % Number(this.prime);
        cRow.push({ num: BigInt(digit), den: 1n });
        val = Math.floor(val / Number(this.prime));
      }
      this.C.push(cRow);
    }
  }

  encode(charIdx: number): Rational[] {
    return this.C[charIdx];
  }
}

/**
 * Euclidean Embedding Encoder:
 * Maps characters to dynamic real-valued vectors.
 */
export class EuclideanEmbeddingEncoder {
  E: number[][];
  readonly V: number;
  readonly embDim: number;

  constructor(vocab: string[], embDim: number) {
    this.V = vocab.length;
    this.embDim = embDim;
    this.E = [];
  }

  reset() {
    this.E = [];
    for (let k = 0; k < this.V; k++) {
      const row = Array.from({ length: this.embDim }, () => (Math.random() - 0.5) * 0.1);
      this.E.push(row);
    }
  }

  encode(charIdx: number): number[] {
    return this.E[charIdx];
  }
}

// ==============================================================================
// DECODERS
// ==============================================================================

/**
 * Standard Berkovich Distance Decoder:
 * Decodes representation H into logits based on negative Hsia distance to target constraints W.
 */
export class BerkovichDistanceDecoder {
  W: BerkovichDisk[][];
  readonly V: number;
  readonly embDim: number;
  readonly prime: bigint;

  constructor(vocab: string[], embDim: number, prime: bigint) {
    this.V = vocab.length;
    this.embDim = embDim;
    this.prime = prime;
    this.W = [];
  }

  reset() {
    this.W = [];
    const p = this.prime;
    for (let k = 0; k < this.V; k++) {
      const row: BerkovichDisk[] = [];
      for (let d = 0; d < this.embDim; d++) {
        const d0 = BigInt(Math.floor(Math.random() * Number(p)));
        const d1 = BigInt(Math.floor(Math.random() * Number(p)));
        const center = simplify(add({ num: d0, den: 1n }, { num: d1, den: p }));
        const rho = (Math.random() - 0.5) * 1.0;
        row.push({ center, rho });
      }
      this.W.push(row);
    }
  }

  decode(H: BerkovichDisk[], config: BerkovichConfig): { logits: number[]; dists: number[][]; pathLosses: number[][]; activeDims: number[] } {
    const p = this.prime;
    const { aggMode } = config;
    const logits: number[] = [];
    const dists: number[][] = [];
    const pathLosses: number[][] = [];
    const activeDims: number[] = [];

    for (let k = 0; k < this.V; k++) {
      const classDists: number[] = [];
      const classLosses: number[] = [];

      for (let d = 0; d < this.embDim; d++) {
        const valDiff = getValuation(subtract(H[d].center, this.W[k][d].center), p);
        const distance = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
        classDists.push(distance);

        const loss = valDiff.type === 'pos-infinity' && this.W[k][d].rho <= H[d].rho
          ? 0
          : computePathLoss(this.W[k][d].rho, extNegate(valDiff), H[d].rho);
        classLosses.push(loss);
      }

      dists.push(classDists);
      pathLosses.push(classLosses);

      let score = 0;
      let actD = 0;

      if (aggMode === 'min') {
        let maxL = -1;
        for (let d = 0; d < this.embDim; d++) {
          if (classLosses[d] > maxL) {
            maxL = classLosses[d];
            actD = d;
          }
        }
        score = -maxL;
      } else {
        let sumL = 0;
        for (let d = 0; d < this.embDim; d++) {
          sumL += classLosses[d];
        }
        score = -sumL / this.embDim;
        actD = -1;
      }

      logits.push(score);
      activeDims.push(actD);
    }

    return { logits, dists, pathLosses, activeDims };
  }

  update(
    H: BerkovichDisk[],
    targetIdx: number,
    gLogits: number[],
    config: BerkovichConfig,
    activeDims: number[]
  ) {
    const p = this.prime;
    const { lr, reg, aggMode } = config;

    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];

      for (let d = 0; d < this.embDim; d++) {
        const isDimActive = aggMode === 'min' ? (d === activeDims[k]) : true;
        if (!isDimActive) continue;

        const weight = aggMode === 'min' ? 1.0 : (1.0 / this.embDim);
        const gk_dim = gk * weight;

        const W_kd = this.W[k][d];

        // Softmax updates
        if (gk_dim < 0) {
          const details = computeGradientDetails(W_kd.center, W_kd.rho, H[d].center, H[d].rho, p, lr * Math.abs(gk_dim));
          W_kd.center = details.nextCenter;
          W_kd.rho = details.nextLogRadius;
        } else if (gk_dim > 0) {
          const valDiff = getValuation(subtract(W_kd.center, H[d].center), p);
          const dValuation = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
          const sgn = W_kd.rho >= dValuation ? 1 : -1;
          W_kd.rho = Math.max(-2, Math.min(2, W_kd.rho - lr * gk_dim * sgn));
        }

        // Apply regularization target shrinkage
        W_kd.rho = Math.max(-2, Math.min(2, W_kd.rho - lr * reg * Math.log(Number(p)) * Math.exp(W_kd.rho * Math.log(Number(p)))));
      }
    }
  }
}

/**
 * Euclidean Dot Product Decoder:
 * Standard Euclidean classification layer (weights and biases).
 */
export class EuclideanDotProductDecoder {
  W: number[][]; // [V, embDim]
  b: number[];   // [V]
  readonly V: number;
  readonly embDim: number;

  constructor(vocab: string[], embDim: number) {
    this.V = vocab.length;
    this.embDim = embDim;
    this.W = [];
    this.b = [];
  }

  reset() {
    this.W = [];
    this.b = Array(this.V).fill(0.0);
    for (let k = 0; k < this.V; k++) {
      const row = Array.from({ length: this.embDim }, () => (Math.random() - 0.5) * 0.1);
      this.W.push(row);
    }
  }

  decode(H: number[]): { logits: number[] } {
    const logits: number[] = [];
    for (let k = 0; k < this.V; k++) {
      let score = this.b[k];
      for (let d = 0; d < this.embDim; d++) {
        score += H[d] * this.W[k][d];
      }
      logits.push(score);
    }
    return { logits };
  }

  update(
    H: number[],
    gLogits: number[],
    lr: number,
    reg: number
  ) {
    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];
      
      // Update bias
      this.b[k] -= lr * gk;

      // Update weights
      for (let d = 0; d < this.embDim; d++) {
        const gradW = gk * H[d] + reg * this.W[k][d];
        this.W[k][d] -= lr * gradW;
      }
    }
  }
}

/**
 * P-Adic Linear Distance Decoder:
 * Decodes representation H (after projection Y) into logits based on negative Hsia distance to target fixed digits C.
 */
export class PadicLinearDecoder {
  C: Rational[][];
  readonly V: number;
  readonly embDim: number;
  readonly prime: bigint;

  constructor(vocab: string[], embDim: number, prime: bigint, C: Rational[][]) {
    this.V = vocab.length;
    this.embDim = embDim;
    this.prime = prime;
    this.C = C;
  }

  decode(Y: BerkovichDisk[], config: BerkovichConfig): { logits: number[]; dists: number[][]; pathLosses: number[][] } {
    const p = this.prime;
    const { aggMode } = config;
    const logits: number[] = [];
    const dists: number[][] = [];
    const pathLosses: number[][] = [];

    for (let k = 0; k < this.V; k++) {
      const targetC = this.C[k];
      const distK: number[] = [];
      const pathLossesK: number[] = [];
      
      let sumLogit = 0;
      let minLogit = Infinity;

      for (let d = 0; d < this.embDim; d++) {
        const yDisk = Y[d];
        const tVal = targetC[d];
        
        const diff = subtract(yDisk.center, tVal);
        const dVal = getValuation(diff, p);
        
        // Hsia distance: max(yDisk.rho, -dValuation)
        let logDist = yDisk.rho;
        if (dVal.type === 'finite') {
          logDist = Math.max(logDist, -dVal.value);
        } else if (dVal.type === 'neg-infinity') {
          logDist = Math.max(logDist, Infinity);
        } else if (dVal.type === 'pos-infinity') {
          logDist = Math.max(logDist, -Infinity);
        }

        const logit = -logDist;
        distK.push(logit);
        
        const loss = computePathLoss(yDisk.rho, dVal, yDisk.rho);
        pathLossesK.push(loss);

        sumLogit += logit;
        if (logit < minLogit) {
          minLogit = logit;
        }
      }

      dists.push(distK);
      pathLosses.push(pathLossesK);

      if (aggMode === 'min') {
        logits.push(minLogit);
      } else {
        logits.push(sumLogit / this.embDim);
      }
    }

    return { logits, dists, pathLosses };
  }
}
