/* Copyright 2026 Google LLC. All Rights Reserved.
==============================================================================*/

import {
  Rational,
  simplify,
  add,
  subtract,
  getValuation,
  computePathLoss,
  computeGradientDetails,
  extNegate
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

    // 1. Context embedding aggregation (just last char if N=1)
    const H: BerkovichDisk[] = [];
    for (let d = 0; d < this.embDim; d++) {
      let cSum = { num: 0n, den: 1n };
      let maxRho = -Infinity;

      for (let j = 1; j <= N; j++) {
        const charIdx = contextIndices[j - 1];
        const emb = this.E[charIdx][d];
        
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

    // 2. Class distance evaluation
    const logits: number[] = [];
    const activeDims: number[] = [];
    const dists: number[][] = [];
    const pathLosses: number[][] = [];

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

      // Add the learned real-valued class bias
      logits.push(score + this.b[k]);
      activeDims.push(actD);
    }

    // Softmax
    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / (sumExps + 1e-15));

    return { probs, logits, activeDims, H, dists, pathLosses };
  }

  override trainStep(
    contextIndices: number[],
    targetIdx: number,
    config: BerkovichConfig
  ): { loss: number; predIdx: number; forwardResult: BerkovichForwardResult } {
    const p = this.prime;
    const N = contextIndices.length;
    const { lr, reg, regEmbed, aggMode, beta } = config;

    // 1. Forward
    const fwd = this.forward(contextIndices, config);
    const loss = -Math.log(fwd.probs[targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));

    // 2. Logits gradient: dL / dLogit_k = beta * (pi_k - I[k == target])
    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetIdx ? 1 : 0)));

    // 3. Update biases and parameter disks
    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];

      // Update bias: b_k -= lr * (dL / dLogit_k) / beta = lr * (I[k == target] - pi_k)
      this.b[k] -= lr * (gk / beta);

      for (let d = 0; d < this.embDim; d++) {
        const isDimActive = aggMode === 'min' ? (d === fwd.activeDims[k]) : true;
        if (!isDimActive) continue;

        const weight = aggMode === 'min' ? 1.0 : (1.0 / this.embDim);
        const gk_dim = gk * weight;

        if (k !== targetIdx && fwd.pathLosses[k][d] > 0) {
          const W = this.W[k][d];
          W.rho = Math.max(-2, Math.min(2, W.rho - lr * reg * Math.log(Number(p)) * Math.exp(W.rho * Math.log(Number(p)))));
          continue;
        }

        const W = this.W[k][d];
        const H = fwd.H[d];

        if (gk_dim < 0) {
          const details = computeGradientDetails(W.center, W.rho, H.center, H.rho, p, lr * Math.abs(gk_dim));
          W.center = details.nextCenter;
          W.rho = details.nextLogRadius;
        } else if (gk_dim > 0) {
          const valuationDiff = getValuation(subtract(W.center, H.center), p);
          const dValuation = valuationDiff.type === 'finite' ? -valuationDiff.value : -Infinity;
          const sgn = W.rho >= dValuation ? 1 : -1;
          W.rho = Math.max(-2, Math.min(2, W.rho - lr * gk_dim * sgn));
        }

        W.rho = Math.max(-2, Math.min(2, W.rho - lr * reg * Math.log(Number(p)) * Math.exp(W.rho * Math.log(Number(p)))));

        for (let j = 1; j <= N; j++) {
          const charIdx = contextIndices[j - 1];
          const emb = this.E[charIdx][d];

          const isEmbActive = Math.abs((emb.rho - j) - H.rho) < 1e-7;
          if (!isEmbActive) continue;

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

          const diffCenter = subtract(W.center, otherSum);
          const targetCenter = simplify({
            num: diffCenter.num * (p ** BigInt(j)),
            den: diffCenter.den
          });
          const targetLogRadius = W.rho + j;

          if (gk_dim < 0) {
            const details = computeGradientDetails(emb.center, emb.rho, targetCenter, targetLogRadius, p, lr * Math.abs(gk_dim));
            emb.center = details.nextCenter;
            emb.rho = details.nextLogRadius;
          } else if (gk_dim > 0) {
            const valuationDiff = getValuation(subtract(emb.center, targetCenter), p);
            const dValuation = valuationDiff.type === 'finite' ? -valuationDiff.value : -Infinity;
            const sgn = emb.rho >= dValuation ? 1 : -1;
            emb.rho = Math.max(-2, Math.min(2, emb.rho - lr * gk_dim * sgn));
          }

          emb.rho = Math.max(-2, Math.min(2, emb.rho - lr * regEmbed * Math.log(Number(p)) * Math.exp(emb.rho * Math.log(Number(p)))));
        }
      }
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
