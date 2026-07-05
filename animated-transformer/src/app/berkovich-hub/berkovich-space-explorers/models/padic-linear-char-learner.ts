import {
  Rational,
  simplify,
  add,
  subtract,
  multiply,
  getValuation,
  computePathLoss
} from '../../../../lib/berkovich/berkovich';
import { CharLearner, CharLearnerKind, ConfigFieldDef, ConfigFieldType } from './char-learner';
import { BerkovichDisk, BerkovichForwardResult, BerkovichConfig } from './berkovich-char-learner';
import { PadicDigitEncoder, PadicLinearDecoder } from './encoders-decoders';

export interface PadicLinearParams {
  M: BerkovichDisk[][];
  B: BerkovichDisk[];
}

export class PadicLinearCharLearner extends CharLearner<BerkovichConfig, BerkovichForwardResult, PadicLinearParams> {
  override kind = CharLearnerKind.PadicLinear;
  readonly prime: bigint;

  encoder: PadicDigitEncoder;
  decoder: PadicLinearDecoder;

  get C(): Rational[][] { return this.encoder.C; }
  
  // Learned Parameters
  M: BerkovichDisk[][]; // [embDim, embDim]
  B: BerkovichDisk[];   // [embDim]

  get parameters(): PadicLinearParams {
    return { M: this.M, B: this.B };
  }

  constructor(vocab: string[], embDim: number, prime: number) {
    super(vocab, embDim);
    this.prime = BigInt(prime);

    const capacity = Number(this.prime) ** this.embDim;
    if (this.V > capacity) {
      throw new Error(`Cannot map ${this.V} classes into ${this.embDim} dimensions with prime ${this.prime}. Max capacity is ${capacity}.`);
    }

    this.encoder = new PadicDigitEncoder(vocab, embDim, this.prime);
    this.encoder.reset();
    this.decoder = new PadicLinearDecoder(vocab, embDim, this.prime, this.C);

    this.M = [];
    this.B = [];

    // Initialize M
    for (let i = 0; i < this.embDim; i++) {
      const mRow: BerkovichDisk[] = [];
      for (let j = 0; j < this.embDim; j++) {
        mRow.push(this.randomDisk());
      }
      this.M.push(mRow);
    }

    // Initialize B
    for (let j = 0; j < this.embDim; j++) {
      this.B.push(this.randomDisk());
    }
  }

  get configDefs(): ConfigFieldDef[] {
    return [
      { key: 'lr', label: 'Learning Rate (η)', description: 'Step size for updates.', kind: ConfigFieldType.Number, defaultValue: 0.1 },
      { key: 'reg', label: 'Weight Radius Reg (λ)', description: 'Regularization penalizing radius growth.', kind: ConfigFieldType.Number, defaultValue: 0.05 },
      { key: 'beta', label: 'Softmax Temperature (β)', description: 'Softmax temperature.', kind: ConfigFieldType.Number, defaultValue: 1.0 },
      { key: 'aggMode', label: 'Aggregation Mode', description: 'Mode of aggregation across dimensions.', kind: ConfigFieldType.Select, options: [{ value: 'min', label: 'Min (Max Path Loss)' }, { value: 'average', label: 'Average' }], defaultValue: 'min' },
      { key: 'digitsLeft', label: 'Digits (Left)', kind: ConfigFieldType.Number, description: 'P-adic digits to the left of the point', defaultValue: 2, min: 0 },
      { key: 'digitsRight', label: 'Digits (Right)', kind: ConfigFieldType.Number, description: 'P-adic digits to the right of the point', defaultValue: 2, min: 0 }
    ];
  }

  private randomDisk(): BerkovichDisk {
    const p = this.prime;
    const d0 = BigInt(Math.floor(Math.random() * Number(p)));
    const d1 = BigInt(Math.floor(Math.random() * Number(p)));
    const center = simplify(add({ num: d0, den: 1n }, { num: d1, den: p }));
    const rho = -2.0 - Math.random() * 0.5;
    return { center, rho };
  }

  forward(contextIndices: number[], config: BerkovichConfig): BerkovichForwardResult {
    const N = contextIndices.length;
    if (N === 0) {
      const uniform = 1.0 / this.V;
      return {
        probs: Array(this.V).fill(uniform),
        logits: Array(this.V).fill(0),
        activeDims: Array.from({length: this.embDim}, (_, i) => i),
        H: this.B,
        dists: Array(this.V).fill(Array(this.embDim).fill(0)),
        pathLosses: Array(this.V).fill(Array(this.embDim).fill(0))
      };
    }

    const charIdx = contextIndices[N - 1];
    const X = this.C[charIdx];

    // Compute Y = X * M + B
    const Y: BerkovichDisk[] = [];
    for (let j = 0; j < this.embDim; j++) {
      let yCenter = this.B[j].center;
      let yRho = this.B[j].rho;

      for (let i = 0; i < this.embDim; i++) {
        const x_i = X[i];
        const m_ij = this.M[i][j];

        const termCenter = multiply(x_i, m_ij.center);
        
        let termRho = m_ij.rho;
        const valX = getValuation(x_i, this.prime);
        if (valX.type === 'finite') {
          termRho += valX.value;
        } else if (valX.type === 'pos-infinity') {
          termRho = Infinity;
        }

        yCenter = add(yCenter, termCenter);
        yRho = Math.min(yRho, termRho);
      }
      Y.push({ center: yCenter, rho: yRho });
    }

    // Compute distances from Y to target class coordinates C_k via decoder
    const dec = this.decoder.decode(Y, config);

    // Softmax
    const maxLogit = Math.max(...dec.logits);
    const exps = dec.logits.map(l => Math.exp(config.beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / sumExps);

    const activeDims = Array.from({length: this.embDim}, (_, i) => i);

    return {
      probs,
      logits: dec.logits,
      activeDims,
      H: Y,
      dists: dec.dists,
      pathLosses: dec.pathLosses
    };
  }

  override trainStep(contextIndices: number[], targetIdx: number, config: BerkovichConfig): { loss: number; predIdx: number; forwardResult: BerkovichForwardResult; } {
    const forwardRes = this.forward(contextIndices, config);
    const maxLogit = Math.max(...forwardRes.logits);
    const exps = forwardRes.logits.map((l: number) => Math.exp(config.beta * (l - maxLogit)));
    const sumExps = exps.reduce((a: number, b: number) => a + b, 0);
    const prob = exps[targetIdx] / sumExps;
    
    this.trainBatch([{ contextIndices, targetIdx }], config);
    
    let predIdx = 0;
    let bestL = -Infinity;
    for (let i = 0; i < forwardRes.logits.length; i++) {
      if (forwardRes.logits[i] > bestL) {
        bestL = forwardRes.logits[i];
        predIdx = i;
      }
    }
    
    return { loss: -Math.log(prob + 1e-10), predIdx, forwardResult: forwardRes };
  }

  override trainBatch(
    samples: { contextIndices: number[]; targetIdx: number; }[],
    config: BerkovichConfig
  ): { loss: number; accuracy: number; } {
    let batchLoss = 0;
    let correct = 0;
    const { lr, reg, beta } = config;

    const M_grads = Array(this.embDim).fill(0).map(() => Array(this.embDim).fill(0));
    const B_grads = Array(this.embDim).fill(0);
    
    const M_forces = Array(this.embDim).fill(0).map(() => Array(this.embDim).fill(0).map(() => [] as Rational[]));
    const B_forces = Array(this.embDim).fill(0).map(() => [] as Rational[]);

    for (let b = 0; b < samples.length; b++) {
      const N = samples[b].contextIndices.length;
      const charIdx = samples[b].contextIndices[N - 1]; // using last char as context
      const X = this.C[charIdx];
      const targetChar = samples[b].targetIdx;

      const res = this.forward(samples[b].contextIndices, config);
      batchLoss += -Math.log(res.probs[targetChar] + 1e-10);
      
      let maxProbIdx = 0;
      for (let k = 1; k < this.V; k++) {
        if (res.probs[k] > res.probs[maxProbIdx]) {
          maxProbIdx = k;
        }
      }
      if (maxProbIdx === targetChar) correct++;

      // Compute gradients for logits
      for (let k = 0; k < this.V; k++) {
        const prob = res.probs[k];
        const indicator = k === targetChar ? 1 : 0;
        const gradLogit = beta * (prob - indicator); // dLoss/dLogit_k

        if (Math.abs(gradLogit) < 1e-6) continue;

        // Distribute to dimensions based on aggMode
        for (let d = 0; d < this.embDim; d++) {
          let gradD = 0;
          if (config.aggMode === 'average') {
            gradD = gradLogit / this.embDim;
          } else {
            const logitD = res.dists[k][d];
            const minLogit = Math.min(...res.dists[k]);
            if (Math.abs(logitD - minLogit) < 1e-6) {
              gradD = gradLogit;
            }
          }

          if (Math.abs(gradD) < 1e-6) continue;

          const yDisk = res.H[d];
          const cDisk = { center: this.C[k][d], rho: -Infinity };
          const dValExt = getValuation(subtract(yDisk.center, cDisk.center), this.prime);
          const dVal = dValExt.type === 'finite' ? -dValExt.value : -Infinity;

          const dLoss_dYrho = -1;
          
          const yRho = yDisk.rho;
          if (yDisk.rho >= dVal) {
            if (Math.abs(yRho - this.B[d].rho) < 1e-6) {
              B_grads[d] += gradD * dLoss_dYrho;
            }
            for (let i = 0; i < this.embDim; i++) {
              const xVal = getValuation(X[i], this.prime);
              const mRho = this.M[i][d].rho - (xVal.type === 'finite' ? xVal.value : 0);
              if (Math.abs(yRho - mRho) < 1e-6) {
                M_grads[i][d] += gradD * dLoss_dYrho;
              }
            }
          }

          if (gradD < 0) {
            B_forces[d].push(this.C[k][d]);
            for (let i = 0; i < this.embDim; i++) {
              if (X[i].num !== 0n) {
                M_forces[i][d].push(this.C[k][d]); 
              }
            }
          }
        }
      }
    }

    // Apply Gradients and Forces
    for (let d = 0; d < this.embDim; d++) {
      B_grads[d] += reg * this.B[d].rho;
      this.B[d].rho -= lr * B_grads[d];

      for (let i = 0; i < this.embDim; i++) {
        M_grads[i][d] += reg * this.M[i][d].rho;
        this.M[i][d].rho -= lr * M_grads[i][d];
      }

      if (B_forces[d].length > 0 && Math.random() < 0.2) {
        const rIdx = Math.floor(Math.random() * B_forces[d].length);
        this.B[d].center = B_forces[d][rIdx];
      }
      for (let i = 0; i < this.embDim; i++) {
        if (M_forces[i][d].length > 0 && Math.random() < 0.2) {
          const rIdx = Math.floor(Math.random() * M_forces[i][d].length);
          this.M[i][d].center = M_forces[i][d][rIdx];
        }
      }
    }

    return {
      loss: batchLoss / samples.length,
      accuracy: correct / samples.length
    };
  }

  walkthroughDetails() {
    return { type: 'padic-linear' as const };
  }
}
