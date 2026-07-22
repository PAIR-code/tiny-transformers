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
import { extractPatches } from './mnist-data';
import { BerkovichDisk } from './berkovich-mnist-learner';

export interface PadicLinearMnistConfig {
  prime: number;
  embDim: number;
  gridSize: number;
  lr: number;
  reg: number;
  beta: number;
  aggMode: 'min' | 'average';
}

export interface PadicLinearMnistForwardResult {
  probs: number[];
  logits: number[];
  H: BerkovichDisk[]; // Output transformation Y disks
  dists: number[][]; // [10, embDim]
  pathLosses: number[][]; // [10, embDim]
}

export class PadicLinearMnistLearner {
  readonly vocab: string[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  readonly V = 10;
  prime: bigint;
  embDim: number;
  gridSize: number;
  numPatches: number;

  // Fixed p-adic target points C[10][embDim]
  C: Rational[][];
  // Weight matrices M[numPatches][embDim], Bias B[embDim]
  M: BerkovichDisk[][];
  B: BerkovichDisk[];

  constructor(embDim: number = 5, prime: number = 3, gridSize: number = 4) {
    this.embDim = embDim;
    this.prime = BigInt(prime);
    this.gridSize = gridSize;
    this.numPatches = gridSize * gridSize;

    this.C = [];
    this.M = [];
    this.B = [];

    const p = this.prime;

    // Fixed distinct target points per digit class
    for (let k = 0; k < this.V; k++) {
      const classRow: Rational[] = [];
      for (let d = 0; d < this.embDim; d++) {
        const val0 = BigInt((k + d) % Number(p));
        const val1 = BigInt((k * 2 + d) % Number(p));
        classRow.push(simplify(add({ num: val0, den: 1n }, { num: val1, den: p })));
      }
      this.C.push(classRow);
    }

    // Initialize M matrix & B vector
    for (let i = 0; i < this.numPatches; i++) {
      const row: BerkovichDisk[] = [];
      for (let d = 0; d < this.embDim; d++) {
        row.push(this.randomDisk());
      }
      this.M.push(row);
    }

    for (let d = 0; d < this.embDim; d++) {
      this.B.push(this.randomDisk());
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

  forward(pixels: number[], config: PadicLinearMnistConfig): PadicLinearMnistForwardResult {
    const p = this.prime;
    const { aggMode, beta, gridSize } = config;
    const patchMeans = extractPatches(pixels, gridSize);
    const numP = patchMeans.length;

    // Map patch means to rational p-adic input constants X[numP]
    const X: Rational[] = patchMeans.map((m) => {
      const val = BigInt(Math.floor(m * Number(p)));
      return { num: val, den: 1n };
    });

    // Compute linear transformation Y = sum_i (X_i * M_i) + B
    const Y: BerkovichDisk[] = [];
    for (let d = 0; d < this.embDim; d++) {
      let cSum = { ...this.B[d].center };
      let maxRho = this.B[d].rho;

      for (let i = 0; i < numP; i++) {
        const xVal = X[i];
        if (xVal.num === 0n) continue;

        const mCenter = this.M[i][d].center;
        const prodCenter = simplify({
          num: xVal.num * mCenter.num,
          den: xVal.den * mCenter.den,
        });
        cSum = add(cSum, prodCenter);

        const valX = getValuation(xVal, p);
        const xNormVal = valX.type === 'finite' ? valX.value : 0;
        const rhoTerm = this.M[i][d].rho - xNormVal;
        if (rhoTerm > maxRho) {
          maxRho = rhoTerm;
        }
      }

      maxRho = Math.max(-2, Math.min(2, maxRho));
      Y.push({ center: cSum, rho: maxRho });
    }

    // Distances & Path Losses to class targets C_k
    const dists: number[][] = [];
    const pathLosses: number[][] = [];
    const logits: number[] = [];

    for (let k = 0; k < this.V; k++) {
      const kDists: number[] = [];
      const kLosses: number[] = [];

      for (let d = 0; d < this.embDim; d++) {
        const valDiff = getValuation(subtract(Y[d].center, this.C[k][d]), p);
        const logDist = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
        kDists.push(logDist);

        const loss = computePathLoss(-Infinity, extNegate(valDiff), Y[d].rho);
        kLosses.push(loss);
      }

      dists.push(kDists);
      pathLosses.push(kLosses);

      let logit = 0;
      if (aggMode === 'min') {
        logit = -Math.max(...kLosses);
      } else {
        logit = -kLosses.reduce((a, b) => a + b, 0) / this.embDim;
      }
      logits.push(logit);
    }

    const maxLogit = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / (sumExps + 1e-15));

    return { probs, logits, H: Y, dists, pathLosses };
  }

  trainStep(
    pixels: number[],
    targetDigit: number,
    config: PadicLinearMnistConfig
  ): { loss: number; predDigit: number; forwardResult: PadicLinearMnistForwardResult } {
    const { lr, reg, beta } = config;
    const fwd = this.forward(pixels, config);
    const loss = -Math.log(fwd.probs[targetDigit] + 1e-15);
    const predDigit = fwd.probs.indexOf(Math.max(...fwd.probs));

    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetDigit ? 1 : 0)));

    for (let d = 0; d < this.embDim; d++) {
      const B_d = this.B[d];
      const gk = gLogits[targetDigit];
      let bRhoAfter = B_d.rho - lr * (-gk + reg * B_d.rho);
      B_d.rho = Math.max(-2, Math.min(2, bRhoAfter));
      if (gk < 0) {
        B_d.center = { ...this.C[targetDigit][d] };
      }

      for (let i = 0; i < this.numPatches; i++) {
        const M_id = this.M[i][d];
        let mRhoAfter = M_id.rho - lr * (-gk + reg * M_id.rho);
        M_id.rho = Math.max(-2, Math.min(2, mRhoAfter));
        if (gk < 0) {
          M_id.center = { ...this.C[targetDigit][d] };
        }
      }
    }

    return { loss, predDigit, forwardResult: fwd };
  }

  trainBatch(
    samples: { pixels: number[]; digit: number }[],
    config: PadicLinearMnistConfig
  ): { loss: number; accuracy: number } {
    let totalLoss = 0;
    let correctCount = 0;

    for (const sample of samples) {
      const step = this.trainStep(sample.pixels, sample.digit, config);
      totalLoss += step.loss;
      if (step.predDigit === sample.digit) {
        correctCount++;
      }
    }

    return { loss: totalLoss / (samples.length + 1e-15), accuracy: correctCount / (samples.length + 1e-15) };
  }
}
