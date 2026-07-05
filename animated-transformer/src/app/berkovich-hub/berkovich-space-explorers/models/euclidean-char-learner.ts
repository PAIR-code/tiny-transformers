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

import { CharLearner, CharLearnerKind, ConfigFieldDef, ConfigFieldType } from './char-learner';
import { EuclideanEmbeddingEncoder, EuclideanDotProductDecoder } from './encoders-decoders';

export interface EuclideanForwardResult {
  probs: number[];
  logits: number[];
  H: number[];
}

export interface EuclideanConfig {
  lr: number;
  reg: number;
}

export interface EuclideanParams {
  E: number[][];
  W: number[][];
  biases: number[];
}

export class EuclideanCharLearner extends CharLearner<EuclideanConfig, EuclideanForwardResult, EuclideanParams> {
  readonly kind = CharLearnerKind.EuclideanNgram;
  
  readonly configDefs: ConfigFieldDef[] = [
    { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
    { key: 'contextLength', label: 'Context Length', kind: ConfigFieldType.Number, description: 'Number of history characters to use', defaultValue: 3, requiresRebuild: true },
    { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
    { key: 'reg', label: 'Regularization', kind: ConfigFieldType.Number, description: 'L2 weight decay', defaultValue: 0.04, step: 0.01 }
  ];

  encoder: EuclideanEmbeddingEncoder;
  decoder: EuclideanDotProductDecoder;

  get E(): number[][] { return this.encoder.E; }
  get W(): number[][] { return this.decoder.W; }
  get biases(): number[] { return this.decoder.b; }

  get parameters(): EuclideanParams {
    return { E: this.E, W: this.W, biases: this.biases };
  }

  constructor(vocab: string[], embDim: number = 5) {
    super(vocab, embDim);
    this.encoder = new EuclideanEmbeddingEncoder(vocab, embDim);
    this.decoder = new EuclideanDotProductDecoder(vocab, embDim);
    this.resetWeights();
  }

  resetWeights() {
    this.encoder.reset();
    this.decoder.reset();
  }

  forward(contextIndices: number[], config?: EuclideanConfig): EuclideanForwardResult {
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
    const dec = this.decoder.decode(H);

    // 3. Softmax
    const maxLogit = Math.max(...dec.logits);
    const exps = dec.logits.map(l => Math.exp(l - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / (sumExps + 1e-15));

    return { probs, logits: dec.logits, H };
  }

  trainStep(
    contextIndices: number[],
    targetIdx: number,
    config: EuclideanConfig
  ): { loss: number; predIdx: number; forwardResult: EuclideanForwardResult } {
    const N = contextIndices.length;
    const { lr, reg } = config;

    // 1. Forward Pass
    const fwd = this.forward(contextIndices);
    const loss = -Math.log(fwd.probs[targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));

    // 2. Gradients w.r.t logits: g_k = pi_k - I[k == target]
    const gLogits = fwd.probs.map((pi, k) => pi - (k === targetIdx ? 1 : 0));

    // 3. Update biases and weights (decoder)
    this.decoder.update(fwd.H, gLogits, lr, reg);

    // 4. Update embeddings (encoder)
    if (N > 0) {
      const dEmb = new Array(this.embDim).fill(0);
      for (let d = 0; d < this.embDim; d++) {
        for (let k = 0; k < this.V; k++) {
          dEmb[d] += gLogits[k] * this.W[k][d];
        }
        dEmb[d] /= N;
      }

      for (let j = 0; j < N; j++) {
        const charIdx = contextIndices[j];
        for (let d = 0; d < this.embDim; d++) {
          this.E[charIdx][d] -= lr * (dEmb[d] + reg * this.E[charIdx][d]);
        }
      }
    }

    return { loss, predIdx, forwardResult: fwd };
  }

  trainBatch(
    samples: { contextIndices: number[]; targetIdx: number }[],
    config: EuclideanConfig
  ): { loss: number; accuracy: number } {
    const B = samples.length;
    const { lr, reg } = config;
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
          dH[d] += gk * this.W[k][d];
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
        this.W[k][d] -= lr * (accumDW[k][d] / B + reg * this.W[k][d]);
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
