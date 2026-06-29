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
  computeGradientDetails,
  extNegate,
  GradientDetails
} from '../../../lib/berkovich/berkovich';

export interface BerkovichDisk {
  center: Rational;
  rho: number;
}

export interface BerkovichForwardResult {
  probs: number[];
  logits: number[];
  activeDims: number[];
  H: BerkovichDisk[];
  dists: number[][]; // [V, embDim]
  pathLosses: number[][]; // [V, embDim]
}

export class BerkovichCharLearner {
  readonly V: number;
  readonly embDim: number;
  readonly prime: bigint;
  
  // Weights representation
  embeddings: BerkovichDisk[][]; // [V, embDim]
  constraints: BerkovichDisk[][]; // [V, embDim]

  constructor(prime: number, vocab: string[], embDim: number = 5) {
    this.V = vocab.length;
    this.embDim = embDim;
    this.prime = BigInt(prime);

    this.embeddings = [];
    this.constraints = [];

    // Initialize with small random disks in [-2, 2]
    for (let i = 0; i < this.V; i++) {
      const embRow: BerkovichDisk[] = [];
      const constrRow: BerkovichDisk[] = [];
      for (let d = 0; d < this.embDim; d++) {
        embRow.push(this.randomDisk());
        constrRow.push(this.randomDisk());
      }
      this.embeddings.push(embRow);
      this.constraints.push(constrRow);
    }
  }

  private randomDisk(): BerkovichDisk {
    const p = this.prime;
    // center = d0 + d1/p, where d0, d1 are random digits
    const d0 = BigInt(Math.floor(Math.random() * Number(p)));
    const d1 = BigInt(Math.floor(Math.random() * Number(p)));
    const center = simplify(add({ num: d0, den: 1n }, { num: d1, den: p }));
    // rho in [-0.5, 0.5]
    const rho = (Math.random() - 0.5) * 1.0;
    return { center, rho };
  }

  forward(contextIndices: number[], aggMode: 'min' | 'average', beta: number): BerkovichForwardResult {
    const p = this.prime;
    const N = contextIndices.length;

    // 1. Context embedding aggregation (weighted sum using p^-j scaling)
    const H: BerkovichDisk[] = [];
    for (let d = 0; d < this.embDim; d++) {
      let cSum = { num: 0n, den: 1n };
      let maxRho = -Infinity;

      for (let j = 1; j <= N; j++) {
        const charIdx = contextIndices[j - 1];
        const emb = this.embeddings[charIdx][d];
        
        // c_j * p^-j
        const cScaled = simplify({ num: emb.center.num, den: emb.center.den * (p ** BigInt(j)) });
        cSum = add(cSum, cScaled);

        // rho_j - j
        const rhoScaled = emb.rho - j;
        if (rhoScaled > maxRho) {
          maxRho = rhoScaled;
        }
      }

      // Clamp aggregated rho to [-2, 2]
      maxRho = Math.max(-2, Math.min(2, maxRho));
      H.push({ center: cSum, rho: maxRho });
    }

    // 2. Class distance evaluation and logits calculation
    const logits: number[] = [];
    const activeDims: number[] = [];
    const dists: number[][] = [];
    const pathLosses: number[][] = [];

    for (let k = 0; k < this.V; k++) {
      const classDists: number[] = [];
      const classLosses: number[] = [];
      
      for (let d = 0; d < this.embDim; d++) {
        const valDiff = getValuation(subtract(H[d].center, this.constraints[k][d].center), p);
        const distance = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
        classDists.push(distance);

        const loss = valDiff.type === 'pos-infinity' && this.constraints[k][d].rho <= H[d].rho
          ? 0
          : computePathLoss(this.constraints[k][d].rho, extNegate(valDiff), H[d].rho);
        classLosses.push(loss);
      }

      dists.push(classDists);
      pathLosses.push(classLosses);

      // Logit: neg maximum loss or negated sum depending on mode
      let score = 0;
      let actD = 0;

      if (aggMode === 'min') {
        // score is min(-loss_d) = -max(loss_d)
        let maxL = -1;
        for (let d = 0; d < this.embDim; d++) {
          if (classLosses[d] > maxL) {
            maxL = classLosses[d];
            actD = d;
          }
        }
        score = -maxL;
      } else {
        // Average
        let sumL = 0;
        for (let d = 0; d < this.embDim; d++) {
          sumL += classLosses[d];
        }
        score = -sumL / this.embDim;
        actD = -1; // No single active dimension
      }

      logits.push(score);
      activeDims.push(actD);
    }

    // Softmax
    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / (sumExps + 1e-15));

    return { probs, logits, activeDims, H, dists, pathLosses };
  }

  trainStep(
    contextIndices: number[],
    targetIdx: number,
    lr: number,
    reg: number,
    regEmbed: number,
    aggMode: 'min' | 'average',
    beta: number
  ): { loss: number; predIdx: number; forwardResult: BerkovichForwardResult } {
    const p = this.prime;
    const N = contextIndices.length;

    // 1. Forward Pass
    const fwd = this.forward(contextIndices, aggMode, beta);
    const loss = -Math.log(fwd.probs[targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));

    // 2. Gradients of loss w.r.t logits: g_k = beta * (pi_k - I[k == target])
    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetIdx ? 1 : 0)));

    // 3. Backward Pass & Updates
    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];

      for (let d = 0; d < this.embDim; d++) {
        // Check if dimension is active for class k
        const isDimActive = aggMode === 'min' ? (d === fwd.activeDims[k]) : true;
        if (!isDimActive) continue;

        const weight = aggMode === 'min' ? 1.0 : (1.0 / this.embDim);
        const gk_dim = gk * weight;

        // Skip updating negative class targets if sample is already outside its domain
        if (k !== targetIdx && fwd.pathLosses[k][d] > 0) {
          // Still apply regularizer to target k, d
          const W = this.constraints[k][d];
          W.rho = Math.max(-2, Math.min(2, W.rho - lr * reg * Math.log(Number(p)) * Math.exp(W.rho * Math.log(Number(p)))));
          continue;
        }

        const W = this.constraints[k][d];
        const H = fwd.H[d];

        // 3a. Update Class Target Constraints
        if (gk_dim < 0) {
          // gk_dim < 0 means target class d is being pulled closer to input H
          const details = computeGradientDetails(W.center, W.rho, H.center, H.rho, p, lr * Math.abs(gk_dim));
          W.center = details.nextCenter;
          W.rho = details.nextLogRadius;
        } else if (gk_dim > 0) {
          // Push away (increase distance)
          const valuationDiff = getValuation(subtract(W.center, H.center), p);
          const dValuation = valuationDiff.type === 'finite' ? -valuationDiff.value : -Infinity;
          const sgn = W.rho >= dValuation ? 1 : -1;
          W.rho = Math.max(-2, Math.min(2, W.rho - lr * gk_dim * sgn));
        }

        // Apply target log-radius shrinkage regularization
        W.rho = Math.max(-2, Math.min(2, W.rho - lr * reg * Math.log(Number(p)) * Math.exp(W.rho * Math.log(Number(p)))));

        // 3b. Update Embedding Weights of context characters
        // Find which character(s) in context were active for H_d (max pooled)
        for (let j = 1; j <= N; j++) {
          const charIdx = contextIndices[j - 1];
          const emb = this.embeddings[charIdx][d];

          const isEmbActive = Math.abs((emb.rho - j) - H.rho) < 1e-7;
          if (!isEmbActive) continue;

          // Target center and target log-radius for the active embedding component
          let otherSum = { num: 0n, den: 1n };
          for (let l = 1; l <= N; l++) {
            if (l !== j) {
              const otherEmb = this.embeddings[contextIndices[l - 1]][d];
              const term = simplify({
                num: otherEmb.center.num,
                den: otherEmb.center.den * (p ** BigInt(l))
              });
              otherSum = add(otherSum, term);
            }
          }

          const diffCenter = subtract(W.center, otherSum);
          const targetCenter = simplify({
            num: diffCenter.num * (p ** BigInt(j)),
            den: diffCenter.den
          });
          const targetLogRadius = W.rho + j;

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

    return { loss, predIdx, forwardResult: fwd };
  }

  trainBatch(
    samples: { contextIndices: number[]; targetIdx: number }[],
    lr: number,
    reg: number,
    regEmbed: number,
    aggMode: 'min' | 'average',
    beta: number
  ): { loss: number; accuracy: number } {
    const B = samples.length;
    let totalLoss = 0;
    let correctCount = 0;

    for (const sample of samples) {
      const step = this.trainStep(sample.contextIndices, sample.targetIdx, lr, reg, regEmbed, aggMode, beta);
      totalLoss += step.loss;
      if (step.predIdx === sample.targetIdx) {
        correctCount++;
      }
    }

    return { loss: totalLoss / (B + 1e-15), accuracy: correctCount / (B + 1e-15) };
  }
}

export interface EuclideanForwardResult {
  probs: number[];
  logits: number[];
  H: number[];
}

export class EuclideanCharLearner {
  readonly V: number;
  readonly embDim: number;

  embeddings: number[][]; // [V, embDim]
  weights: number[][];    // [V, embDim]
  biases: number[];       // [V]

  constructor(vocab: string[], embDim: number = 5) {
    this.V = vocab.length;
    this.embDim = embDim;

    this.embeddings = [];
    this.weights = [];
    this.biases = [];

    // Xavier/Glorot-like initialization
    const scale = Math.sqrt(2.0 / embDim);
    for (let i = 0; i < this.V; i++) {
      const embRow: number[] = [];
      const weightRow: number[] = [];
      for (let d = 0; d < this.embDim; d++) {
        embRow.push((Math.random() - 0.5) * scale);
        weightRow.push((Math.random() - 0.5) * scale);
      }
      this.embeddings.push(embRow);
      this.weights.push(weightRow);
      this.biases.push(0.0);
    }
  }

  forward(contextIndices: number[]): EuclideanForwardResult {
    const N = contextIndices.length;

    // 1. Aggregation (mean pooling)
    const H: number[] = Array(this.embDim).fill(0.0);
    for (let d = 0; d < this.embDim; d++) {
      let sum = 0;
      for (let j = 0; j < N; j++) {
        sum += this.embeddings[contextIndices[j]][d];
      }
      H[d] = sum / (N + 1e-15);
    }

    // 2. Linear logits
    const logits: number[] = [];
    for (let k = 0; k < this.V; k++) {
      let score = this.biases[k];
      for (let d = 0; d < this.embDim; d++) {
        score += H[d] * this.weights[k][d];
      }
      logits.push(score);
    }

    // 3. Softmax
    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / (sumExps + 1e-15));

    return { probs, logits, H };
  }

  trainStep(
    contextIndices: number[],
    targetIdx: number,
    lr: number,
    reg: number
  ): { loss: number; predIdx: number; forwardResult: EuclideanForwardResult } {
    const N = contextIndices.length;

    // 1. Forward Pass
    const fwd = this.forward(contextIndices);
    const loss = -Math.log(fwd.probs[targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));

    // 2. Gradients w.r.t logits: g_k = pi_k - I[k == target]
    const gLogits = fwd.probs.map((pi, k) => pi - (k === targetIdx ? 1 : 0));

    // 3. Gradients w.r.t weights, biases, and H
    const dW: number[][] = [];
    const db: number[] = [...gLogits];
    const dH: number[] = Array(this.embDim).fill(0.0);

    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];
      const dWRow: number[] = [];
      for (let d = 0; d < this.embDim; d++) {
        // dL/dw = g_k * H_d + reg * w_k,d
        dWRow.push(gk * fwd.H[d] + reg * this.weights[k][d]);
        // dL/dH_d = sum_k g_k * w_k,d
        dH[d] += gk * this.weights[k][d];
      }
      dW.push(dWRow);
    }

    // Gradient w.r.t embeddings (due to mean pooling, dL/demb = dL/dH * 1/N)
    const dEmb: number[] = dH.map(val => val / (N + 1e-15));

    // 4. Update Weights
    for (let k = 0; k < this.V; k++) {
      this.biases[k] -= lr * db[k];
      for (let d = 0; d < this.embDim; d++) {
        this.weights[k][d] -= lr * dW[k][d];
      }
    }

    for (let j = 0; j < N; j++) {
      const charIdx = contextIndices[j];
      for (let d = 0; d < this.embDim; d++) {
        // emb = emb - lr * (dEmb_d + reg * emb)
        this.embeddings[charIdx][d] -= lr * (dEmb[d] + reg * this.embeddings[charIdx][d]);
      }
    }

    return { loss, predIdx, forwardResult: fwd };
  }

  trainBatch(
    samples: { contextIndices: number[]; targetIdx: number }[],
    lr: number,
    reg: number
  ): { loss: number; accuracy: number } {
    const B = samples.length;
    let totalLoss = 0;
    let correctCount = 0;

    // Accumulators for gradients
    const accumDW = Array.from({ length: this.V }, () => Array(this.embDim).fill(0.0));
    const accumDb = Array(this.V).fill(0.0);
    const accumDEmb = Array.from({ length: this.V }, () => Array(this.embDim).fill(0.0));
    const embCounts = Array(this.V).fill(0);

    for (const sample of samples) {
      const N = sample.contextIndices.length;
      const fwd = this.forward(sample.contextIndices);
      const loss = -Math.log(fwd.probs[sample.targetIdx] + 1e-15);
      totalLoss += loss;
      const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
      if (predIdx === sample.targetIdx) correctCount++;

      const gLogits = fwd.probs.map((pi, k) => pi - (k === sample.targetIdx ? 1 : 0));

      for (let k = 0; k < this.V; k++) {
        const gk = gLogits[k];
        accumDb[k] += gk;
        for (let d = 0; d < this.embDim; d++) {
          accumDW[k][d] += gk * fwd.H[d];
        }
      }

      // Backprop to embeddings
      const dH = Array(this.embDim).fill(0.0);
      for (let k = 0; k < this.V; k++) {
        const gk = gLogits[k];
        for (let d = 0; d < this.embDim; d++) {
          dH[d] += gk * this.weights[k][d];
        }
      }

      for (let j = 0; j < N; j++) {
        const charIdx = sample.contextIndices[j];
        embCounts[charIdx]++;
        for (let d = 0; d < this.embDim; d++) {
          accumDEmb[charIdx][d] += dH[d] / (N + 1e-15);
        }
      }
    }

    // Apply accumulated gradients (averaged by B)
    for (let k = 0; k < this.V; k++) {
      this.biases[k] -= lr * (accumDb[k] / B);
      for (let d = 0; d < this.embDim; d++) {
        this.weights[k][d] -= lr * (accumDW[k][d] / B + reg * this.weights[k][d]);
      }
    }

    for (let charIdx = 0; charIdx < this.V; charIdx++) {
      if (embCounts[charIdx] > 0) {
        for (let d = 0; d < this.embDim; d++) {
          const grad = accumDEmb[charIdx][d] / B;
          this.embeddings[charIdx][d] -= lr * (grad + reg * this.embeddings[charIdx][d]);
        }
      }
    }

    return { loss: totalLoss / (B + 1e-15), accuracy: correctCount / (B + 1e-15) };
  }
}
