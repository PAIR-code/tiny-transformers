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

import { Component, OnInit, OnDestroy, signal, computed, effect, ChangeDetectionStrategy, untracked, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

import {
  Rational,
  simplify,
  add,
  subtract,
  formatRational,
  formatDigitSequence,
  getValuation,
  computeGradientDetails,
  GradientDetails,
  ExtendedNumber
} from '../../../lib/berkovich/berkovich';

import { BerkovichTreeVisComponent } from '../berkovich-point-vis/tree-vis/berkovich-tree-vis.component';
import { BerkovichCharLearner, EuclideanCharLearner, BerkovichDisk } from './berkovich-models';
import { MarkdownComponent } from 'ngx-markdown';
import { BerkovichDigitDisplayComponent } from '../berkovich-digit-display/berkovich-digit-display.component';
import {
  D3LineChartComponent,
  ChartConfig,
  defaultChartConfig,
  ScalingKind,
  CurveKind,
  NamedChartPoint
} from '../../d3-line-chart/d3-line-chart.component';

// Interface for prediction logs in the UI
interface PredictionLog {
  input: string;
  pred: string;
  target: string;
  loss: number;
  correct: boolean;
}

@Component({
  selector: 'app-berkovich-space-explorers',
  templateUrl: './berkovich-space-explorers.component.html',
  styleUrls: ['./berkovich-space-explorers.component.scss'],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    RouterModule,
    BerkovichTreeVisComponent,
    D3LineChartComponent,
    MarkdownComponent,
    BerkovichDigitDisplayComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichSpaceExplorersComponent implements OnInit, OnDestroy {
  // Configurable Parameters (Signals)
  readonly textInput = signal<string>("the cat sat on the mat");

  readonly approach = signal<'berkovich-bigram' | 'berkovich-ngram' | 'euclidean-ngram'>('berkovich-bigram');
  readonly prime = signal<number>(3);
  readonly contextLength = signal<number>(1); // For bigram this is fixed at 1, for ngram adjustable
  readonly embDim = signal<number>(5);
  readonly digitsLeft = signal<number>(2);
  readonly digitsRight = signal<number>(2);
  readonly learningRate = signal<number>(0.15);
  readonly regularizationTarget = signal<number>(0.04);
  readonly regularizationEmbed = signal<number>(0.02);
  readonly aggMode = signal<'min' | 'average'>('min');
  readonly beta = signal<number>(3.0);
  readonly batchSize = signal<number>(128);
  readonly trainingSpeed = signal<number>(100);

  readonly explainerText = computed(() => {
    const approach = this.approach();
    const dim = this.embDim();

    if (approach === 'euclidean-ngram') {
      return `
#### Euclidean N-Gram Predictor (Baseline)
This baseline uses standard vector spaces. Characters are mapped to Euclidean vectors $e_c \\in \\mathbb{R}^{${dim}}$.

1. **Forward Pass**:
   * For context characters $x_1, \\dots, x_N$, we look up their embeddings $E[x_i]$ and average them: $H = \\frac{1}{N} \\sum_{i=1}^N E[x_i]$.
   * Compute scores (logits) for each alphabet class $k$ using weights $W_k$ and bias $b_k$: $S_k = b_k + H \\cdot W_k$.
   * Propagate probabilities using the Standard Softmax:
     $$\\pi_k = \\frac{e^{\\beta S_k}}{\\sum_j e^{\\beta S_j}}$$

2. **Hyper-parameters & Variables**:
   * **Embedding Size (Dims)**: Dimension of vector space (${dim}).
   * **Context Size (N)**: Number of historical characters used for prediction.
   * **Learning Rate ($\\eta$)**: Size of gradient updates.
   * **Softmax Temp ($\\beta$)**: Controls prediction entropy (higher $\\beta$ creates peakier probabilities).
      `;
    }

    return `
#### Berkovich p-adic Predictor (Non-Archimedean)
In this model, characters are embedded as **Berkovich disks** $E_c = (c, \\rho) \\in \\Gamma_p^{${dim}}$, where $c \\in \\mathbb{Q}_p$ is the branch center and $\\rho \\in \\mathbb{R}$ is the log-radius of uncertainty.

1. **Forward Pass**:
   * **Context Aggregation**: Context embeddings $E[x_i]$ are aggregated into $H$ using the **Aggregation Mode**:
     * *Supremum Norm (Min Logit)*: $H_d = \\bigoplus_i E[x_i]_d$ (corresponds to the minimum logit/supremum disk on the tree).
     * *Affinoid Average*: A weighted centroid on the p-adic tree.
   * **Affinoid Projection**: We project $H$ against learned target classification disks $W_k$:
     $$D_{k,d} = -\\text{dist}_{\\text{tree}}(H_d, W_{k,d})$$
     $$D_k = \\min_{d=1}^{${dim}} D_{k,d}$$
   * **Affinoid Softmax**:
     $$\\pi_k = \\frac{e^{\\beta D_k}}{\\sum_j e^{\\beta D_j}}$$

2. **Why two Radius Regularizations?**
   * **Radius Reg (Target $\\lambda$)**: Shrinks the log-radii of classification disks $W_k$. Penalizing $\\rho(W_k)$ pushes the boundary disks to resolve ties and create clear margins between prediction outputs.
   * **Radius Reg (Embed $\\lambda$)**: Shrinks the log-radii of character embeddings $E_c$. Shrunk embedding sizes mean cleaner p-adic tree coordinates with tighter branches, preventing overlaps.

3. **Hyper-parameters & Variables**:
   * **p-adic Base ($p$)**: The prime number controlling tree branching.
   * **Embedding Size (Dims)**: Number of dimensions/trees (${dim}).
   * **Softmax Temp ($\\beta$)**: Direct scaling of affinoid path metric values.
    `;
  });

  readonly dimensions = computed(() => Array.from({ length: this.embDim() }, (_, i) => i));

  // Model & Training State
  readonly berkovichModel = signal<BerkovichCharLearner | null>(null);
  readonly euclideanModel = signal<EuclideanCharLearner | null>(null);
  readonly stepCount = signal<number>(0);
  readonly epochCount = signal<number>(0);
  
  readonly currentLossVal = signal<number>(0.0);
  readonly currentAccuracyVal = signal<number>(0.0);
  readonly recentPredictions = signal<PredictionLog[]>([]);

  readonly isInspectExpanded = signal<boolean>(false);
  readonly lossHistory = signal<number[]>([]);
  readonly accuracyHistory = signal<number[]>([]);

  readonly chartPoints = computed<NamedChartPoint[]>(() => {
    const lossH = this.lossHistory();
    const accH = this.accuracyHistory();
    const points: NamedChartPoint[] = [];

    lossH.forEach((val, index) => {
      points.push({
        x: index,
        y: val,
        name: 'Loss'
      });
    });

    accH.forEach((val, index) => {
      points.push({
        x: index,
        y: val,
        name: 'Accuracy'
      });
    });

    return points;
  });

  readonly chartConfig = computed<ChartConfig>(() => {
    const defaultConfig = defaultChartConfig();
    return {
      ...defaultConfig,
      width: 580,
      height: 220,
      xLabel: 'Step',
      yLabel: 'Loss',
      yTickFormat: '.2f',
      xTickFormat: 'd',
      legendX: 420,
      legendY: 10,
      rightYLabel: 'Accuracy',
      rightYLineNames: ['Accuracy'],
      rightYDomain: [0.0, 1.0],
    };
  });

  // Introspection Selection
  readonly selectedIntrospectType = signal<'embedding' | 'constraint'>('embedding');
  readonly selectedChar = signal<string>('e');
  readonly selectedDimension = signal<number>(0);

  // Targets tracked from the last active training step for display in tree-vis
  readonly lastStepTargets = signal<{
    embedding: Record<number, Record<number, BerkovichDisk>>;
    constraint: Record<number, Record<number, BerkovichDisk>>;
  }>({ embedding: {}, constraint: {} });

  // Auto-play timer
  private isTrainingLoopActive = false;
  private trainTimeout: any = null;
  readonly isPlaying = signal<boolean>(false);

  // Dataset tracking
  private textCursor = 0;

  // Vocabulary computed from the current text
  readonly vocab = computed(() => {
    const text = this.textInput();
    const chars = new Set([...text]);
    return Array.from(chars).sort();
  });

  // Selected parameter properties mapped for the Berkovich Tree Viewer
  readonly selectedParameterTreeProps = computed(() => {
    const model = this.berkovichModel();
    if (!model) return null;

    const char = this.selectedChar();
    const d = this.selectedDimension();
    const type = this.selectedIntrospectType();
    const p = BigInt(this.prime());

    const vocab = this.vocab();
    const charIdx = vocab.indexOf(char);
    if (charIdx === -1) return null;

    let center = { num: 0n, den: 1n };
    let rho = 0.0;

    if (type === 'embedding') {
      const disk = model.embeddings[charIdx][d];
      center = disk.center;
      rho = disk.rho;
    } else {
      const disk = model.constraints[charIdx][d];
      center = disk.center;
      rho = disk.rho;
    }

    // Load running target for this parameter (stored from last step, or default)
    const target = this.lastStepTargets()[type]?.[charIdx]?.[d] ?? {
      center: { num: 0n, den: 1n },
      rho: -2.0
    };

    const eta = this.learningRate();
    const details = computeGradientDetails(center, rho, target.center, target.rho, p, eta);

    const diff = subtract(center, target.center);
    const distanceVal = getValuation(diff, p);

    return {
      prime: Number(p),
      currentCenter: center,
      centerDigitsInput: formatDigitSequence(center, p),
      currentLogRadius: rho,
      targetRational: target.center,
      targetLogRadius: target.rho,
      targetDigitsInput: formatDigitSequence(target.center, p),
      gradientBreakdown: details,
      currentDistanceValuation: distanceVal,
      isDraggingRho: false
    };
  });

  constructor() {
    // Rebuild models and reset when vocab, prime, embDim, or approach changes
    effect(() => {
      this.vocab();
      this.prime();
      this.embDim();
      this.approach();
      untracked(() => {
        this.resetWeights();
      });
    });
  }

  ngOnInit(): void {
    this.resetWeights();
  }

  ngOnDestroy(): void {
    this.pauseTraining();
  }

  onApproachChange(val: any) {
    this.approach.set(val);
    if (val === 'berkovich-bigram') {
      this.contextLength.set(1);
    }
  }

  onPrimeChange(val: number) {
    this.prime.set(val);
  }

  onContextLengthChange(val: number) {
    if (this.approach() === 'berkovich-bigram') {
      this.contextLength.set(1);
    } else {
      this.contextLength.set(Math.max(1, Math.min(5, val)));
    }
    this.resetWeights();
  }

  onTextInput(val: string) {
    if (val.trim().length > 0) {
      this.textInput.set(val);
    }
  }

  async loadFullShakespeare() {
    try {
      const res = await fetch('https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt');
      if (!res.ok) throw new Error('Response error');
      const fullText = await res.text();
      // Use first 4000 characters for snappy browser training
      this.textInput.set(fullText.slice(0, 4000));
    } catch {
      alert('Unable to download dataset due to network constraints or CORS. The page will continue using the local text sample.');
    }
  }

  loadToyData() {
    this.textInput.set("the cat sat on the mat");
    this.resetWeights();
  }

  resetWeights() {
    this.pauseTraining();
    this.stepCount.set(0);
    this.epochCount.set(0);
    this.textCursor = 0;
    this.currentLossVal.set(0.0);
    this.currentAccuracyVal.set(0.0);
    this.recentPredictions.set([]);
    this.lossHistory.set([]);
    this.accuracyHistory.set([]);
    this.lastStepTargets.set({ embedding: {}, constraint: {} });

    const vocab = this.vocab();
    const p = this.prime();
    const dim = this.embDim();

    if (this.selectedDimension() >= dim) {
      this.selectedDimension.set(0);
    }

    if (this.approach() === 'euclidean-ngram') {
      this.euclideanModel.set(new EuclideanCharLearner(vocab, dim));
      this.berkovichModel.set(null);
    } else {
      this.berkovichModel.set(new BerkovichCharLearner(p, vocab, dim));
      this.euclideanModel.set(null);
    }

    if (vocab.length > 0) {
      const defaultChar = vocab.includes('e') ? 'e' : vocab[0];
      this.selectedChar.set(defaultChar);
    }
  }

  onEmbDimChange(val: number) {
    if (val >= 1 && val <= 10) {
      this.embDim.set(val);
      this.resetWeights();
    }
  }

  // Visual helper in cells
  formatCenter(c: Rational): string {
    return formatDigitSequence(c, BigInt(this.prime()));
  }

  selectParameter(char: string, dim: number) {
    this.selectedChar.set(char);
    this.selectedDimension.set(dim);
  }

  // Get sequential training sample
  private getNextSample(): { contextIndices: number[]; targetIdx: number; contextText: string; targetChar: string } {
    const text = this.textInput();
    const vocab = this.vocab();
    const N = this.contextLength();

    if (text.length <= N) {
      return { contextIndices: [], targetIdx: -1, contextText: '', targetChar: '' };
    }

    if (this.textCursor + N >= text.length) {
      this.textCursor = 0;
      this.epochCount.update(e => e + 1);
    }

    const contextText = text.slice(this.textCursor, this.textCursor + N);
    const targetChar = text[this.textCursor + N];

    const contextIndices = [...contextText].map(c => vocab.indexOf(c));
    const targetIdx = vocab.indexOf(targetChar);

    this.textCursor++;
    return { contextIndices, targetIdx, contextText, targetChar };
  }

  stepTrain() {
    const bSize = this.batchSize();
    const lr = this.learningRate();
    const regT = this.regularizationTarget();
    const regE = this.regularizationEmbed();
    const mode = this.aggMode();
    const temp = this.beta();

    const vocab = this.vocab();
    const bMode = this.approach();

    const bModel = this.berkovichModel();
    const eModel = this.euclideanModel();

    // 1. Gather all samples in the batch
    const samples: { contextIndices: number[]; targetIdx: number; contextText: string; targetChar: string }[] = [];
    for (let b = 0; b < bSize; b++) {
      const sample = this.getNextSample();
      if (sample.targetIdx !== -1) {
        samples.push(sample);
      }
    }

    if (samples.length === 0) return;

    let avgLoss = 0;
    let avgAcc = 0;
    const logs: PredictionLog[] = [];

    if (bMode !== 'euclidean-ngram' && bModel) {
      // Train batch on Berkovich model
      const batchResult = bModel.trainBatch(samples, lr, regT, regE, mode, temp);
      avgLoss = batchResult.loss;
      avgAcc = batchResult.accuracy;

      // Generate logs using the updated model for the UI list
      for (const sample of samples) {
        const fwd = bModel.forward(sample.contextIndices, mode, temp);
        const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
        const isCorrect = predIdx === sample.targetIdx;
        const loss = -Math.log(fwd.probs[sample.targetIdx] + 1e-15);

        logs.push({
          input: sample.contextText,
          target: sample.targetChar,
          pred: vocab[predIdx] || '?',
          loss,
          correct: isCorrect
        });
      }

      // Record the targets for introspect displaying for the very last sample in the batch
      const lastSample = samples[samples.length - 1];
      this.updateIntrospectTargets(lastSample.contextIndices, lastSample.targetIdx, bModel);

    } else if (eModel) {
      // Train batch on Euclidean model
      const batchResult = eModel.trainBatch(samples, lr, regT);
      avgLoss = batchResult.loss;
      avgAcc = batchResult.accuracy;

      for (const sample of samples) {
        const fwd = eModel.forward(sample.contextIndices);
        const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
        const isCorrect = predIdx === sample.targetIdx;
        const loss = -Math.log(fwd.probs[sample.targetIdx] + 1e-15);

        logs.push({
          input: sample.contextText,
          target: sample.targetChar,
          pred: vocab[predIdx] || '?',
          loss,
          correct: isCorrect
        });
      }
    }

    this.currentLossVal.set(avgLoss);
    this.currentAccuracyVal.set(avgAcc);
    this.stepCount.update(s => s + 1);

    // Keep log limited to last 15 items
    this.recentPredictions.update(current => [
      ...logs.reverse(),
      ...current
    ].slice(0, 15));

    // Record the loss and accuracy history for chart plotting
    this.lossHistory.update(h => [...h, avgLoss]);
    this.accuracyHistory.update(h => [...h, avgAcc]);

    // Force refresh models reference to trigger UI bindings
    if (bModel) this.berkovichModel.set(bModel);
    if (eModel) this.euclideanModel.set(eModel);
  }

  // Update target coordinates for introspector visualization
  private updateIntrospectTargets(contextIndices: number[], targetIdx: number, model: BerkovichCharLearner) {
    const p = BigInt(this.prime());
    const N = contextIndices.length;
    const targets = this.lastStepTargets();

    const fwd = model.forward(contextIndices, this.aggMode(), this.beta());

    for (let d = 0; d < model.embDim; d++) {
      // 1. Target for class constraint is H_d
      if (!targets.constraint[targetIdx]) {
        targets.constraint[targetIdx] = {};
      }
      targets.constraint[targetIdx][d] = {
        center: fwd.H[d].center,
        rho: fwd.H[d].rho
      };

      // 2. Target for active embeddings of context chars
      for (let j = 1; j <= N; j++) {
        const charIdx = contextIndices[j - 1];
        const emb = model.embeddings[charIdx][d];

        // check if this character was active in max-pool (rho_j - j == H_d.rho)
        if (Math.abs((emb.rho - j) - fwd.H[d].rho) < 1e-7) {
          let otherSum = { num: 0n, den: 1n };
          for (let l = 1; l <= N; l++) {
            if (l !== j) {
              const otherEmb = model.embeddings[contextIndices[l - 1]][d];
              otherSum = add(otherSum, simplify({
                num: otherEmb.center.num,
                den: otherEmb.center.den * (p ** BigInt(l))
              }));
            }
          }
          const diff = subtract(model.constraints[targetIdx][d].center, otherSum);
          const targetCenter = simplify({
            num: diff.num * (p ** BigInt(j)),
            den: diff.den
          });
          const targetLogRadius = model.constraints[targetIdx][d].rho + j;

          if (!targets.embedding[charIdx]) {
            targets.embedding[charIdx] = {};
          }
          targets.embedding[charIdx][d] = {
            center: targetCenter,
            rho: targetLogRadius
          };
        }
      }
    }

    this.lastStepTargets.set({ ...targets });
  }

  // Handle tree-drag interactions to manually adjust weights
  onTreeLogRadiusChange(newRho: number) {
    const model = this.berkovichModel();
    if (!model) return;

    const char = this.selectedChar();
    const d = this.selectedDimension();
    const type = this.selectedIntrospectType();

    const vocab = this.vocab();
    const charIdx = vocab.indexOf(char);
    if (charIdx === -1) return;

    if (type === 'embedding') {
      model.embeddings[charIdx][d].rho = newRho;
    } else {
      model.constraints[charIdx][d].rho = newRho;
    }

    this.berkovichModel.set(model);
  }

  // Continuous loop training
  startTraining() {
    this.pauseTraining();
    this.isPlaying.set(true);
    this.isTrainingLoopActive = true;
    this.runTrainLoop();
  }

  pauseTraining() {
    this.isPlaying.set(false);
    this.isTrainingLoopActive = false;
    if (this.trainTimeout) {
      clearTimeout(this.trainTimeout);
      this.trainTimeout = null;
    }
  }

  private runTrainLoop() {
    if (!this.isTrainingLoopActive) return;
    this.stepTrain();
    this.trainTimeout = setTimeout(() => {
      this.runTrainLoop();
    }, this.trainingSpeed());
  }

  // Runs training for a full pass over the text
  trainEpoch() {
    const textLen = this.textInput().length;
    const bSize = this.batchSize();
    const numSteps = Math.ceil(textLen / bSize);

    this.pauseTraining();
    for (let i = 0; i < numSteps; i++) {
      this.stepTrain();
    }
  }
}
