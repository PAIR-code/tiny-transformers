/* Copyright 2026 Google LLC. All Rights Reserved.
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
import { BerkovichDisk, BerkovichConfig } from './berkovich-char-learner';

export interface AffinoidForwardResult {
  probs: number[];
  logits: number[];
  activeConstraints: number[]; // [V] index of the constraint that achieved the maximum path loss
  activeDims: number[][];       // [V, numConstraints] active dimension per constraint
  H: BerkovichDisk[];          // [embDim] Aggregated context embeddings
  pathLosses: number[][][];    // [V, numConstraints, embDim]
}

export interface AffinoidNgramConfig extends BerkovichConfig {
  numConstraints: number;
  contextLength: number;
}

export interface AffinoidNgramParams {
  E: BerkovichDisk[][];
  W: BerkovichDisk[][][]; // [V, numConstraints, embDim]
}

export class AffinoidNgramCharLearner extends CharLearner<AffinoidNgramConfig, AffinoidForwardResult, AffinoidNgramParams> {
  override kind = CharLearnerKind.AffinoidNgram;
  readonly prime: bigint;

  E: BerkovichDisk[][];
  W: BerkovichDisk[][][]; // [V, numConstraints, embDim]

  get parameters(): AffinoidNgramParams {
    return { E: this.E, W: this.W };
  }

  constructor(vocab: string[], embDim: number, prime: number, numConstraints: number = 3) {
    super(vocab, embDim);
    this.prime = BigInt(prime);

    this.E = [];
    this.W = [];

    // Initialize embeddings
    for (let i = 0; i < this.V; i++) {
      const embRow: BerkovichDisk[] = [];
      for (let d = 0; d < this.embDim; d++) {
        embRow.push(this.randomDisk());
      }
      this.E.push(embRow);
    }

    // Initialize multi-constraint targets
    for (let k = 0; k < this.V; k++) {
      const classConstraints: BerkovichDisk[][] = [];
      for (let m = 0; m < numConstraints; m++) {
        const constrRow: BerkovichDisk[] = [];
        for (let d = 0; d < this.embDim; d++) {
          constrRow.push(this.randomDisk());
        }
        classConstraints.push(constrRow);
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

  get configDefs(): ConfigFieldDef[] {
    return [
      { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
      { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
      { key: 'contextLength', label: 'Context Length', kind: ConfigFieldType.Number, description: 'Number of history characters to use', defaultValue: 3, requiresRebuild: true },
      { key: 'numConstraints', label: 'Constraints per Class (M)', kind: ConfigFieldType.Number, description: 'Number of intersection constraints defining each class affinoid domain', defaultValue: 3, requiresRebuild: true },
      { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
      { key: 'reg', label: 'Constraint Reg.', kind: ConfigFieldType.Number, description: 'Regularization on target log-radius', defaultValue: 0.04, step: 0.01 },
      { key: 'regEmbed', label: 'Embed Reg.', kind: ConfigFieldType.Number, description: 'Regularization on embedding log-radius', defaultValue: 0.02, step: 0.01 },
      { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 },
      { key: 'aggMode', label: 'Agg. Mode', kind: ConfigFieldType.Select, description: 'How to aggregate dimension distances', defaultValue: 'min', options: [{ value: 'min', label: 'Min Distance (Max Loss)' }, { value: 'average', label: 'Average Distance' }] },
      { key: 'digitsLeft', label: 'Digits (Left)', kind: ConfigFieldType.Number, description: 'P-adic digits to the left of the point', defaultValue: 2, min: 0 },
      { key: 'digitsRight', label: 'Digits (Right)', kind: ConfigFieldType.Number, description: 'P-adic digits to the right of the point', defaultValue: 2, min: 0 }
    ];
  }

  forward(contextIndices: number[], config: AffinoidNgramConfig): AffinoidForwardResult {
    const p = this.prime;
    const { aggMode, beta, numConstraints } = config;
    const N = contextIndices.length;

    // 1. Context embedding aggregation (same as Berkovich Ngram)
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
          
          const loss = valDiff.type === 'pos-infinity' && W_kmd.rho <= H[d].rho
            ? 0
            : computePathLoss(W_kmd.rho, extNegate(valDiff), H[d].rho);
          constraintLosses.push(loss);
        }
        classLosses.push(constraintLosses);

        // Aggregate across dimensions for this constraint
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
          constraintScore = maxL; // this is positive loss
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

      // Logit for class k is the MINIMUM fit across constraints (logical AND)
      // Since constraintScores are positive losses, the worst fit is the MAXIMUM loss.
      // So the logit score is -MAXIMUM loss.
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

    // Softmax
    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / (sumExps + 1e-15));

    return { probs, logits, activeConstraints, activeDims, H, pathLosses };
  }

  trainStep(
    contextIndices: number[],
    targetIdx: number,
    config: AffinoidNgramConfig
  ): { loss: number; predIdx: number; forwardResult: AffinoidForwardResult } {
    const p = this.prime;
    const N = contextIndices.length;
    const { lr, reg, regEmbed, aggMode, beta, numConstraints } = config;

    // 1. Forward
    const fwd = this.forward(contextIndices, config);
    const loss = -Math.log(fwd.probs[targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));

    // 2. Logits gradient: dL / dLogit_k = beta * (pi_k - I[k == target])
    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetIdx ? 1 : 0)));

    // 3. Backward Pass & Updates
    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];
      const activeM = fwd.activeConstraints[k];

      // Regularize ALL target constraints' radii to pull them down/make them smaller
      for (let m = 0; m < numConstraints; m++) {
        for (let d = 0; d < this.embDim; d++) {
          const W = this.W[k][m][d];
          W.rho = Math.max(-2, Math.min(2, W.rho - lr * reg * Math.log(Number(p)) * Math.exp(W.rho * Math.log(Number(p)))));
        }
      }

      // Update only the active constraint of class k
      for (let d = 0; d < this.embDim; d++) {
        const isDimActive = aggMode === 'min' ? (d === fwd.activeDims[k][activeM]) : true;
        if (!isDimActive) continue;

        const weight = aggMode === 'min' ? 1.0 : (1.0 / this.embDim);
        const gk_dim = gk * weight;

        // Skip updating negative class targets if sample is already outside its domain
        if (k !== targetIdx && fwd.pathLosses[k][activeM][d] > 0) {
          continue;
        }

        const W = this.W[k][activeM][d];
        const H = fwd.H[d];

        // Update target center and radius
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

        // Apply embedding updates contributing to this active constraint
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

  trainBatch(
    samples: { contextIndices: number[]; targetIdx: number }[],
    config: AffinoidNgramConfig
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
