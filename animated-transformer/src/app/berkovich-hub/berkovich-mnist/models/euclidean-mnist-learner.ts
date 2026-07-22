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

import { extractPatches } from './mnist-data';

export interface EuclideanMnistConfig {
  gridSize: number;
  lr: number;
  beta: number;
  l2Reg?: number;
}

export interface EuclideanMnistForwardResult {
  probs: number[];
  logits: number[];
  H: number[]; // patch features
}

export class EuclideanMnistLearner {
  readonly vocab: string[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  readonly V = 10;
  gridSize: number;
  numPatches: number;

  // Weight matrix W[10][numPatches], bias B[10]
  W: number[][];
  B: number[];

  constructor(gridSize: number = 4) {
    this.gridSize = gridSize;
    this.numPatches = gridSize * gridSize;

    this.W = [];
    this.B = new Array(this.V).fill(0);

    for (let k = 0; k < this.V; k++) {
      const row: number[] = [];
      for (let p = 0; p < this.numPatches; p++) {
        row.push((Math.random() - 0.5) * 0.1);
      }
      this.W.push(row);
    }
  }

  forward(pixels: number[], config: EuclideanMnistConfig): EuclideanMnistForwardResult {
    const H = extractPatches(pixels, config.gridSize);
    const beta = config.beta ?? 1.0;

    const logits: number[] = [];
    for (let k = 0; k < this.V; k++) {
      let score = this.B[k];
      for (let p = 0; p < this.numPatches; p++) {
        score += this.W[k][p] * H[p];
      }
      logits.push(score);
    }

    const maxLogit = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(beta * (l - maxLogit)));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / (sumExps + 1e-15));

    return { probs, logits, H };
  }

  trainStep(
    pixels: number[],
    targetDigit: number,
    config: EuclideanMnistConfig
  ): { loss: number; predDigit: number; forwardResult: EuclideanMnistForwardResult } {
    const { lr, beta, l2Reg = 0.001 } = config;
    const fwd = this.forward(pixels, config);
    const loss = -Math.log(fwd.probs[targetDigit] + 1e-15);
    const predDigit = fwd.probs.indexOf(Math.max(...fwd.probs));

    const gLogits = fwd.probs.map((pi, k) => beta * (pi - (k === targetDigit ? 1 : 0)));

    for (let k = 0; k < this.V; k++) {
      const gk = gLogits[k];
      this.B[k] -= lr * gk;
      for (let p = 0; p < this.numPatches; p++) {
        const gradW = gk * fwd.H[p] + l2Reg * this.W[k][p];
        this.W[k][p] -= lr * gradW;
      }
    }

    return { loss, predDigit, forwardResult: fwd };
  }

  trainBatch(
    samples: { pixels: number[]; digit: number }[],
    config: EuclideanMnistConfig
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
