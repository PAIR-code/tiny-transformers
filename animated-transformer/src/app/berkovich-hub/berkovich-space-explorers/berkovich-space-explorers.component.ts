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
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { ConfigFieldDef, ConfigFieldType } from './models/char-learner';

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
import { BerkovichBigramCharLearner, BerkovichNgramCharLearner, BerkovichCharLearnerBase, BerkovichDisk, BerkovichConfig } from './models/berkovich-char-learner';
import { EuclideanCharLearner, EuclideanConfig } from './models/euclidean-char-learner';
import { PadicLinearCharLearner } from './models/padic-linear-char-learner';
import { BerkovichDigitDisplayComponent } from '../berkovich-digit-display/berkovich-digit-display.component';
import {
  D3LineChartComponent,
  ChartConfig,
  defaultChartConfig,
  ScalingKind,
  CurveKind,
  NamedChartPoint
} from '../../d3-line-chart/d3-line-chart.component';

import { ModelConfigEditorComponent } from './model-config-editor/model-config-editor.component';

import {
  WalkthroughEmbed,
  WalkthroughEmbedGroup,
  WalkthroughScore,
  WalkthroughPrediction,
  WalkthroughDetails
} from './walkthrough-components/shared/walkthrough-types';

import { BerkovichBigramWalkthroughComponent } from './walkthrough-components/berkovich-bigram-walkthrough.component';
import { BerkovichNgramWalkthroughComponent } from './walkthrough-components/berkovich-ngram-walkthrough.component';
import { EuclideanWalkthroughComponent } from './walkthrough-components/euclidean-walkthrough.component';
import { PadicLinearWalkthroughComponent } from './walkthrough-components/padic-linear-walkthrough.component';
import { BerkovichModelInspectorComponent } from './inspector-components/berkovich-model-inspector.component';
import { PadicLinearModelInspectorComponent } from './inspector-components/padic-linear-model-inspector.component';

import { BerkovichBigramBiasCharLearner } from './models/berkovich-bigram-bias-char-learner';
import { AffinoidNgramCharLearner } from './models/affinoid-ngram-char-learner';
import { TropicalMlpCharLearner } from './models/tropical-mlp-char-learner';
import { BerkovichAttentionCharLearner } from './models/berkovich-attention-char-learner';

// Interface for prediction logs in the UI
interface PredictionLog {
  preText: string;
  input: string;
  pred: string;
  target: string;
  loss: number;
  correct: boolean;
}

function formatDisplayString(str: string): string {
  return str.replace(/ /g, '␣').replace(/\n/g, '\\n');
}

import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-berkovich-space-explorers',
  templateUrl: './berkovich-space-explorers.component.html',
  styleUrls: ['./berkovich-space-explorers.component.scss'],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterModule,
    D3LineChartComponent,
    BerkovichBigramWalkthroughComponent,
    BerkovichNgramWalkthroughComponent,
    EuclideanWalkthroughComponent,
    PadicLinearWalkthroughComponent,
    BerkovichModelInspectorComponent,
    PadicLinearModelInspectorComponent,
    ModelConfigEditorComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'activePopup.set(null)' }
})
export class BerkovichSpaceExplorersComponent implements OnInit, OnDestroy {
  readonly formatDisplayString = formatDisplayString;
  readonly wrapInQuotes = (str: string) => `'${str}'`;
  readonly stepData = {
    bigram: {
      step1: "1. **Embedding Lookup**: The single context character $x_1$ is mapped directly to its embedding disk $E = (c_E, \\rho_E) \\in \\Gamma_p^d$. Since the context length is 1, no aggregation is needed: $H = E$.",
      step2: "2. **Affinoid Projection**: We project $H = (c_H, \\rho_H)$ against learned target classification disks $W_k = (c_W, \\rho_W)$ for each character class $k$. The final logit score $D_k$ is the combined negated dimension path losses: $D_k = -\\max_d(L_d(H_d, W_{k,d}))$ or $D_k = -\\text{avg}_d(L_d(H_d, W_{k,d}))$, depending on the aggregation mode.  \n\n    The path loss $L_d$ in dimension $d$ is:  \n    $L_d(H_d, W_{k,d}) = |\\rho_W - d_{cen}| + d_{cen} - \\rho_H \\quad \\text{where } d_{cen} = -\\nu_p(c_H - c_W)$.",
      step3: "3. **Affinoid Softmax**: Compute class probabilities using standard softmax scaled by temperature $\\beta$: $\\pi_k = \\frac{e^{\\beta D_k}}{\\sum_j e^{\\beta D_j}}$"
    },
    ngram: {
      step1: "1. **Embedding Lookup**: Context characters $x_1, \\dots, x_N$ are mapped to embedding disks $E[x_j]_d = (c_j, \\rho_j) \\in \\Gamma_p^d$.",
      step2: "2. **Context Aggregation**: Context embeddings are combined into an aggregated hidden disk $H_d = (c_H, \\rho_H)$ using $p^{-j}$ positional scaling (older history is shifted deeper):  \n$c_H = \\sum_{j=1}^N c_j p^{-j}$, $\\rho_H = \\max_{j=1}^N (\\rho_j - j)$ clamped to $[-2, 2]$.",
      step3: "3. **Affinoid Projection**: We project $H = (c_H, \\rho_H)$ against learned target classification disks $W_k = (c_W, \\rho_W)$ for each character class $k$. The final logit score $D_k$ is the combined negated dimension path losses: $D_k = -\\max_d(L_d(H_d, W_{k,d}))$ or $D_k = -\\text{avg}_d(L_d(H_d, W_{k,d}))$, depending on the aggregation mode.  \n\n    The path loss $L_d$ in dimension $d$ is:  \n    $L_d(H_d, W_{k,d}) = |\\rho_W - d_{cen}| + d_{cen} - \\rho_H \\quad \\text{where } d_{cen} = -\\nu_p(c_H - c_W)$.",
      step4: "4. **Affinoid Softmax**: Applies standard softmax scaled by temperature $\\beta$ to obtain final class probabilities:  \n$\\pi_k = \\frac{e^{\\beta D_k}}{\\sum_j e^{\\beta D_j}}$:"
    },
    padicLinear: {
      step1: "1. **Embedding Constants**: The single context character is mapped to its fixed p-adic base-$P$ digits constant $X_c$.",
      step2: "2. **Linear Transformation**: $Y = X_c \\cdot M + B$. The projection loss is computed between $Y$ and the fixed target constants $C_k$: $D_k = -\\max_d(L_d(Y_d, C_{k,d}))$.",
      step3: "3. **Affinoid Softmax**: Compute class probabilities using standard softmax scaled by temperature $\\beta$: $\\pi_k = \\frac{e^{\\beta D_k}}{\\sum_j e^{\\beta D_j}}$"
    },
    euclidean: {
      step1: "1. **Embedding Lookup**: For context characters $x_1, \\dots, x_N$, we look up their embedding vectors $E[x_i] \\in \\mathbb{R}^d$.",
      step2: "2. **Average Pooling**: Aggregates embeddings using mean pooling: $H = \\frac{1}{N} \\sum_{i=1}^N E[x_i]$:",
      step3: "3. **Linear Logits**: Compute scores (logits) for each alphabet class $k$ using weights $W_k$ and bias $b_k$:  \n$S_k = b_k + H \\cdot W_k$:",
      step4: "4. **Standard Softmax**: Propagate probabilities using the Standard Softmax:  \n$\\pi_k = \\frac{e^{\\beta S_k}}{\\sum_j e^{\\beta S_j}}$:"
    }
  };
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Configurable Parameters (Signals)
  readonly textInput = signal<string>("the cat sat on the mat");

  readonly approach = signal<
    | 'berkovich-bigram'
    | 'berkovich-ngram'
    | 'berkovich-bigram-bias'
    | 'affinoid-ngram'
    | 'tropical-mlp'
    | 'berkovich-attention'
    | 'euclidean-ngram'
    | 'padic-linear'
  >('berkovich-bigram');
  readonly modelConfigValues = signal<Record<string, any>>({});
  
  readonly prime = computed(() => this.modelConfigValues()['prime'] ?? 3);
  readonly contextLength = computed(() => this.modelConfigValues()['contextLength'] ?? 1); 
  readonly embDim = computed(() => this.modelConfigValues()['embDim'] ?? 5);
  readonly learningRate = computed(() => this.modelConfigValues()['lr'] ?? 0.01);
  readonly regularizationTarget = computed(() => this.modelConfigValues()['reg'] ?? 0.04);
  readonly regularizationEmbed = computed(() => this.modelConfigValues()['regEmbed'] ?? 0.02);
  
  readonly digitsLeft = computed(() => this.modelConfigValues()['digitsLeft'] ?? 2);
  readonly digitsRight = computed(() => this.modelConfigValues()['digitsRight'] ?? 2);
  readonly activePopup = signal<string | null>(null);

  togglePopup(id: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.activePopup() === id) {
      this.activePopup.set(null);
    } else {
      this.activePopup.set(id);
    }
  }

  parseNumberInput(value: string): number {
    const normalized = value.replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }
  readonly aggMode = computed<'min' | 'average'>(() => this.modelConfigValues()['aggMode'] ?? 'min');
  readonly beta = computed<number>(() => this.modelConfigValues()['beta'] ?? 1.0);
  readonly batchSize = signal<number>(128);
  readonly trainingSpeed = signal<number>(100);
  readonly valMode = signal<'fixed' | 'random' | 'overlap'>('fixed');
  readonly valSizeOverlap = signal<number>(10);
  readonly valPercentageHoldout = signal<number>(0.2);
  readonly effectiveValidationSize = computed(() => {
    const text = this.textInput();
    const mode = this.valMode();
    if (mode === 'overlap') {
      return Math.min(this.valSizeOverlap(), text.length);
    } else {
      const pct = this.valPercentageHoldout();
      return Math.max(1, Math.floor(text.length * pct));
    }
  });
  readonly randomValIndices = signal<Set<number>>(new Set());

  readonly initialLoss = signal<number | null>(null);
  readonly initialAccuracy = signal<number | null>(null);
  readonly baselineMetrics = signal<{
    trainLoss: number;
    trainAcc: number;
    valLoss: number;
    valAcc: number;
  } | null>(null);

  readonly walkthroughInput = signal<string>('');
  readonly lastValidWalkthroughInput = signal<string>('');
  readonly walkthroughInputError = signal<string | null>(null);

  validateContext(input: string): string | null {
    if (!input || input.trim() === '') {
      return 'Context cannot be empty.';
    }
    const vocab = this.vocab();
    for (const char of input) {
      if (vocab.indexOf(char) === -1) {
        const displayChar = char === ' ' ? 'space' : char === '\n' ? '\\n' : char;
        return `Character '${displayChar}' is not present in the vocabulary.`;
      }
    }
    return null;
  }

  onWalkthroughInputChange(newVal: string) {
    this.walkthroughInput.set(newVal);
    const error = this.validateContext(newVal);
    this.walkthroughInputError.set(error);
    if (!error) {
      this.lastValidWalkthroughInput.set(newVal);
    }
  }

  readonly walkthroughDetails = computed<WalkthroughDetails | null>(() => {
    const input = this.lastValidWalkthroughInput();
    const approach = this.approach();
    const vocab = this.vocab();
    const N = this.contextLength();
    const p = this.prime();
    const bModel = this.berkovichModel();
    const eModel = this.euclideanModel();
    const beta = this.beta();

    if (!input) return null;

    // Use at most the last N characters as context
    const contextText = input.slice(Math.max(0, input.length - N));
    // Pad to context length N if typed text is too short
    const paddedContext = contextText.padStart(N, vocab[0] || ' ');
    const preText = input.length > N ? input.slice(0, input.length - N) : '';

    const contextIndices = [...paddedContext].map(c => {
      const idx = vocab.indexOf(c);
      return idx === -1 ? 0 : idx;
    });

    if (approach !== 'euclidean-ngram' && bModel) {
      const dims = bModel.embDim;
      
      // Step 1: Embeddings Lookup
      const embeddings = [];
      for (let j = 0; j < N; j++) {
        const charIdx = contextIndices[j];
        const char = paddedContext[j];
        const charEmbeds = [];
        for (let d = 0; d < dims; d++) {
          charEmbeds.push({
            dim: d,
            center: { ...bModel.E[charIdx][d].center },
            rho: bModel.E[charIdx][d].rho,
            val: undefined as number | undefined
          });
        }
        embeddings.push({ char, charIdx, embeds: charEmbeds });
      }

      // Step 2: Context Aggregation
      const config = {
        lr: 0,
        reg: 0,
        regEmbed: 0,
        aggMode: this.aggMode(),
        beta: beta,
        ...this.modelConfigValues()
      };
      const fwd = bModel.forward(contextIndices, config as any);
      const aggregated = [];
      for (let d = 0; d < dims; d++) {
        aggregated.push({
          dim: d,
          center: { ...fwd.H[d].center },
          rho: fwd.H[d].rho,
          val: undefined as number | undefined
        });
      }

      // Step 3: Projection & Scores
      const scores = [];
      for (let k = 0; k < vocab.length; k++) {
        const char = vocab[k];
        const dimDists: number[] = [];
        const dimDetails = [];
        for (let d = 0; d < dims; d++) {
          dimDists.push(fwd.dists[k][d]);
          dimDetails.push({
            dim: d,
            contextCenter: { ...fwd.H[d].center },
            contextRho: fwd.H[d].rho,
            constraintCenter: { ...bModel.W[k][d].center },
            constraintRho: bModel.W[k][d].rho,
            dist: fwd.dists[k][d],
            loss: fwd.pathLosses[k][d]
          });
        }
        const finalScore = fwd.logits[k];
        const biasVal = (bModel as any).b ? (bModel as any).b[k] : undefined;
        scores.push({
          char,
          classIdx: k,
          dimDists,
          finalScore,
          bias: biasVal,
          dimDetails
        });
      }
      const sortedScores = [...scores].sort((a, b) => b.finalScore - a.finalScore);

      // Step 4: Softmax predictions
      const probs = [...fwd.probs];
      const expScores = fwd.logits.map(score => Math.exp(beta * score));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      const predictions = probs.map((prob, idx) => ({
        char: vocab[idx],
        prob,
        score: fwd.logits[idx],
        expScore: expScores[idx]
      })).sort((a, b) => b.prob - a.prob);

      return {
        type: 'berkovich',
        contextText: paddedContext,
        preText: preText,
        embeddings,
        aggregated,
        scores: sortedScores,
        predictions: predictions.slice(0, 5),
        sumExp
      };

    } else if (approach === 'padic-linear' && this.padicLinearModel()) {
      const pModel = this.padicLinearModel()!;
      const dims = pModel.embDim;
      
      const config: BerkovichConfig = { lr: 0, reg: 0, regEmbed: 0, aggMode: this.aggMode(), beta: beta };
      const fwd = pModel.forward(contextIndices, config);

      // Extract embeddings mapped directly from fixed constants C
      const embeddings = [];
      const charIdx = contextIndices[N - 1]; // Only looks at immediate previous character
      const char = paddedContext[N - 1];
      const charEmbeds = [];
      for (let d = 0; d < dims; d++) {
        charEmbeds.push({
          dim: d,
          center: { ...pModel.C[charIdx][d] },
          rho: Infinity, // Type I points have infinite log-radius
          val: undefined
        });
      }
      embeddings.push({ char, charIdx, embeds: charEmbeds });

      // Step 3: Distance from Y to Target Points C_k
      const scores = [];
      for (let k = 0; k < vocab.length; k++) {
        const targetChar = vocab[k];
        const dimDetails = [];
        for (let d = 0; d < dims; d++) {
          dimDetails.push({
            dim: d,
            contextCenter: { ...fwd.H[d].center }, // Y disk center
            contextRho: fwd.H[d].rho,              // Y disk log-radius
            constraintCenter: { ...pModel.C[k][d] }, // Target class point
            constraintRho: Infinity,               // Target class is Type I leaf
            dist: fwd.dists[k][d],
            loss: fwd.pathLosses[k][d]
          });
        }
        scores.push({
          char: targetChar,
          classIdx: k,
          finalScore: fwd.logits[k],
          dimDetails
        });
      }
      const sortedScores = [...scores].sort((a, b) => b.finalScore - a.finalScore);

      const probs = [...fwd.probs];
      const expScores = fwd.logits.map(score => Math.exp(beta * score));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      const predictions = probs.map((prob, idx) => ({
        char: vocab[idx],
        prob,
        score: fwd.logits[idx],
        expScore: expScores[idx]
      })).sort((a, b) => b.prob - a.prob);

      return {
        type: 'berkovich',
        contextText: paddedContext,
        preText: preText,
        embeddings,
        aggregated: [],
        scores: sortedScores,
        predictions: predictions.slice(0, 5),
        sumExp
      };
    } else if (eModel) {
      const dims = eModel.embDim;

      // Step 1: Embeddings Lookup
      const embeddings = [];
      for (let j = 0; j < N; j++) {
        const charIdx = contextIndices[j];
        const char = paddedContext[j];
        const charEmbeds = [];
        for (let d = 0; d < dims; d++) {
          charEmbeds.push({
            dim: d,
            center: undefined as { num: bigint; den: bigint } | undefined,
            rho: undefined as number | undefined,
            val: eModel.E[charIdx][d]
          });
        }
        embeddings.push({ char, charIdx, embeds: charEmbeds });
      }

      // Step 2: Average Pooling
      const fwd = eModel.forward(contextIndices);
      const aggregated = [];
      for (let d = 0; d < dims; d++) {
        aggregated.push({
          dim: d,
          center: undefined as { num: bigint; den: bigint } | undefined,
          rho: undefined as number | undefined,
          val: fwd.H[d]
        });
      }

      // Step 3: Class Scores (Logits)
      const scores = [];
      for (let k = 0; k < vocab.length; k++) {
        const char = vocab[k];
        let logit = eModel.biases[k];
        const dimDetails = [];
        for (let d = 0; d < dims; d++) {
          const product = fwd.H[d] * eModel.W[d][k];
          logit += product;
          dimDetails.push({
            dim: d,
            contextVal: fwd.H[d],
            weightVal: eModel.W[d][k],
            product
          });
        }
        scores.push({
          char,
          classIdx: k,
          finalScore: logit,
          bias: eModel.biases[k],
          dimDetails
        });
      }
      const sortedScores = [...scores].sort((a, b) => b.finalScore - a.finalScore);

      // Step 4: Softmax predictions
      const probs = [...fwd.probs];
      const expScores = fwd.logits.map((score: number) => Math.exp(beta * score));
      const sumExp = expScores.reduce((a: number, b: number) => a + b, 0);
      const predictions = probs.map((prob, idx) => ({
        char: vocab[idx],
        prob,
        score: fwd.logits[idx],
        expScore: expScores[idx]
      })).sort((a, b) => b.prob - a.prob);

      return {
        type: 'euclidean',
        contextText: paddedContext,
        preText: preText,
        embeddings,
        aggregated,
        scores: sortedScores,
        predictions: predictions.slice(0, 5),
        sumExp
      };
    }

    return null;
  });



  readonly dimensions = computed(() => Array.from({ length: this.embDim() }, (_, i) => i));

  // Model & Training State
  readonly berkovichModel = signal<BerkovichCharLearnerBase | null>(null);
  readonly euclideanModel = signal<EuclideanCharLearner | null>(null);
  readonly padicLinearModel = signal<PadicLinearCharLearner | null>(null);
  readonly affinoidNgramModel = signal<AffinoidNgramCharLearner | null>(null);
  readonly tropicalMlpModel = signal<TropicalMlpCharLearner | null>(null);
  
  readonly activeModel = computed(() => {
    const app = this.approach();
    if (app === 'euclidean-ngram') return this.euclideanModel();
    if (app === 'padic-linear') return this.padicLinearModel();
    if (app === 'affinoid-ngram') return this.affinoidNgramModel();
    if (app === 'tropical-mlp') return this.tropicalMlpModel();
    return this.berkovichModel();
  });

  readonly configDefs = computed<ConfigFieldDef[]>(() => {
    return this.getConfigDefsForApproach(this.approach());
  });

  getConfigDefsForApproach(app: string): ConfigFieldDef[] {
    if (app === 'euclidean-ngram') {
      return [
        { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
        { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
        { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 }
      ];
    }
    if (app === 'padic-linear') {
      return [
        { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
        { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
        { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
        { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 }
      ];
    }
    if (app === 'affinoid-ngram') {
      return [
        { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
        { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
        { key: 'numConstraints', label: 'Constraints', kind: ConfigFieldType.Number, description: 'Number of target classification constraints per class', defaultValue: 3, requiresRebuild: true },
        { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
        { key: 'reg', label: 'Constraint Reg.', kind: ConfigFieldType.Number, description: 'Regularization on target log-radius', defaultValue: 0.04, step: 0.01 },
        { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 }
      ];
    }
    if (app === 'tropical-mlp') {
      return [
        { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
        { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
        { key: 'hiddenDim', label: 'Hidden Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the hidden layer', defaultValue: 8, requiresRebuild: true },
        { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
        { key: 'reg', label: 'Weight Reg.', kind: ConfigFieldType.Number, description: 'Regularization on weights log-radius', defaultValue: 0.01, step: 0.005 },
        { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 }
      ];
    }
    if (app === 'berkovich-bigram-bias') {
      return [
        { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
        { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
        { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
        { key: 'reg', label: 'Constraint Reg.', kind: ConfigFieldType.Number, description: 'Regularization on target log-radius', defaultValue: 0.04, step: 0.01 },
        { key: 'regEmbed', label: 'Embed Reg.', kind: ConfigFieldType.Number, description: 'Regularization on embedding log-radius', defaultValue: 0.02, step: 0.01 },
        { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 },
        { key: 'aggMode', label: 'Agg. Mode', kind: ConfigFieldType.Select, description: 'How to aggregate dimension distances', defaultValue: 'min', options: [{ value: 'min', label: 'Min Distance' }, { value: 'average', label: 'Average Distance' }] },
        { key: 'digitsLeft', label: 'Digits (Left)', kind: ConfigFieldType.Number, description: 'P-adic digits to the left of the point', defaultValue: 2, min: 0 },
        { key: 'digitsRight', label: 'Digits (Right)', kind: ConfigFieldType.Number, description: 'P-adic digits to the right of the point', defaultValue: 2, min: 0 }
      ];
    }
    if (app === 'berkovich-attention') {
      return [
        { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
        { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
        { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
        { key: 'reg', label: 'Constraint Reg.', kind: ConfigFieldType.Number, description: 'Regularization on target log-radius', defaultValue: 0.04, step: 0.01 },
        { key: 'regEmbed', label: 'Embed Reg.', kind: ConfigFieldType.Number, description: 'Regularization on embedding log-radius', defaultValue: 0.02, step: 0.01 },
        { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 },
        { key: 'aggMode', label: 'Agg. Mode', kind: ConfigFieldType.Select, description: 'How to aggregate dimension distances', defaultValue: 'min', options: [{ value: 'min', label: 'Min Distance' }, { value: 'average', label: 'Average Distance' }] },
        { key: 'digitsLeft', label: 'Digits (Left)', kind: ConfigFieldType.Number, description: 'P-adic digits to the left of the point', defaultValue: 2, min: 0 },
        { key: 'digitsRight', label: 'Digits (Right)', kind: ConfigFieldType.Number, description: 'P-adic digits to the right of the point', defaultValue: 2, min: 0 }
      ];
    }
    if (app === 'berkovich-ngram') {
      return [
        { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
        { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
        { key: 'contextLength', label: 'Context Length', kind: ConfigFieldType.Number, description: 'Number of history characters to use', defaultValue: 3, requiresRebuild: true },
        { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
        { key: 'reg', label: 'Constraint Reg.', kind: ConfigFieldType.Number, description: 'Regularization on target log-radius', defaultValue: 0.04, step: 0.01 },
        { key: 'regEmbed', label: 'Embed Reg.', kind: ConfigFieldType.Number, description: 'Regularization on embedding log-radius', defaultValue: 0.02, step: 0.01 },
        { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 },
        { key: 'aggMode', label: 'Agg. Mode', kind: ConfigFieldType.Select, description: 'How to aggregate dimension distances', defaultValue: 'min', options: [{ value: 'min', label: 'Min Distance' }, { value: 'average', label: 'Average Distance' }] },
        { key: 'digitsLeft', label: 'Digits (Left)', kind: ConfigFieldType.Number, description: 'P-adic digits to the left of the point', defaultValue: 2, min: 0 },
        { key: 'digitsRight', label: 'Digits (Right)', kind: ConfigFieldType.Number, description: 'P-adic digits to the right of the point', defaultValue: 2, min: 0 }
      ];
    }
    // Default is berkovich-bigram
    return [
      { key: 'prime', label: 'Prime (p)', kind: ConfigFieldType.Number, description: 'The prime base for the p-adic space', defaultValue: 3, requiresRebuild: true },
      { key: 'embDim', label: 'Embedding Dim', kind: ConfigFieldType.Number, description: 'Number of dimensions in the embedding space', defaultValue: 5, requiresRebuild: true },
      { key: 'lr', label: 'Learning Rate', kind: ConfigFieldType.Number, description: 'Step size for updates', defaultValue: 0.01, step: 0.001 },
      { key: 'reg', label: 'Constraint Reg.', kind: ConfigFieldType.Number, description: 'Regularization on target log-radius', defaultValue: 0.04, step: 0.01 },
      { key: 'regEmbed', label: 'Embed Reg.', kind: ConfigFieldType.Number, description: 'Regularization on embedding log-radius', defaultValue: 0.02, step: 0.01 },
      { key: 'beta', label: 'Softmax Beta', kind: ConfigFieldType.Number, description: 'Temperature scaling for softmax', defaultValue: 1.0, step: 0.1 },
      { key: 'aggMode', label: 'Agg. Mode', kind: ConfigFieldType.Select, description: 'How to aggregate dimension distances', defaultValue: 'min', options: [{ value: 'min', label: 'Min Distance' }, { value: 'average', label: 'Average Distance' }] },
      { key: 'digitsLeft', label: 'Digits (Left)', kind: ConfigFieldType.Number, description: 'P-adic digits to the left of the point', defaultValue: 2, min: 0 },
      { key: 'digitsRight', label: 'Digits (Right)', kind: ConfigFieldType.Number, description: 'P-adic digits to the right of the point', defaultValue: 2, min: 0 }
    ];
  }
  
  readonly stepCount = signal<number>(0);
  readonly epochCount = signal<number>(0);
  
  readonly currentTrainLoss = signal<number>(0.0);
  readonly currentTrainAccuracy = signal<number>(0.0);
  readonly currentValLoss = signal<number>(0.0);
  readonly currentValAccuracy = signal<number>(0.0);
  readonly recentPredictions = signal<PredictionLog[]>([]);

  readonly sortedRecentPredictions = computed<PredictionLog[]>(() => {
    return [...this.recentPredictions()].sort((a, b) => {
      const inputCompare = a.input.localeCompare(b.input);
      if (inputCompare !== 0) return inputCompare;
      return a.preText.localeCompare(b.preText);
    });
  });

  readonly validationPredictions = computed<PredictionLog[]>(() => {
    this.stepCount(); // Force recalculation on every training step
    const bModel = this.berkovichModel();
    const eModel = this.euclideanModel();
    const pModel = this.padicLinearModel();
    const samples = this.getValidationSamples();

    if (samples.length === 0) {
      return [];
    }

    const mode = this.aggMode();
    const temp = this.beta();
    const vocab = this.vocab();
    const results: PredictionLog[] = [];

    if (bModel && this.approach() !== 'padic-linear') {
      const config: BerkovichConfig = { lr: 0, reg: 0, regEmbed: 0, aggMode: mode, beta: temp };
      for (const sample of samples) {
        const fwd = bModel.forward(sample.contextIndices, config);
        const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
        const isCorrect = predIdx === sample.targetIdx;
        const loss = -Math.log(fwd.probs[sample.targetIdx] + 1e-15);

        results.push({
          preText: formatDisplayString(sample.preText),
          input: formatDisplayString(sample.contextText),
          pred: formatDisplayString(vocab[predIdx] || '?'),
          target: formatDisplayString(sample.targetChar),
          loss,
          correct: isCorrect
        });
      }
    } else if (pModel && this.approach() === 'padic-linear') {
      const config: BerkovichConfig = { lr: 0, reg: 0, regEmbed: 0, aggMode: mode, beta: temp };
      for (const sample of samples) {
        const fwd = pModel.forward(sample.contextIndices, config);
        const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
        const isCorrect = predIdx === sample.targetIdx;
        const loss = -Math.log(fwd.probs[sample.targetIdx] + 1e-15);

        results.push({
          preText: formatDisplayString(sample.preText),
          input: formatDisplayString(sample.contextText),
          pred: formatDisplayString(vocab[predIdx] || '?'),
          target: formatDisplayString(sample.targetChar),
          loss,
          correct: isCorrect
        });
      }
    } else if (eModel) {
      for (const sample of samples) {
        const fwd = eModel.forward(sample.contextIndices);
        const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
        const isCorrect = predIdx === sample.targetIdx;
        const loss = -Math.log(fwd.probs[sample.targetIdx] + 1e-15);

        results.push({
          preText: formatDisplayString(sample.preText),
          input: formatDisplayString(sample.contextText),
          pred: formatDisplayString(vocab[predIdx] || '?'),
          target: formatDisplayString(sample.targetChar),
          loss,
          correct: isCorrect
        });
      }
    }

    return results.slice(0, 15);
  });

  readonly sortedValidationPredictions = computed<PredictionLog[]>(() => {
    return [...this.validationPredictions()].sort((a, b) => {
      const inputCompare = a.input.localeCompare(b.input);
      if (inputCompare !== 0) return inputCompare;
      return a.preText.localeCompare(b.preText);
    });
  });

  readonly isInspectExpanded = signal<boolean>(false);
  readonly trainLossHistory = signal<number[]>([]);
  readonly trainAccuracyHistory = signal<number[]>([]);
  readonly valLossHistory = signal<number[]>([]);
  readonly valAccuracyHistory = signal<number[]>([]);

  readonly chartPoints = computed<NamedChartPoint[]>(() => {
    const tLossH = this.trainLossHistory();
    const tAccH = this.trainAccuracyHistory();
    const vLossH = this.valLossHistory();
    const vAccH = this.valAccuracyHistory();
    const points: NamedChartPoint[] = [];

    tLossH.forEach((val, index) => {
      points.push({
        x: index,
        y: val,
        name: 'Train Loss'
      });
    });

    vLossH.forEach((val, index) => {
      points.push({
        x: index,
        y: val,
        name: 'Val Loss'
      });
    });

    tAccH.forEach((val, index) => {
      points.push({
        x: index,
        y: val,
        name: 'Train Accuracy'
      });
    });

    vAccH.forEach((val, index) => {
      points.push({
        x: index,
        y: val,
        name: 'Val Accuracy'
      });
    });

    return points;
  });

  readonly chartConfig = computed<ChartConfig>(() => {
    const defaultConfig = defaultChartConfig();
    return {
      ...defaultConfig,
      width: 580,
      height: 280,
      marginLeft: 80,
      marginRight: 60,
      marginBottom: 80,
      xLabel: 'Step',
      yLabel: 'Loss',
      yTickFormat: '.2f',
      xTickFormat: 'd',
      legendX: 420,
      legendY: 10,
      rightYLabel: 'Accuracy',
      rightYLineNames: ['Train Accuracy', 'Val Accuracy'],
      rightYDomain: [0.0, 1.0],
    };
  });

  readonly chartBaselines = computed(() => {
    const b = this.baselineMetrics();
    if (!b) return [];
    return [
      { y: b.valLoss, name: 'Opt Val Loss', color: '#fca5a5', isRightAxis: false },
      { y: b.valAcc, name: 'Opt Val Acc', color: '#fcd34d', isRightAxis: true }
    ];
  });


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

  // Model parameters (visualized in tree)
  readonly activeModelParams = computed(() => {
    const bModel = this.berkovichModel();
    if (bModel) {
      return bModel.parameters;
    }
    const pModel = this.padicLinearModel();
    if (pModel) {
      return pModel.parameters;
    }
    return null;
  });

  constructor() {
    // Rebuild models and reset when config changes
    effect(() => {
      this.vocab();
      this.approach();
      this.prime();
      this.embDim();
      this.contextLength();
      this.valSizeOverlap();
      this.valPercentageHoldout();
      this.valMode();
      untracked(() => {
        this.resetWeights();
      });
    });

    // Sync to URL parameters when approach or modelConfigValues changes
    effect(() => {
      const approach = this.approach();
      const currentValues = this.modelConfigValues();
      const defs = this.configDefs();
      
      untracked(() => {
        const queryParams: Record<string, any> = {
          approach: approach
        };

        for (const def of defs) {
          const val = currentValues[def.key] !== undefined ? currentValues[def.key] : def.defaultValue;
          if (val !== def.defaultValue) {
            queryParams[def.key] = val;
          } else {
            queryParams[def.key] = null;
          }
        }

        // Compare with current URL params to avoid redundant navigation
        const currentUrlParams = this.route.snapshot.queryParams;
        let hasDiff = false;
        
        for (const key of Object.keys(queryParams)) {
          const newVal = queryParams[key];
          const oldVal = currentUrlParams[key];
          
          if (newVal === null) {
            if (oldVal !== undefined) {
              hasDiff = true;
              break;
            }
          } else {
            if (oldVal === undefined || String(newVal) !== String(oldVal)) {
              hasDiff = true;
              break;
            }
          }
        }

        if (!hasDiff) {
          for (const key of Object.keys(currentUrlParams)) {
            if (queryParams[key] === undefined) {
              hasDiff = true;
              break;
            }
          }
        }

        if (hasDiff) {
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams,
            queryParamsHandling: 'merge',
            replaceUrl: true
          });
        }
      });
    });

    // Auto-update walkthroughInput to match first validation predictions sample on load
    effect(() => {
      const preds = this.validationPredictions();
      if (preds.length > 0) {
        untracked(() => {
          const current = this.walkthroughInput();
          if (current === '') {
            const raw = preds[0].input.replace(/␣/g, ' ').replace(/\\n/g, '\n');
            this.walkthroughInput.set(raw);
            this.lastValidWalkthroughInput.set(raw);
          }
        });
      }
    });
  }

  ngOnInit(): void {
    // Sync from URL params on load / route changes
    this.route.queryParams.subscribe(params => {
      // 1. Sync approach
      if (params['approach'] && params['approach'] !== this.approach()) {
        this.approach.set(params['approach']);
      }

      // 2. Sync config values
      const defs = this.configDefs();
      const newConfigValues = { ...this.modelConfigValues() };
      let hasChanges = false;
      
      for (const def of defs) {
        const paramVal = params[def.key];
        if (paramVal !== undefined) {
          let val: any = paramVal;
          if (def.kind === ConfigFieldType.Number) {
            const parsed = parseFloat(paramVal);
            val = isNaN(parsed) ? def.defaultValue : parsed;
          }
          if (newConfigValues[def.key] !== val) {
            newConfigValues[def.key] = val;
            hasChanges = true;
          }
        } else {
          if (newConfigValues[def.key] !== undefined) {
            delete newConfigValues[def.key];
            hasChanges = true;
          }
        }
      }
      
      if (hasChanges) {
        this.modelConfigValues.set(newConfigValues);
      }
    });

    this.resetWeights();
  }

  ngOnDestroy(): void {
    this.pauseTraining();
  }

  setHoldoutMode() {
    if (this.valMode() === 'overlap') {
      this.valMode.set('fixed');
    }
  }

  toggleRandomHoldout() {
    if (this.valMode() === 'random') {
      this.valMode.set('fixed');
    } else {
      this.valMode.set('random');
    }
  }

  resetWalkthroughToValidation() {
    const preds = this.validationPredictions();
    if (preds.length > 0) {
      const rawInput = preds[0].input.replace(/␣/g, ' ').replace(/\\n/g, '\n');
      this.onWalkthroughInputChange(rawInput);
    }
  }

  formatDigits(r: Rational): string {
    return formatDigitSequence(r, BigInt(this.prime()));
  }

  formatDistance(d: number): string {
    return d === -Infinity ? '-∞' : d.toFixed(2);
  }

  isNegInfinity(val: number): boolean {
    return val === -Infinity;
  }

  onApproachChange(val: any) {
    this.approach.set(val);
    if (val === 'berkovich-bigram') {
      this.modelConfigValues.update(v => ({...v, contextLength: 1}));
    }
  }

  onModelConfigChange(event: { key: string; value: any; requiresRebuild: boolean }) {
    this.modelConfigValues.update(v => ({...v, [event.key]: event.value}));
    if (event.requiresRebuild) {
      this.resetWeights();
    }
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

  private generateValidationIndices() {
    const text = this.textInput();
    const N = this.contextLength();
    const valSize = this.effectiveValidationSize();
    const mode = this.valMode();

    const indices = new Set<number>();
    if (text.length <= valSize + N) {
      this.randomValIndices.set(indices);
      return;
    }

    if (mode === 'fixed') {
      const start = text.length - valSize - N;
      for (let i = 0; i < valSize; i++) {
        indices.add(start + i);
      }
    } else if (mode === 'random') {
      const maxIdx = text.length - N;
      const pool: number[] = [];
      for (let i = 0; i < maxIdx; i++) {
        pool.push(i);
      }
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = pool[i];
        pool[i] = pool[j];
        pool[j] = temp;
      }
      for (let i = 0; i < Math.min(valSize, pool.length); i++) {
        indices.add(pool[i]);
      }
    } else if (mode === 'overlap') {
      const start = text.length - valSize - N;
      for (let i = 0; i < valSize; i++) {
        indices.add(start + i);
      }
    }

    this.randomValIndices.set(indices);
  }

  private getValidationSamples(): { contextIndices: number[]; targetIdx: number; contextText: string; targetChar: string; preText: string }[] {
    const text = this.textInput();
    const vocab = this.vocab();
    const N = this.contextLength();
    const valIndices = this.randomValIndices();

    const samples = [];
    for (const idx of valIndices) {
      if (idx + N < text.length) {
        const contextText = text.slice(idx, idx + N);
        const targetChar = text[idx + N];
        const contextIndices = [...contextText].map(c => vocab.indexOf(c));
        const targetIdx = vocab.indexOf(targetChar);
        const preText = text.slice(Math.max(0, idx - 5), idx);

        if (targetIdx !== -1 && !contextIndices.includes(-1)) {
          samples.push({ contextIndices, targetIdx, contextText, targetChar, preText });
        }
      }
    }
    return samples;
  }

  evaluateValidation(): { loss: number; accuracy: number } {
    const activeM = this.activeModel();
    const samples = this.getValidationSamples();

    if (samples.length === 0 || !activeM) {
      return { loss: 0, accuracy: 0 };
    }

    const mode = this.aggMode();
    const temp = this.beta();

    let totalLoss = 0;
    let correctCount = 0;

    const config = {
      lr: 0,
      reg: 0,
      regEmbed: 0,
      aggMode: mode,
      beta: temp,
      ...this.modelConfigValues()
    };

    for (const sample of samples) {
      const fwd = (this.approach() === 'euclidean-ngram')
        ? (activeM as any).forward(sample.contextIndices)
        : activeM.forward(sample.contextIndices, config as any);

      totalLoss += -Math.log(fwd.probs[sample.targetIdx] + 1e-15);
      const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
      if (predIdx === sample.targetIdx) {
        correctCount++;
      }
    }

    return {
      loss: totalLoss / samples.length,
      accuracy: correctCount / samples.length
    };
  }

  resetWeights() {
    this.pauseTraining();
    this.stepCount.set(0);
    this.epochCount.set(0);
    this.textCursor = 0;
    this.recentPredictions.set([]);
    this.trainLossHistory.set([]);
    this.trainAccuracyHistory.set([]);
    this.valLossHistory.set([]);
    this.valAccuracyHistory.set([]);
    this.lastStepTargets.set({ embedding: {}, constraint: {} });
    this.baselineMetrics.set(null);

    this.padicLinearModel.set(null);
    this.berkovichModel.set(null);
    this.euclideanModel.set(null);
    this.affinoidNgramModel.set(null);
    this.tropicalMlpModel.set(null);
 
    const app = this.approach();
    if (app === 'euclidean-ngram') {
      const model = new EuclideanCharLearner(this.vocab(), this.embDim());
      this.euclideanModel.set(model);
    } else if (app === 'padic-linear') {
      try {
        const model = new PadicLinearCharLearner(this.vocab(), this.embDim(), this.prime());
        this.padicLinearModel.set(model);
      } catch (e: any) {
        console.error("Failed to initialize PadicLinearCharLearner:", e);
        this.padicLinearModel.set(null);
      }
    } else if (app === 'affinoid-ngram') {
      const numC = this.modelConfigValues()['numConstraints'] ?? 3;
      const model = new AffinoidNgramCharLearner(this.vocab(), this.embDim(), this.prime(), numC);
      this.affinoidNgramModel.set(model);
    } else if (app === 'tropical-mlp') {
      const hidden = this.modelConfigValues()['hiddenDim'] ?? 8;
      const model = new TropicalMlpCharLearner(this.vocab(), this.embDim(), this.prime(), hidden);
      this.tropicalMlpModel.set(model);
    } else if (app === 'berkovich-bigram-bias') {
      const model = new BerkovichBigramBiasCharLearner(this.vocab(), this.embDim(), this.prime());
      this.berkovichModel.set(model);
    } else if (app === 'berkovich-attention') {
      const model = new BerkovichAttentionCharLearner(this.vocab(), this.embDim(), this.prime());
      this.berkovichModel.set(model);
    } else if (app === 'berkovich-ngram') {
      const model = new BerkovichNgramCharLearner(this.vocab(), this.embDim(), this.prime());
      this.berkovichModel.set(model);
    } else {
      const model = new BerkovichBigramCharLearner(this.vocab(), this.embDim(), this.prime());
      this.berkovichModel.set(model);
    }

    const vocab = this.vocab();

    this.generateValidationIndices();

    const initialEval = this.evaluateValidation();
    this.initialLoss.set(initialEval.loss);
    this.initialAccuracy.set(initialEval.accuracy);

    // Evaluate initial training batch metrics at step 0
    let initialTrainLoss = initialEval.loss;
    let initialTrainAcc = initialEval.accuracy;
    const initialLogs: PredictionLog[] = [];
    const activeM = this.activeModel();

    if (activeM) {
      const bSize = this.batchSize();
      const savedCursor = this.textCursor;
      const savedEpoch = this.epochCount();
      const initialSamples: any[] = [];
      for (let b = 0; b < bSize; b++) {
        const sample = this.getNextSample();
        if (sample.targetIdx !== -1) {
          initialSamples.push(sample);
        }
      }
      
      // Restore cursor and epoch count so training doesn't start advanced!
      this.textCursor = savedCursor;
      this.epochCount.set(savedEpoch);

      if (initialSamples.length > 0) {
        let totalLoss = 0;
        let correctCount = 0;
        
        const mode = this.aggMode();
        const temp = this.beta();
        const config = {
          lr: 0,
          reg: 0,
          regEmbed: 0,
          aggMode: mode,
          beta: temp,
          ...this.modelConfigValues()
        };

        for (const sample of initialSamples) {
          const fwd = app !== 'euclidean-ngram' 
            ? (activeM.forward(sample.contextIndices, config as any) as any)
            : (activeM as EuclideanCharLearner).forward(sample.contextIndices);
          const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
          const isCorrect = predIdx === sample.targetIdx;
          const loss = -Math.log(fwd.probs[sample.targetIdx] + 1e-15);
          totalLoss += loss;
          if (isCorrect) correctCount++;

          initialLogs.push({
            preText: formatDisplayString(sample.preText),
            input: formatDisplayString(sample.contextText),
            pred: formatDisplayString(vocab[predIdx] || '?'),
            target: formatDisplayString(sample.targetChar),
            loss,
            correct: isCorrect
          });
        }
        
        initialTrainLoss = totalLoss / initialSamples.length;
        initialTrainAcc = correctCount / initialSamples.length;
        this.recentPredictions.set(initialLogs.slice(0, 15));
      }
    }

    this.currentTrainLoss.set(initialTrainLoss);
    this.currentTrainAccuracy.set(initialTrainAcc);
    this.currentValLoss.set(initialEval.loss);
    this.currentValAccuracy.set(initialEval.accuracy);

    // Seed histories with step 0
    this.trainLossHistory.set([initialTrainLoss]);
    this.trainAccuracyHistory.set([initialTrainAcc]);
    this.valLossHistory.set([initialEval.loss]);
    this.valAccuracyHistory.set([initialEval.accuracy]);

    // Auto-compute baseline limits on reset
    this.computeBaselineLimits();
  }

  computeBaselineLimits() {
    const text = this.textInput();
    const vocab = this.vocab();
    const N = this.contextLength();
    const valIndices = this.randomValIndices();
    const valM = this.valMode();

    // 1. Find all active training index positions
    const trainIndices: number[] = [];
    for (let i = 0; i < text.length - N; i++) {
      if (valM === 'overlap' || !valIndices.has(i)) {
        trainIndices.push(i);
      }
    }

    if (trainIndices.length === 0) {
      this.baselineMetrics.set(null);
      return;
    }

    // 2. Compute empirical frequencies from training indices
    const counts = new Map<string, Map<string, number>>();
    const totals = new Map<string, number>();

    for (const idx of trainIndices) {
      const context = text.slice(idx, idx + N);
      const target = text[idx + N];

      if (!counts.has(context)) {
        counts.set(context, new Map<string, number>());
        totals.set(context, 0);
      }
      const charCounts = counts.get(context)!;
      charCounts.set(target, (charCounts.get(target) ?? 0) + 1);
      totals.set(context, totals.get(context)! + 1);
    }

    // 3. Evaluate on training samples
    let trainLossSum = 0;
    let trainCorrect = 0;
    let trainSampleCount = 0;

    for (const idx of trainIndices) {
      const context = text.slice(idx, idx + N);
      const target = text[idx + N];
      trainSampleCount++;

      const charCounts = counts.get(context)!;
      const total = totals.get(context)!;
      const targetCount = charCounts.get(target) ?? 0;
      const prob = targetCount / total;

      trainLossSum += -Math.log(prob + 1e-15);

      let maxChar = '';
      let maxCount = -1;
      for (const [char, count] of charCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          maxChar = char;
        }
      }
      if (maxChar === target) {
        trainCorrect++;
      }
    }

    // 4. Evaluate on validation samples (using getValidationSamples)
    const valSamples = this.getValidationSamples();
    let valLossSum = 0;
    let valCorrect = 0;

    const V = vocab.length;

    for (const sample of valSamples) {
      const context = sample.contextText;
      const target = sample.targetChar;

      const charCounts = counts.get(context);
      if (charCounts && totals.has(context)) {
        const total = totals.get(context)!;
        const targetCount = charCounts.get(target) ?? 0;
        const prob = targetCount / total;
        valLossSum += -Math.log(prob + 1e-15);

        // Find argmax
        let maxChar = '';
        let maxCount = -1;
        for (const [char, count] of charCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            maxChar = char;
          }
        }
        if (maxChar === target) {
          valCorrect++;
        }
      } else {
        const prob = 1 / V;
        valLossSum += -Math.log(prob);
        if (target === vocab[0]) {
          valCorrect++;
        }
      }
    }

    this.baselineMetrics.set({
      trainLoss: trainSampleCount > 0 ? trainLossSum / trainSampleCount : 0,
      trainAcc: trainSampleCount > 0 ? trainCorrect / trainSampleCount : 0,
      valLoss: valSamples.length > 0 ? valLossSum / valSamples.length : 0,
      valAcc: valSamples.length > 0 ? valCorrect / valSamples.length : 0
    });
  }


  // Visual helper in cells
  formatCenter(c: Rational): string {
    return formatDigitSequence(c, BigInt(this.prime()));
  }

  // Get sequential training sample
  private getNextSample(): { contextIndices: number[]; targetIdx: number; contextText: string; targetChar: string; preText: string } {
    const text = this.textInput();
    const vocab = this.vocab();
    const N = this.contextLength();
    const valMode = this.valMode();
    const valIndices = this.randomValIndices();

    if (text.length <= N) {
      return { contextIndices: [], targetIdx: -1, contextText: '', targetChar: '', preText: '' };
    }

    let attempts = 0;
    const maxAttempts = text.length;
    while (attempts < maxAttempts) {
      if (this.textCursor + N >= text.length) {
        this.textCursor = 0;
        this.epochCount.update(e => e + 1);
      }

      const isValIndex = valIndices.has(this.textCursor);
      if (valMode === 'overlap' || !isValIndex) {
        break; // Found valid training index
      }

      this.textCursor++;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return { contextIndices: [], targetIdx: -1, contextText: '', targetChar: '', preText: '' };
    }

    const contextText = text.slice(this.textCursor, this.textCursor + N);
    const targetChar = text[this.textCursor + N];
    const preText = text.slice(Math.max(0, this.textCursor - 5), this.textCursor);

    const contextIndices = [...contextText].map(c => vocab.indexOf(c));
    const targetIdx = vocab.indexOf(targetChar);

    this.textCursor++;
    return { contextIndices, targetIdx, contextText, targetChar, preText };
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
    const samples: { contextIndices: number[]; targetIdx: number; contextText: string; targetChar: string; preText: string }[] = [];
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

    const activeM = this.activeModel();

    if (bMode !== 'euclidean-ngram' && activeM) {
      // Train batch on Berkovich or PadicLinear model
      const config = {
        lr,
        reg: regT,
        regEmbed: regE,
        aggMode: mode,
        beta: temp,
        ...this.modelConfigValues()
      };
      const batchResult = activeM.trainBatch(samples, config as any);
      avgLoss = batchResult.loss;
      avgAcc = batchResult.accuracy;

      // Generate logs using the updated model for the UI list
      for (const sample of samples) {
        const fwd = activeM.forward(sample.contextIndices, config as any) as any;
        const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
        const isCorrect = predIdx === sample.targetIdx;
        const loss = -Math.log(fwd.probs[sample.targetIdx] + 1e-15);

        logs.push({
          preText: formatDisplayString(sample.preText),
          input: formatDisplayString(sample.contextText),
          pred: formatDisplayString(vocab[predIdx] || '?'),
          target: formatDisplayString(sample.targetChar),
          loss,
          correct: isCorrect
        });
      }

      // Record the targets for introspect displaying for the very last sample in the batch
      // (Only supported for standard Berkovich parameter tree shapes `E` and `W`)
      if (bModel) {
        const lastSample = samples[samples.length - 1];
        this.updateIntrospectTargets(lastSample.contextIndices, lastSample.targetIdx, bModel);
      }

    } else if (eModel) {
      // Train batch on Euclidean model
      const config: EuclideanConfig = { lr, reg: regT };
      const batchResult = eModel.trainBatch(samples, config);
      avgLoss = batchResult.loss;
      avgAcc = batchResult.accuracy;

      for (const sample of samples) {
        const fwd = eModel.forward(sample.contextIndices);
        const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
        const isCorrect = predIdx === sample.targetIdx;
        const loss = -Math.log(fwd.probs[sample.targetIdx] + 1e-15);

        logs.push({
          preText: formatDisplayString(sample.preText),
          input: formatDisplayString(sample.contextText),
          pred: formatDisplayString(vocab[predIdx] || '?'),
          target: formatDisplayString(sample.targetChar),
          loss,
          correct: isCorrect
        });
      }
    }

    const valEval = this.evaluateValidation();
    this.currentTrainLoss.set(avgLoss);
    this.currentTrainAccuracy.set(avgAcc);
    this.currentValLoss.set(valEval.loss);
    this.currentValAccuracy.set(valEval.accuracy);
    this.stepCount.update(s => s + 1);

    // Keep log limited to last 15 items
    this.recentPredictions.update(current => [
      ...logs.reverse(),
      ...current
    ].slice(0, 15));

    // Record the loss and accuracy history for chart plotting
    this.trainLossHistory.update(h => [...h, avgLoss]);
    this.trainAccuracyHistory.update(h => [...h, avgAcc]);
    this.valLossHistory.update(h => [...h, valEval.loss]);
    this.valAccuracyHistory.update(h => [...h, valEval.accuracy]);

    // Force refresh models reference to trigger UI bindings
    if (bModel) this.berkovichModel.set(bModel);
    if (eModel) this.euclideanModel.set(eModel);
    
    const pModel = this.padicLinearModel();
    if (pModel) this.padicLinearModel.set(pModel);

    const aModel = this.affinoidNgramModel();
    if (aModel) this.affinoidNgramModel.set(aModel);

    const tModel = this.tropicalMlpModel();
    if (tModel) this.tropicalMlpModel.set(tModel);
  }

  // Update target coordinates for introspector visualization
  private updateIntrospectTargets(contextIndices: number[], targetIdx: number, model: BerkovichCharLearnerBase) {
    const p = BigInt(this.prime());
    const N = contextIndices.length;
    const targets = this.lastStepTargets();

    const config = {
      lr: 0,
      reg: 0,
      regEmbed: 0,
      aggMode: this.aggMode(),
      beta: this.beta(),
      ...this.modelConfigValues()
    };
    const fwd = model.forward(contextIndices, config as any);

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
        const emb = model.E[charIdx][d];

        // check if this character was active in max-pool (rho_j - j == H_d.rho)
        if (Math.abs((emb.rho - j) - fwd.H[d].rho) < 1e-7) {
          let otherSum = { num: 0n, den: 1n };
          for (let l = 1; l <= N; l++) {
            if (l !== j) {
              const otherEmb = model.E[contextIndices[l - 1]][d];
              otherSum = add(otherSum, simplify({
                num: otherEmb.center.num,
                den: otherEmb.center.den * (p ** BigInt(l))
              }));
            }
          }
          const diff = subtract(model.W[targetIdx][d].center, otherSum);
          const targetCenter = simplify({
            num: diff.num * (p ** BigInt(j)),
            den: diff.den
          });
          const targetLogRadius = model.W[targetIdx][d].rho + j;

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
  onBerkovichLogRadiusChange(event: {newRho: number, type: 'embedding' | 'constraint', charIdx: number, dim: number}) {
    const model = this.berkovichModel();
    if (!model) return;
    if (event.type === 'embedding') {
      model.E[event.charIdx][event.dim].rho = event.newRho;
    } else {
      model.W[event.charIdx][event.dim].rho = event.newRho;
    }
    this.berkovichModel.set(model);
  }

  onPadicLinearLogRadiusChange(event: {newRho: number, type: 'M' | 'B', row: number, col?: number}) {
    const model = this.padicLinearModel();
    if (!model) return;
    if (event.type === 'M' && event.col !== undefined) {
      model.M[event.row][event.col].rho = event.newRho;
    } else {
      model.B[event.row].rho = event.newRho;
    }
    this.padicLinearModel.set(model);
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
