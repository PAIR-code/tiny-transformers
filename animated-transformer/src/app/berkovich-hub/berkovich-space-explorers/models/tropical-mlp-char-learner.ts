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
import { CharLearner, CharLearnerKind, ConfigFieldDef, ConfigFieldType } from './char-learner';
import { BerkovichDisk, BerkovichConfig, BerkovichForwardResult } from './berkovich-char-learner';

export interface TropicalMlpParams {
  E: BerkovichDisk[][];
  W1: BerkovichDisk[][]; // [embDim, hiddenDim]
  B1: BerkovichDisk[];   // [hiddenDim]
  W2: BerkovichDisk[][]; // [hiddenDim, embDim]
  B2: BerkovichDisk[];   // [embDim]
  W: BerkovichDisk[][];  // Target constraints [V, embDim]
}

export interface TropicalMlpConfig extends BerkovichConfig {
  hiddenDim: number;
  contextLength: number;
}

export class TropicalMlpCharLearner extends CharLearner<TropicalMlpConfig, BerkovichForwardResult, TropicalMlpParams> {
  override kind = CharLearnerKind.TropicalMlp;
  readonly prime: bigint;

  E: BerkovichDisk[][];
  W1: BerkovichDisk[][];
  B1: BerkovichDisk[];
  W2: BerkovichDisk[][];
  B2: BerkovichDisk[];
  W: BerkovichDisk[][]; // Class Target constraints

  get parameters(): TropicalMlpParams {
    return { E: this.E, W1: this.W1, B1: this.B1, W2: this.W2, B2: this.B2, W: this.W };
  }

  constructor(vocab: string[], embDim: number, prime: number, hiddenDim: number = 8) {
    super(vocab, embDim);
    this.prime = BigInt(prime);

    this.E = [];
    this.W1 = [];
    this.B1 = [];
    this.W2 = [];
    this.B2 = [];
    this.W = [];

    // Initialize Embeddings and Targets
    for (let i = 0; i < this.V; i++) {
      const embRow: BerkovichDisk[] = [];
      const constrRow: BerkovichDisk[] = [];
      for (let d = 0; d < this.embDim; d++) {
        embRow.push(this.randomDisk());
        constrRow.push(this.randomDisk());
      }
      this.E.push(embRow);
      this.W.push(constrRow);
    }

    // Initialize MLP weights
    for (let i = 0; i < this.embDim; i++) {
      const row: BerkovichDisk[] = [];
      for (let h = 0; h < hiddenDim; h++) {
        row.push(this.randomDisk());
      }
      this.W1.push(row);
    }

    for (let h = 0; h < hiddenDim; h++) {
      this.B1.push(this.randomDisk());
      const row: BerkovichDisk[] = [];
      for (let d = 0; d < this.embDim; d++) {
        row.push(this.randomDisk());
      }
      this.W2.push(row);
    }

    for (let d = 0; d < this.embDim; d++) {
      this.B2.push(this.randomDisk());
    }
  }

  private randomDisk(): BerkovichDisk {
    const p = this.prime;
    const d0 = BigInt(Math.floor(Math.random() * Number(p)));
    const d1 = BigInt(Math.floor(Math.random() * Number(p)));
    const center = simplify(add({ num: d0, den: 1n }, { num: d1, den: p }));
    const rho = -2.0 - Math.random() * 0.5;
    return { center, rho };
  }

  get configDefs(): ConfigFieldDef[] {
    return [
      { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
      { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
      { key: 'hiddenDim', label: 'Hidden Dim', kind: ConfigFieldType.Number, description: 'Number of hidden nodes in MLP', defaultValue: 8, requiresRebuild: true },
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

  forward(contextIndices: number[], config: TropicalMlpConfig): BerkovichForwardResult {
    const p = this.prime;
    const { aggMode, beta, hiddenDim } = config;
    const N = contextIndices.length;

    // 1. Context embedding aggregation (H0)
    const H0: BerkovichDisk[] = [];
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
      H0.push({ center: cSum, rho: maxRho });
    }

    // 2. Layer 1 Hidden state: Z = Activation(H0 * W1 + B1)
    const Z: BerkovichDisk[] = [];
    for (let h = 0; h < hiddenDim; h++) {
      let cSum = this.B1[h].center;
      let minRho = this.B1[h].rho;

      for (let d = 0; d < this.embDim; d++) {
        const h0 = H0[d];
        const w1 = this.W1[d][h];

        // h0 * w1 product center and rho
        const termCenter = multiply(h0.center, w1.center);
        const termRho = Math.max(
          getValuation(h0.center, p).type === 'finite' ? (getValuation(h0.center, p) as any).value + w1.rho : -Infinity,
          getValuation(w1.center, p).type === 'finite' ? (getValuation(w1.center, p) as any).value + h0.rho : -Infinity,
          h0.rho + w1.rho
        );

        cSum = add(cSum, termCenter);
        minRho = Math.min(minRho, termRho);
      }

      // Truncation Activation
      const actCenter = simplify(cSum); // Truncation center
      const actRho = Math.min(minRho, 0.0); // Tropical Relu: caps log-radius at 0
      Z.push({ center: actCenter, rho: actRho });
    }

    // 3. Layer 2 Output state: H2 = Z * W2 + B2
    const H2: BerkovichDisk[] = [];
    for (let d = 0; d < this.embDim; d++) {
      let cSum = this.B2[d].center;
      let minRho = this.B2[d].rho;

      for (let h = 0; h < hiddenDim; h++) {
        const z = Z[h];
        const w2 = this.W2[h][d];

        const termCenter = multiply(z.center, w2.center);
        const termRho = Math.max(
          getValuation(z.center, p).type === 'finite' ? (getValuation(z.center, p) as any).value + w2.rho : -Infinity,
          getValuation(w2.center, p).type === 'finite' ? (getValuation(w2.center, p) as any).value + z.rho : -Infinity,
          z.rho + w2.rho
        );

        cSum = add(cSum, termCenter);
        minRho = Math.min(minRho, termRho);
      }
      H2.push({ center: simplify(cSum), rho: Math.max(-2, Math.min(2, minRho)) });
    }

    // 4. Class distance evaluation against targets W
    const logits: number[] = [];
    const activeDims: number[] = [];
    const dists: number[][] = [];
    const pathLosses: number[][] = [];

    for (let k = 0; k < this.V; k++) {
      const classDists: number[] = [];
      const classLosses: number[] = [];
      
      for (let d = 0; d < this.embDim; d++) {
        const valDiff = getValuation(subtract(H2[d].center, this.W[k][d].center), p);
        const distance = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
        classDists.push(distance);

        const loss = valDiff.type === 'pos-infinity' && this.W[k][d].rho <= H2[d].rho
          ? 0
          : computePathLoss(this.W[k][d].rho, extNegate(valDiff), H2[d].rho);
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

    // Stashing hidden states Z and H2 in H (so the UI has something to view if needed)
    return { probs, logits, activeDims, H: H2, dists, pathLosses };
  }

  trainStep(
    contextIndices: number[],
    targetIdx: number,
    config: TropicalMlpConfig
  ): { loss: number; predIdx: number; forwardResult: BerkovichForwardResult } {
    const p = this.prime;
    const N = contextIndices.length;
    const { lr, reg, regEmbed, aggMode, beta, hiddenDim } = config;

    // We do a forward pass and capture intermediates
    const fwd = this.forward(contextIndices, config);
    const loss = -Math.log(fwd.probs[targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));

    // Re-run forward step to get intermediates for backward pass
    // (In production we'd return these from forward, but keeping forward signature clean is helpful)
    
    // Aggregate embeddings H0
    const H0: BerkovichDisk[] = [];
    for (let d = 0; d < this.embDim; d++) {
      let cSum = { num: 0n, den: 1n };
      let maxRho = -Infinity;
      for (let j = 1; j <= N; j++) {
        const emb = this.E[contextIndices[j - 1]][d];
        cSum = add(cSum, simplify({ num: emb.center.num, den: emb.center.den * (p ** BigInt(j)) }));
        maxRho = Math.max(maxRho, emb.rho - j);
      }
      H0.push({ center: cSum, rho: Math.max(-2, Math.min(2, maxRho)) });
    }

    // Hidden layer Z
    const Z: BerkovichDisk[] = [];
    const Z_minSources: number[] = []; // tracks which dim d was the active minimum for rho(Z_h)
    for (let h = 0; h < hiddenDim; h++) {
      let cSum = this.B1[h].center;
      let minRho = this.B1[h].rho;
      let minSourceIdx = -1; // -1 means bias was min

      for (let d = 0; d < this.embDim; d++) {
        const h0 = H0[d];
        const w1 = this.W1[d][h];
        const termCenter = multiply(h0.center, w1.center);
        const termRho = Math.max(
          getValuation(h0.center, p).type === 'finite' ? (getValuation(h0.center, p) as any).value + w1.rho : -Infinity,
          getValuation(w1.center, p).type === 'finite' ? (getValuation(w1.center, p) as any).value + h0.rho : -Infinity,
          h0.rho + w1.rho
        );

        cSum = add(cSum, termCenter);
        if (termRho < minRho) {
          minRho = termRho;
          minSourceIdx = d;
        }
      }

      const actRho = Math.min(minRho, 0.0);
      Z.push({ center: simplify(cSum), rho: actRho });
      Z_minSources.push(actRho === 0.0 ? -2 : minSourceIdx); // -2 means clipped by ReLU
    }

    // Output layer H2
    const H2_minSources: number[] = []; // tracks which hidden node h was the active minimum for rho(H2_d)
    for (let d = 0; d < this.embDim; d++) {
      let minRho = this.B2[d].rho;
      let minSourceIdx = -1; // -1 means bias was min

      for (let h = 0; h < hiddenDim; h++) {
        const z = Z[h];
        const w2 = this.W2[h][d];
        const termRho = Math.max(
          getValuation(z.center, p).type === 'finite' ? (getValuation(z.center, p) as any).value + w2.rho : -Infinity,
          getValuation(w2.center, p).type === 'finite' ? (getValuation(w2.center, p) as any).value + z.rho : -Infinity,
          z.rho + w2.rho
        );
        if (termRho < minRho) {
          minRho = termRho;
          minSourceIdx = h;
        }
      }
      H2_minSources.push(minSourceIdx);
    }

    // Gradients of loss w.r.t logits
    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetIdx ? 1 : 0)));

    // Accums for backprop
    const dLoss_dH2rho = new Array(this.embDim).fill(0);
    const dLoss_dZrho = new Array(hiddenDim).fill(0);
    const dLoss_dH0rho = new Array(this.embDim).fill(0);

    // Forces accum for centers
    const H2_forces = new Array(this.embDim).fill(0).map(() => [] as Rational[]);
    const Z_forces = new Array(hiddenDim).fill(0).map(() => [] as Rational[]);
    const H0_forces = new Array(this.embDim).fill(0).map(() => [] as Rational[]);

    // 1. Backprop from logits to Output Layer H2
    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];

      for (let d = 0; d < this.embDim; d++) {
        const isDimActive = aggMode === 'min' ? (d === fwd.activeDims[k]) : true;
        if (!isDimActive) continue;

        const weight = aggMode === 'min' ? 1.0 : (1.0 / this.embDim);
        const gk_dim = gk * weight;

        if (k !== targetIdx && fwd.pathLosses[k][d] > 0) {
          // Regularize targets W
          const W = this.W[k][d];
          W.rho = Math.max(-2, Math.min(2, W.rho - lr * reg * Math.log(Number(p)) * Math.exp(W.rho * Math.log(Number(p)))));
          continue;
        }

        const W = this.W[k][d];
        const h2 = fwd.H[d];

        // Update target constraints W directly
        if (gk_dim < 0) {
          const details = computeGradientDetails(W.center, W.rho, h2.center, h2.rho, p, lr * Math.abs(gk_dim));
          W.center = details.nextCenter;
          W.rho = details.nextLogRadius;
          
          // Pull output center towards constraint target
          H2_forces[d].push(W.center);
        } else if (gk_dim > 0) {
          const valuationDiff = getValuation(subtract(W.center, h2.center), p);
          const dValuation = valuationDiff.type === 'finite' ? -valuationDiff.value : -Infinity;
          const sgn = W.rho >= dValuation ? 1 : -1;
          W.rho = Math.max(-2, Math.min(2, W.rho - lr * gk_dim * sgn));
        }

        W.rho = Math.max(-2, Math.min(2, W.rho - lr * reg * Math.log(Number(p)) * Math.exp(W.rho * Math.log(Number(p)))));

        // Rho gradient flowing back to H2_d: dLoss/dH2_d.rho
        // Projection loss has derivative -1 w.r.t H2.rho
        dLoss_dH2rho[d] += gk_dim * (-1);
      }
    }

    // 2. Backprop through Layer 2 Output (H2 -> W2, B2, Z)
    for (let d = 0; d < this.embDim; d++) {
      const gradH2 = dLoss_dH2rho[d];
      if (Math.abs(gradH2) < 1e-6) continue;

      const activeSource = H2_minSources[d];
      if (activeSource === -1) {
        // Minimum was B2_d. Update B2 radius
        this.B2[d].rho -= lr * gradH2;
      } else if (activeSource >= 0) {
        const h = activeSource;
        // Minimum was Z_h + W2_hd. Update W2 radius
        this.W2[h][d].rho -= lr * gradH2;
        // Propagate to Z
        dLoss_dZrho[h] += gradH2;
      }

      // Propagate centers force
      if (H2_forces[d].length > 0) {
        const targetVal = H2_forces[d][0]; // grab the force target
        // B2 center pulled
        if (Math.random() < 0.2) this.B2[d].center = targetVal;
        
        for (let h = 0; h < hiddenDim; h++) {
          const w2 = this.W2[h][d];
          const z = Z[h];
          // Pull w2 center towards targetVal - z.center
          if (Math.random() < 0.2) {
            w2.center = simplify(subtract(targetVal, z.center));
          }
          // Propagate force to Z
          Z_forces[h].push(simplify(subtract(targetVal, w2.center)));
        }
      }
    }

    // 3. Backprop through Activation (Z -> H1)
    for (let h = 0; h < hiddenDim; h++) {
      const gradZ = dLoss_dZrho[h];
      const activeSource = Z_minSources[h];

      let gradH1 = 0;
      if (activeSource !== -2) {
        // Not clipped by ReLU. Gradient flows to H1
        gradH1 = gradZ;
      }

      if (Math.abs(gradH1) < 1e-6) continue;

      if (activeSource === -1) {
        // Bias B1_h was min
        this.B1[h].rho -= lr * gradH1;
      } else if (activeSource >= 0) {
        const d = activeSource;
        // W1_dh + H0_d was min
        this.W1[d][h].rho -= lr * gradH1;
        // Propagate to H0
        dLoss_dH0rho[d] += gradH1;
      }

      // Propagate centers force to Layer 1
      if (Z_forces[h].length > 0) {
        const targetVal = Z_forces[h][0];
        if (Math.random() < 0.2) this.B1[h].center = targetVal;

        for (let d = 0; d < this.embDim; d++) {
          const w1 = this.W1[d][h];
          const h0 = H0[d];
          if (Math.random() < 0.2) {
            w1.center = simplify(subtract(targetVal, h0.center));
          }
          H0_forces[d].push(simplify(subtract(targetVal, w1.center)));
        }
      }
    }

    // 4. Backprop through aggregation (H0 -> E)
    for (let d = 0; d < this.embDim; d++) {
      const gradH0 = dLoss_dH0rho[d];
      if (Math.abs(gradH0) < 1e-6) continue;

      for (let j = 1; j <= N; j++) {
        const charIdx = contextIndices[j - 1];
        const emb = this.E[charIdx][d];

        const isEmbActive = Math.abs((emb.rho - j) - H0[d].rho) < 1e-7;
        if (!isEmbActive) continue;

        // Update embedding radius
        emb.rho = Math.max(-2, Math.min(2, emb.rho - lr * gradH0));
        emb.rho = Math.max(-2, Math.min(2, emb.rho - lr * regEmbed * Math.log(Number(p)) * Math.exp(emb.rho * Math.log(Number(p)))));
      }

      // Propagate center force to active embedding character
      if (H0_forces[d].length > 0) {
        const targetVal = H0_forces[d][0];
        for (let j = 1; j <= N; j++) {
          const charIdx = contextIndices[j - 1];
          const emb = this.E[charIdx][d];
          const isEmbActive = Math.abs((emb.rho - j) - H0[d].rho) < 1e-7;
          if (isEmbActive && Math.random() < 0.2) {
            // Pull center: emb.center = targetVal * p^j
            emb.center = simplify(multiply(targetVal, { num: p ** BigInt(j), den: 1n }));
          }
        }
      }
    }

    return { loss, predIdx, forwardResult: fwd };
  }

  trainBatch(
    samples: { contextIndices: number[]; targetIdx: number }[],
    config: TropicalMlpConfig
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
