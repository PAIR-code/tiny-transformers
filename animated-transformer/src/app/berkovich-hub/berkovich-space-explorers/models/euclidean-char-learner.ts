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

export interface EuclideanForwardResult {
  probs: number[];
  logits: number[];
  H: number[];
}

export class EuclideanCharLearner {
  readonly V: number;
  readonly embDim: number;

  E: number[][]; // [V, embDim]
  W: number[][]; // [embDim, V]
  biases: number[];       // [V]

  constructor(vocab: string[], embDim: number = 5) {
    this.V = vocab.length;
    this.embDim = embDim;

    this.E = [];
    this.W = [];
    this.biases = [];

    // Xavier/Glorot-like initialization
    const scale = Math.sqrt(2.0 / embDim);

    // Initialize W: [embDim, V]
    for (let d = 0; d < this.embDim; d++) {
      const weightRow: number[] = [];
      for (let i = 0; i < this.V; i++) {
        weightRow.push((Math.random() - 0.5) * scale);
      }
      this.W.push(weightRow);
    }

    // Initialize E: [V, embDim] and biases: [V]
    for (let i = 0; i < this.V; i++) {
      const embRow: number[] = [];
      for (let d = 0; d < this.embDim; d++) {
        embRow.push((Math.random() - 0.5) * scale);
      }
      this.E.push(embRow);
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
        sum += this.E[contextIndices[j]][d];
      }
      H[d] = sum / (N + 1e-15);
    }

    // 2. Linear logits
    const logits: number[] = [];
    for (let k = 0; k < this.V; k++) {
      let score = this.biases[k];
      for (let d = 0; d < this.embDim; d++) {
        score += H[d] * this.W[d][k];
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
    const dLogits = [...gLogits];
    const db: number[] = [...gLogits];
    
    // Gradient w.r.t embeddings (due to mean pooling, dL/demb = dL/dH * 1/N)
    const dEmb = new Array(this.embDim).fill(0);
    for (let d = 0; d < this.embDim; d++) {
      for (let k = 0; k < this.V; k++) {
        dEmb[d] += dLogits[k] * this.W[d][k];
      }
      dEmb[d] /= N;
    }

    // 4. Update Weights
    for (let k = 0; k < this.V; k++) {
      this.biases[k] -= lr * db[k];
      for (let d = 0; d < this.embDim; d++) {
        this.W[d][k] -= lr * (dLogits[k] * fwd.H[d] + reg * this.W[d][k]);
      }
    }

    for (let j = 0; j < N; j++) {
      const charIdx = contextIndices[j];
      for (let d = 0; d < this.embDim; d++) {
        this.E[charIdx][d] -= lr * (dEmb[d] + reg * this.E[charIdx][d]);
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
    const accumDW = Array.from({ length: this.embDim }, () => Array(this.V).fill(0.0));
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
          accumDW[d][k] += gk * fwd.H[d];
        }
      }

      // Backprop to embeddings
      const dH = Array(this.embDim).fill(0.0);
      for (let k = 0; k < this.V; k++) {
        const gk = gLogits[k];
        for (let d = 0; d < this.embDim; d++) {
          dH[d] += gk * this.W[d][k];
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
        this.W[d][k] -= lr * (accumDW[d][k] / B + reg * this.W[d][k]);
      }
    }

    for (let charIdx = 0; charIdx < this.V; charIdx++) {
      if (embCounts[charIdx] > 0) {
        for (let d = 0; d < this.embDim; d++) {
          const grad = accumDEmb[charIdx][d] / B;
          this.E[charIdx][d] -= lr * (grad + reg * this.E[charIdx][d]);
        }
      }
    }

    return { loss: totalLoss / (B + 1e-15), accuracy: correctCount / (B + 1e-15) };
  }
}
