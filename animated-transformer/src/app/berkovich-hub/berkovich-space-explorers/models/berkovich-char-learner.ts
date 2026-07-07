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
import {
  computeGradientDetails
} from '../../../../lib/berkovich/berkovich_gradients';
import { CharLearner, CharLearnerKind, ConfigFieldDef, ConfigFieldType } from './char-learner';
import { BerkovichEmbeddingEncoder, BerkovichDistanceDecoder } from './encoders-decoders';

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

export interface BerkovichConfig {
  lr: number;
  reg: number;
  regEmbed: number;
  aggMode: 'min' | 'average';
  beta: number;
}

export interface BerkovichParams {
  E: BerkovichDisk[][];
  W: BerkovichDisk[][];
}

export abstract class BerkovichCharLearnerBase extends CharLearner<BerkovichConfig, BerkovichForwardResult, BerkovichParams> {
  readonly prime: bigint;

  encoder: BerkovichEmbeddingEncoder;
  decoder: BerkovichDistanceDecoder;

  get E(): BerkovichDisk[][] { return this.encoder.E; }
  get W(): BerkovichDisk[][] { return this.decoder.W; }

  get parameters(): BerkovichParams {
    return { E: this.E, W: this.W };
  }

  constructor(vocab: string[], embDim: number, prime: number) {
    super(vocab, embDim);
    this.prime = BigInt(prime);

    this.encoder = new BerkovichEmbeddingEncoder(vocab, embDim, this.prime);
    this.decoder = new BerkovichDistanceDecoder(vocab, embDim, this.prime);
    this.resetWeights();
  }

  resetWeights() {
    this.encoder.reset();
    this.decoder.reset();
  }

  forward(contextIndices: number[], config: BerkovichConfig): BerkovichForwardResult {
    const p = this.prime;
    const { aggMode, beta } = config;
    const N = contextIndices.length;

    // 1. Context embedding aggregation (weighted sum using p^-j scaling)
    const H: BerkovichDisk[] = [];
    for (let d = 0; d < this.embDim; d++) {
      let cSum = { num: 0n, den: 1n };
      let maxRho = -Infinity;

      for (let j = 1; j <= N; j++) {
        const charIdx = contextIndices[j - 1];
        const emb = this.E[charIdx][d];
        
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

    // 2. Class distance evaluation and logits calculation using the decoder
    const dec = this.decoder.decode(H, config);

    // 3. Softmax
    const maxLogit = Math.max(...dec.logits);
    const exps = dec.logits.map(l => Math.exp(beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / (sumExps + 1e-15));

    return { probs, logits: dec.logits, activeDims: dec.activeDims, H, dists: dec.dists, pathLosses: dec.pathLosses };
  }

  trainStep(
    contextIndices: number[],
    targetIdx: number,
    config: BerkovichConfig
  ): { loss: number; predIdx: number; forwardResult: BerkovichForwardResult } {
    const N = contextIndices.length;
    const { lr, reg, regEmbed, aggMode, beta } = config;

    // 1. Forward Pass
    const fwd = this.forward(contextIndices, config);
    const loss = -Math.log(fwd.probs[targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));

    // 2. Gradients of loss w.r.t logits: g_k = beta * (pi_k - I[k == target])
    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetIdx ? 1 : 0)));

    // 3. Backward Pass & Updates - Target constraints (decoder)
    this.decoder.update(fwd.H, targetIdx, gLogits, config, fwd.activeDims);

    // 4. Backward Pass & Updates - Input context embeddings (encoder)
    if (N > 0) {
      this.encoder.update(contextIndices, fwd.H, this.decoder.W, gLogits, fwd.activeDims, fwd.pathLosses, targetIdx, config);
    }

    return { loss, predIdx, forwardResult: fwd };
  }

  trainBatch(
    samples: { contextIndices: number[]; targetIdx: number }[],
    config: BerkovichConfig
  ): { loss: number; accuracy: number } {
    const B = samples.length;
    let totalLoss = 0;
    let correctCount = 0;

    for (const sample of samples) {
      const step = this.trainStep(sample.contextIndices, sample.targetIdx, config);
      totalLoss += step.loss;
      if (step.predIdx === sample.targetIdx) {
        correctCount++;
      }
    }

    return { loss: totalLoss / (B + 1e-15), accuracy: correctCount / (B + 1e-15) };
  }
}

export class BerkovichNgramCharLearner extends BerkovichCharLearnerBase {
  readonly kind = CharLearnerKind.BerkovichNgram;
  
  readonly configDefs: ConfigFieldDef[] = [
    { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
    { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
    { key: 'contextLength', label: 'Context Length', kind: ConfigFieldType.Number, description: 'Number of history characters to use', defaultValue: 3, requiresRebuild: true },
    { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
    { key: 'reg', label: 'Constraint Reg.', kind: ConfigFieldType.Number, description: 'Regularization on target log-radius', defaultValue: 0.04, step: 0.01 },
    { key: 'regEmbed', label: 'Embed Reg.', kind: ConfigFieldType.Number, description: 'Regularization on embedding log-radius', defaultValue: 0.02, step: 0.01 },
    { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 },
    { key: 'aggMode', label: 'Agg. Mode', kind: ConfigFieldType.Select, description: 'How to aggregate dimension distances', defaultValue: 'min', options: [{ value: 'min', label: 'Min Distance (Max Loss)' }, { value: 'average', label: 'Average Distance' }] },
    { key: 'digitsLeft', label: 'Digits (Left)', kind: ConfigFieldType.Number, description: 'P-adic digits to the left of the point', defaultValue: 2, min: 0 },
    { key: 'digitsRight', label: 'Digits (Right)', kind: ConfigFieldType.Number, description: 'P-adic digits to the right of the point', defaultValue: 2, min: 0 }
  ];
}

export class BerkovichBigramCharLearner extends BerkovichCharLearnerBase {
  readonly kind = CharLearnerKind.BerkovichBigram;
  
  readonly configDefs: ConfigFieldDef[] = [
    { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
    { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
    { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
    { key: 'reg', label: 'Constraint Reg.', kind: ConfigFieldType.Number, description: 'Regularization on target log-radius', defaultValue: 0.04, step: 0.01 },
    { key: 'regEmbed', label: 'Embed Reg.', kind: ConfigFieldType.Number, description: 'Regularization on embedding log-radius', defaultValue: 0.02, step: 0.01 },
    { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 },
    { key: 'aggMode', label: 'Agg. Mode', kind: ConfigFieldType.Select, description: 'How to aggregate dimension distances', defaultValue: 'min', options: [{ value: 'min', label: 'Min Distance (Max Loss)' }, { value: 'average', label: 'Average Distance' }] },
    { key: 'digitsLeft', label: 'Digits (Left)', kind: ConfigFieldType.Number, description: 'P-adic digits to the left of the point', defaultValue: 2, min: 0 },
    { key: 'digitsRight', label: 'Digits (Right)', kind: ConfigFieldType.Number, description: 'P-adic digits to the right of the point', defaultValue: 2, min: 0 }
  ];
}

