/* Copyright 2026 Google LLC. All Rights Reserved.
==============================================================================*/

import {
  simplify,
  add
} from '../../../../lib/berkovich/berkovich';
import { CharLearner, CharLearnerKind, ConfigFieldDef, ConfigFieldType } from './char-learner';
import { BerkovichDisk, BerkovichForwardResult, BerkovichConfig, BerkovichParams, BerkovichCharLearnerBase } from './berkovich-char-learner';

export interface BerkovichBigramBiasParams {
  E: BerkovichDisk[][];
  W: BerkovichDisk[][];
  b: number[];
}

export class BerkovichBigramBiasCharLearner extends BerkovichCharLearnerBase {
  override kind = CharLearnerKind.BerkovichBigramBias;

  b: number[]; // real-valued class biases

  constructor(vocab: string[], embDim: number, prime: number) {
    super(vocab, embDim, prime);
    this.b = new Array(this.V).fill(0.0);
  }

  get configDefs(): ConfigFieldDef[] {
    return [
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

  override forward(contextIndices: number[], config: BerkovichConfig): BerkovichForwardResult {
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
        const emb = this.encoder.E[charIdx][d];
        
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

    // 2. Class distance evaluation via decoder
    const dec = this.decoder.decode(H, config);
    const biasedLogits = dec.logits.map((score, k) => score + this.b[k]);

    // 3. Softmax
    const maxLogit = Math.max(...biasedLogits);
    const exps = biasedLogits.map(l => Math.exp(beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / (sumExps + 1e-15));

    return { probs, logits: biasedLogits, activeDims: dec.activeDims, H, dists: dec.dists, pathLosses: dec.pathLosses };
  }

  override trainStep(
    contextIndices: number[],
    targetIdx: number,
    config: BerkovichConfig
  ): { loss: number; predIdx: number; forwardResult: BerkovichForwardResult } {
    const N = contextIndices.length;
    const { lr, reg, regEmbed, aggMode, beta } = config;

    // 1. Forward
    const fwd = this.forward(contextIndices, config);
    const loss = -Math.log(fwd.probs[targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));

    // 2. Logits gradient
    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetIdx ? 1 : 0)));

    // 3. Update biases: b_k -= lr * (gk / beta)
    for (let k = 0; k < this.V; k++) {
      this.b[k] -= lr * (gLogits[k] / beta);
    }

    // 4. Update decoder target constraints
    this.decoder.update(fwd.H, targetIdx, gLogits, config, fwd.activeDims);

    // 5. Update encoder input embeddings
    if (N > 0) {
      this.encoder.update(contextIndices, fwd.H, this.decoder.W, gLogits, fwd.activeDims, fwd.pathLosses, targetIdx, config);
    }

    return { loss, predIdx, forwardResult: fwd };
  }

  override trainBatch(
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
