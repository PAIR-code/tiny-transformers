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
  extNegate,
  multiply
} from '../../../../lib/berkovich/berkovich';
import { CharLearner, CharLearnerKind, ConfigFieldDef, ConfigFieldType } from './char-learner';
import { BerkovichDisk, BerkovichConfig, BerkovichForwardResult, BerkovichCharLearnerBase } from './berkovich-char-learner';

export interface AttentionForwardResult extends BerkovichForwardResult {
  scores: number[];
  weights: number[];
  activeAttSources: number[]; // [embDim] active history index that contributed the max log-radius
}

export interface AttentionConfig extends BerkovichConfig {
  betaAtt: number;
  contextLength: number;
}

export class BerkovichAttentionCharLearner extends BerkovichCharLearnerBase {
  override kind = CharLearnerKind.BerkovichAttention;

  constructor(vocab: string[], embDim: number, prime: number) {
    super(vocab, embDim, prime);
  }

  get configDefs(): ConfigFieldDef[] {
    return [
      { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
      { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
      { key: 'contextLength', label: 'Context Length', kind: ConfigFieldType.Number, description: 'Number of history characters to use', defaultValue: 3, requiresRebuild: true },
      { key: 'betaAtt', label: 'Attention Scale (β_att)', kind: ConfigFieldType.Number, description: 'Temperature scale for Hsia attention scores', defaultValue: 2.0, step: 0.1 },
      { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
      { key: 'reg', label: 'Constraint Reg.', kind: ConfigFieldType.Number, description: 'Regularization on target log-radius', defaultValue: 0.04, step: 0.01 },
      { key: 'regEmbed', label: 'Embed Reg.', kind: ConfigFieldType.Number, description: 'Regularization on embedding log-radius', defaultValue: 0.02, step: 0.01 },
      { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 },
      { key: 'aggMode', label: 'Agg. Mode', kind: ConfigFieldType.Select, description: 'How to aggregate dimension distances', defaultValue: 'min', options: [{ value: 'min', label: 'Min Distance (Max Loss)' }, { value: 'average', label: 'Average Distance' }] },
      { key: 'digitsLeft', label: 'Digits (Left)', kind: ConfigFieldType.Number, description: 'P-adic digits to the left of the point', defaultValue: 2, min: 0 },
      { key: 'digitsRight', label: 'Digits (Right)', kind: ConfigFieldType.Number, description: 'P-adic digits to the right of the point', defaultValue: 2, min: 0 }
    ];
  }

  override forward(contextIndices: number[], config: AttentionConfig): AttentionForwardResult {
    const p = this.prime;
    const { aggMode, beta } = config;
    const betaAtt = config.betaAtt ?? 2.0;
    const N = contextIndices.length;

    if (N === 0) {
      const uniform = 1.0 / this.V;
      return {
        probs: Array(this.V).fill(uniform),
        logits: Array(this.V).fill(0),
        activeDims: Array(this.V).fill(0),
        H: [],
        dists: Array(this.V).fill(Array(this.embDim).fill(0)),
        pathLosses: Array(this.V).fill(Array(this.embDim).fill(0)),
        scores: [],
        weights: [],
        activeAttSources: Array(this.embDim).fill(0)
      };
    }

    // Lookup context embeddings
    const H_ctx: BerkovichDisk[][] = [];
    for (let t = 0; t < N; t++) {
      const row: BerkovichDisk[] = [];
      const charIdx = contextIndices[t];
      for (let d = 0; d < this.embDim; d++) {
        row.push(this.E[charIdx][d]);
      }
      H_ctx.push(row);
    }

    // Query is the last token embedding
    const Q = H_ctx[N - 1];

    // Compute Hsia similarity scores for each context token t
    const scores: number[] = [];
    for (let t = 0; t < N; t++) {
      let scoreT = 0;
      for (let d = 0; d < this.embDim; d++) {
        const valDiff = getValuation(subtract(Q[d].center, H_ctx[t][d].center), p);
        const distanceVal = valDiff.type === 'finite' ? valDiff.value : Infinity;
        
        // Hsia distance: max(p^rho_Q, p^rho_K, |c_Q - c_K|)
        const lcaRho = Math.max(Q[d].rho, H_ctx[t][d].rho, distanceVal === Infinity ? -Infinity : -distanceVal);
        scoreT -= lcaRho; // Negated Hsia distance
      }
      scores.push(scoreT);
    }

    // Softmax over scores
    const maxScore = Math.max(...scores);
    const expsAtt = scores.map(s => Math.exp(betaAtt * (s - maxScore)));
    const sumExpsAtt = expsAtt.reduce((a, b) => a + b, 0);
    const weights = expsAtt.map(e => e / (sumExpsAtt + 1e-15));

    // Weighted tropical aggregation (H)
    const H: BerkovichDisk[] = [];
    const activeAttSources: number[] = [];
    const logP = Math.log(Number(p));

    for (let d = 0; d < this.embDim; d++) {
      let cSum = { num: 0n, den: 1n };
      let maxRho = -Infinity;
      let activeT = 0;

      for (let t = 0; t < N; t++) {
        const alpha = weights[t];
        // Center contribution: alpha_t * c(H_t)
        // Center scaling is approximate using floats to rational conversion
        // (For training steps we map it locally)
        const alphaScaledCenter = multiply(H_ctx[t][d].center, {
          num: BigInt(Math.floor(alpha * 1000000)),
          den: 1000000n
        });
        cSum = add(cSum, alphaScaledCenter);

        // Radius scaling: rho_t + log_p(alpha_t)
        const termRho = H_ctx[t][d].rho + (alpha > 0 ? Math.log(alpha) / logP : -Infinity);
        if (termRho > maxRho) {
          maxRho = termRho;
          activeT = t;
        }
      }

      maxRho = Math.max(-2, Math.min(2, maxRho));
      H.push({ center: simplify(cSum), rho: maxRho });
      activeAttSources.push(activeT);
    }

    // Class distances and logits
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

      logits.push(score);
      activeDims.push(actD);
    }

    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / (sumExps + 1e-15));

    return { probs, logits, activeDims, H, dists, pathLosses, scores, weights, activeAttSources };
  }

  override trainStep(
    contextIndices: number[],
    targetIdx: number,
    config: AttentionConfig
  ): { loss: number; predIdx: number; forwardResult: AttentionForwardResult } {
    const p = this.prime;
    const N = contextIndices.length;
    const { lr, reg, regEmbed, aggMode, beta } = config;
    const betaAtt = config.betaAtt ?? 2.0;

    const fwd = this.forward(contextIndices, config);
    const loss = -Math.log(fwd.probs[targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));

    if (N === 0) {
      return { loss, predIdx, forwardResult: fwd };
    }

    // Re-aggregate context embedding pointers
    const H_ctx: BerkovichDisk[][] = [];
    for (let t = 0; t < N; t++) {
      const row: BerkovichDisk[] = [];
      const charIdx = contextIndices[t];
      for (let d = 0; d < this.embDim; d++) {
        row.push(this.E[charIdx][d]);
      }
      H_ctx.push(row);
    }
    const Q = H_ctx[N - 1];

    // Logit Gradients
    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetIdx ? 1 : 0)));

    // Accums for backpropagation
    const dLoss_dHrho = new Array(this.embDim).fill(0);
    const dLoss_dHcenter = new Array(this.embDim).fill(0).map(() => [] as Rational[]);
    const dLoss_dAlpha = new Array(N).fill(0);

    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];

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
        const H_d = fwd.H[d];

        // 1. Update target constraints
        if (gk_dim < 0) {
          const details = computeGradientDetails(W.center, W.rho, H_d.center, H_d.rho, p, lr * Math.abs(gk_dim));
          W.center = details.nextCenter;
          W.rho = details.nextLogRadius;
          dLoss_dHcenter[d].push(W.center);
        } else if (gk_dim > 0) {
          const valuationDiff = getValuation(subtract(W.center, H_d.center), p);
          const dValuation = valuationDiff.type === 'finite' ? -valuationDiff.value : -Infinity;
          const sgn = W.rho >= dValuation ? 1 : -1;
          W.rho = Math.max(-2, Math.min(2, W.rho - lr * gk_dim * sgn));
        }

        W.rho = Math.max(-2, Math.min(2, W.rho - lr * reg * Math.log(Number(p)) * Math.exp(W.rho * Math.log(Number(p)))));

        // Gradient flowing back to H_d: dLoss/dH_d.rho = -gk_dim
        dLoss_dHrho[d] += gk_dim * (-1);
      }
    }

    // 2. Propagate through tropical attention aggregation: H_d.rho = max_t ( H_ctx[t][d].rho + log_p(alpha_t) )
    const logP = Math.log(Number(p));
    for (let d = 0; d < this.embDim; d++) {
      const gradHd = dLoss_dHrho[d];
      if (Math.abs(gradHd) < 1e-6) continue;

      const activeT = fwd.activeAttSources[d];
      const alpha_active = fwd.weights[activeT];

      // Gradient w.r.t active token embedding radius
      H_ctx[activeT][d].rho = Math.max(-2, Math.min(2, H_ctx[activeT][d].rho - lr * gradHd));

      // Gradient w.r.t alpha_t: dH_d.rho / dAlpha_active = 1 / (alpha_active * ln p)
      if (alpha_active > 0) {
        dLoss_dAlpha[activeT] += gradHd / (alpha_active * logP);
      }

      // Propagate centers force
      if (dLoss_dHcenter[d].length > 0) {
        const targetVal = dLoss_dHcenter[d][0];
        // Pull active value center towards targetVal
        if (Math.random() < 0.2) {
          H_ctx[activeT][d].center = targetVal;
        }
      }
    }

    // 3. Propagate through Attention Softmax to attention scores
    const dScores = new Array(N).fill(0);
    for (let t = 0; t < N; t++) {
      let sumGrads = 0;
      for (let t2 = 0; t2 < N; t2++) {
        sumGrads += fwd.weights[t2] * dLoss_dAlpha[t2];
      }
      dScores[t] = betaAtt * fwd.weights[t] * (dLoss_dAlpha[t] - sumGrads);
    }

    // 4. Propagate through Hsia Distance computation back to Q and Key embeddings
    // score_t = -\sum_d max(Q_d.rho, Key_d.rho, valuation(Q_d - Key_d))
    for (let t = 0; t < N; t++) {
      const gradScore = dScores[t];
      if (Math.abs(gradScore) < 1e-6) continue;

      for (let d = 0; d < this.embDim; d++) {
        const q_d = Q[d];
        const k_d = H_ctx[t][d];

        const valDiff = getValuation(subtract(q_d.center, k_d.center), p);
        const distanceVal = valDiff.type === 'finite' ? valDiff.value : Infinity;
        const distVal = distanceVal === Infinity ? -Infinity : -distanceVal;

        const maxVal = Math.max(q_d.rho, k_d.rho, distVal);

        // Hsia distance has derivative -1 inside negative sum, so dLoss/dDistance = -gradScore
        const gradDist = -gradScore;

        if (Math.abs(q_d.rho - maxVal) < 1e-6) {
          // Flow back to Query embedding radius
          q_d.rho = Math.max(-2, Math.min(2, q_d.rho - lr * gradDist));
        }
        if (Math.abs(k_d.rho - maxVal) < 1e-6) {
          // Flow back to Key embedding radius
          k_d.rho = Math.max(-2, Math.min(2, k_d.rho - lr * gradDist));
        }
      }
    }

    // Regularize all embeddings
    for (let charIdx = 0; charIdx < this.V; charIdx++) {
      for (let d = 0; d < this.embDim; d++) {
        const emb = this.E[charIdx][d];
        emb.rho = Math.max(-2, Math.min(2, emb.rho - lr * regEmbed * logP * Math.exp(emb.rho * logP)));
      }
    }

    return { loss, predIdx, forwardResult: fwd };
  }

  override trainBatch(
    samples: { contextIndices: number[]; targetIdx: number }[],
    config: AttentionConfig
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
