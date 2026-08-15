/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  effect,
  inject,
  untracked,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MarkdownComponent } from 'ngx-markdown';

import { BerkovichHeaderComponent } from '../berkovich-header/berkovich-header.component';
import { BerkovichDigitDisplayComponent } from '../berkovich-digit-display/berkovich-digit-display.component';
import {
  D3LineChartComponent,
  ChartConfig,
  defaultChartConfig,
  NamedChartPoint
} from '../../d3-line-chart/d3-line-chart.component';

import {
  BBool2Learner,
  BBool2Config,
  ALL_16_BOOLEAN_FUNCTIONS,
  BBool2FunctionInfo,
  buildDatasetFromTruthTable,
  BooleanSample,
  computeExactCoefficients
} from './models/b-bool2-learner';
import { BBool2TreeComponent } from './computation-tree/b-bool2-tree.component';
import { Rational, parsePadicOrRationalInput, simplify, formatRational } from '../../../lib/berkovich/berkovich';

export interface HeatmapPoint {
  x: number;
  y: number;
  prob1: number;
}

@Component({
  selector: 'app-b-bool2',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterModule,
    MarkdownComponent,
    BerkovichHeaderComponent,
    D3LineChartComponent,
    BBool2TreeComponent
  ],
  templateUrl: './b-bool2.component.html',
  styleUrls: ['./b-bool2.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closePopup()' }
})
export class BBool2Component implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private isInitialized = false;

  readonly formatCenter = formatRational;
  readonly all16Functions = ALL_16_BOOLEAN_FUNCTIONS;
  readonly selectedFunctionIndex = signal<number>(6); // Default: XOR (index 6)
  readonly selectedPreset = signal<'exact' | 'zero' | 'linear' | 'perturbed' | 'random' | null>('exact');
  readonly selectedRhoPreset = signal<'-2' | '-1' | '0' | '1' | 'random' | null>('-1');

  readonly truthTable = signal<[number, number, number, number]>([0, 1, 1, 0]);
  readonly dataset = computed<BooleanSample[]>(() => buildDatasetFromTruthTable(this.truthTable()));

  // Active popup for hyper-parameter info
  readonly activePopup = signal<string | null>(null);

  // Hyper-parameters & Presets
  readonly prime = signal<number>(2);
  readonly initialRho = signal<number>(-1.0);
  readonly learningRate = signal<number>(0.1);
  readonly regularization = signal<number>(0.01);
  readonly beta = signal<number>(2.5);
  readonly digitsLeft = signal<number>(3);
  readonly digitsRight = signal<number>(2);
  readonly trainingMode = signal<'berkovich' | 'padic'>('berkovich');
  readonly updateCenters = signal<boolean>(true);
  readonly updateRadii = signal<boolean>(true);

  // Selected sample for DAG walkthrough
  readonly activeSample = signal<[number, number]>([1, 1]);

  private readonly urlSyncEffect = effect(() => {
    if (!this.isInitialized) return;
    const fn = this.selectedFunctionIndex();
    const tt = this.truthTable();
    const p = this.prime();
    const mode = this.trainingMode();
    const lr = this.learningRate();
    const beta = this.beta();
    const dl = this.digitsLeft();
    const dr = this.digitsRight();
    const rho = this.initialRho();
    const preset = this.selectedPreset();
    const rhoPreset = this.selectedRhoPreset();
    const sample = this.activeSample();

    untracked(() => {
      const queryParams: Record<string, any> = {
        fn: fn === 6 ? null : fn,
        tt: tt.join('') === '0110' ? null : tt.join(''),
        p: p === 2 ? null : p,
        mode: mode === 'berkovich' ? null : mode,
        lr: lr === 0.1 ? null : lr,
        beta: beta === 2.5 ? null : beta,
        dl: dl === 3 ? null : dl,
        dr: dr === 2 ? null : dr,
        rho: rho === -1.0 ? null : rho,
        preset: preset === 'exact' ? null : preset,
        rhopreset: rhoPreset === '-1' ? null : rhoPreset,
        sample: sample[0] === 1 && sample[1] === 1 ? null : sample.join(',')
      };

      this.router.navigate([], {
        relativeTo: this.route,
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    });
  });

  readonly currentAverageRho = computed<number>(() => {
    this.trainTick();
    const l = this.learner();
    if (!l) return this.initialRho();
    return (l.b.rho + l.w1.rho + l.w2.rho + l.w3.rho) / 4;
  });

  isAllRhoNear(targetRho: number): boolean {
    this.trainTick();
    const l = this.learner();
    if (!l) return Math.abs(this.initialRho() - targetRho) < 0.05;
    return (
      Math.abs(l.b.rho - targetRho) < 0.05 &&
      Math.abs(l.w1.rho - targetRho) < 0.05 &&
      Math.abs(l.w2.rho - targetRho) < 0.05 &&
      Math.abs(l.w3.rho - targetRho) < 0.05
    );
  }

  setAllRho(rho: number) {
    this.initialRho.set(rho);
    const presetKey =
      Math.abs(rho - (-2)) < 0.05
        ? '-2'
        : Math.abs(rho - (-1)) < 0.05
        ? '-1'
        : Math.abs(rho - 0) < 0.05
        ? '0'
        : Math.abs(rho - 1) < 0.05
        ? '1'
        : null;
    this.selectedRhoPreset.set(presetKey);
    const l = this.ensureLearner();
    l.setAllRho(rho);
    this.trainTick.update((n) => n + 1);
  }

  setRandomRho() {
    this.stopAutoTrain();
    const l = this.ensureLearner();
    l.randomizeAllRho(-2.0, 1.0);
    this.selectedRhoPreset.set('random');
    this.trainTick.update((n) => n + 1);
  }

  // Model & State
  readonly learner = signal<BBool2Learner | null>(null);
  readonly stepCount = signal<number>(0);
  readonly isAutoTraining = signal<boolean>(false);
  private autoTrainInterval: any = null;

  readonly trainLossHistory = signal<NamedChartPoint[]>([]);
  readonly trainAccHistory = signal<NamedChartPoint[]>([]);
  readonly trainTick = signal<number>(0);

  readonly chartPoints = computed<NamedChartPoint[]>(() => {
    return [...this.trainLossHistory(), ...this.trainAccHistory()];
  });

  readonly chartConfig = computed<ChartConfig>(() => {
    const defaultConfig = defaultChartConfig();
    return {
      ...defaultConfig,
      height: 200,
      xLabel: 'Steps',
      yLabel: 'Loss',
      yTickFormat: '.2f',
      xTickFormat: 'd',
      legendX: 260,
      legendY: 10,
      rightYLabel: 'Accuracy',
      rightYLineNames: ['Train Accuracy'],
      rightYDomain: [0.0, 1.0]
    };
  });

  readonly modelConfig = computed<BBool2Config>(() => {
    return {
      prime: this.prime(),
      lr: this.learningRate(),
      reg: this.regularization(),
      beta: this.beta(),
      digitsLeft: this.digitsLeft(),
      digitsRight: this.digitsRight(),
      mode: this.trainingMode(),
      updateCenters: this.updateCenters(),
      updateRadii: this.trainingMode() === 'berkovich' && this.updateRadii()
    };
  });

  readonly currentFunctionInfo = computed<BBool2FunctionInfo>(() => {
    const idx = this.selectedFunctionIndex();
    return this.all16Functions[idx] || this.all16Functions[6];
  });

  readonly currentPredictions = computed(() => {
    this.trainTick();
    const l = this.learner();
    const data = this.dataset();
    const cfg = this.modelConfig();
    if (!l) return [];

    return data.map((sample) => {
      const fwd = l.forward(sample.inputs, cfg, sample.target);
      return {
        inputs: sample.inputs,
        target: sample.target,
        label: sample.label,
        pred: fwd.pred,
        prob1: fwd.probs[1],
        loss: fwd.loss,
        isCorrect: fwd.pred === sample.target,
        fwd
      };
    });
  });

  readonly currentAccuracy = computed(() => {
    const preds = this.currentPredictions();
    if (preds.length === 0) return 0;
    const correct = preds.filter((p) => p.isCorrect).length;
    return correct / preds.length;
  });

  readonly currentLoss = computed(() => {
    const preds = this.currentPredictions();
    if (preds.length === 0) return 0;
    const sum = preds.reduce((acc, p) => acc + p.loss, 0);
    return sum / preds.length;
  });

  readonly currentExactCoefficients = computed(() => {
    return computeExactCoefficients(this.truthTable());
  });

  // 2D Continuous Activation Heatmap Grid (16x16 sampling across [0, 1] x [0, 1])
  readonly heatmapGrid = computed<HeatmapPoint[]>(() => {
    this.trainTick();
    const l = this.learner();
    const cfg = this.modelConfig();
    if (!l) return [];

    const resolution = 16;
    const points: HeatmapPoint[] = [];

    for (let j = 0; j < resolution; j++) {
      const yVal = (resolution - 1 - j) / (resolution - 1); // y from 1 down to 0
      for (let i = 0; i < resolution; i++) {
        const xVal = i / (resolution - 1); // x from 0 to 1
        const fwd = l.forward([xVal, yVal], cfg, 0);
        points.push({
          x: xVal,
          y: yVal,
          prob1: fwd.probs[1]
        });
      }
    }
    return points;
  });

  getHeatmapCellColor(prob1: number): string {
    // Pure Black (0) to Pure White (1) grayscale:
    const v = Math.max(0, Math.min(255, Math.round(prob1 * 255)));
    return `rgb(${v}, ${v}, ${v})`;
  }

  readonly explainerMarkdown = `
### Multilinear Formulation in Berkovich Space: $f(x_1, x_2) = b + w_1 x_1 + w_2 x_2 + w_3 x_1 x_2$

Every two-variable Boolean function $g: \\{0, 1\\}^2 \\to \\{0, 1\\}$ can be represented as an exact **multilinear polynomial** (also called the Fourier or Walsh-Hadamard expansion over $\\mathbb{R}$ or $\\mathbb{Q}_p$):

$$f(x_1, x_2) = b + w_1 x_1 + w_2 x_2 + w_3 x_1 x_2$$

---

#### 1. Exact Multilinear Solutions for the 16 Circuits
Evaluating the system of 4 linear equations at the corners yields unique integer solutions:

* $g(0, 0) = b \\implies \\mathbf{b = g(0, 0)}$
* $g(1, 0) = b + w_1 \\implies \\mathbf{w_1 = g(1, 0) - g(0, 0)}$
* $g(0, 1) = b + w_2 \\implies \\mathbf{w_2 = g(0, 1) - g(0, 0)}$
* $g(1, 1) = b + w_1 + w_2 + w_3 \\implies \\mathbf{w_3 = g(1, 1) - g(1, 0) - g(0, 1) + g(0, 0)}$

**Key Examples:**
* **AND ($x_1 \\land x_2$):** $b=0, w_1=0, w_2=0, w_3=1 \\implies f(x) = x_1 x_2$
* **OR ($x_1 \\lor x_2$):** $b=0, w_1=1, w_2=1, w_3=-1 \\implies f(x) = x_1 + x_2 - x_1 x_2$
* **XOR ($x_1 \\oplus x_2$):** $b=0, w_1=1, w_2=1, w_3=-2 \\implies f(x) = x_1 + x_2 - 2 x_1 x_2$
* **XNOR ($\\neg(x_1 \\oplus x_2)$):** $b=1, w_1=-1, w_2=-1, w_3=2 \\implies f(x) = 1 - x_1 - x_2 + 2 x_1 x_2$

---

#### 2. Why $p$-adic Digits & Berkovich Disks?
In $p$-adic fields $\\mathbb{Q}_p$ (e.g. $p=2$):
* Negative numbers have infinite digit representations:
  * $-1 = \\dots 111_2 = \\sum_{k=0}^\\infty 2^k$
  * $-2 = \\dots 1110_2 = \\sum_{k=1}^\\infty 2^k$
* **Single Digit ($\\mathbb{F}_2$) vs Multi-Digit ($\\mathbb{Z}_2$):**
  * In a 1-digit field $\\mathbb{F}_2 = \\mathbb{Z}/2\\mathbb{Z}$, arithmetic is modulo 2 where $1 + 1 = 0 \\pmod 2$. In $\\mathbb{F}_2$, XOR is simply $x_1 + x_2$, but $-1 \\equiv 1 \\pmod 2$, conflating OR and XOR.
  * In $\\mathbb{Q}_2$ with 3–4 digits of precision (mod $2^3=8$ or $2^4=16$), $-1 \\equiv 7 \\pmod 8$ and $-2 \\equiv 6 \\pmod 8$, giving exact distinct values!
* **Berkovich Radius ($\\rho$):**
  * A Berkovich disk $(c, \\rho)$ represents a ball $\\bar{D}(c, p^\\rho)$.
  * When $\\rho$ is large (e.g. $\\rho=0$), higher digits are uncertain, allowing smooth gradient exploration across branches.
  * As gradient descent steps proceed, $\\rho$ shrinks (e.g. $\\rho \\to -2$), sharpening parameters to exact $p$-adic coordinates.

---

#### 3. How the % Probability Estimate ($P_1$) is Computed from Tree Path-Loss
In the **Target & Path Loss** node, the model evaluates how close the computed disk $f(x_1, x_2)$ is to target outputs $0 \\in \\mathbb{Q}_p$ and $1 \\in \\mathbb{Q}_p$:
1. **Tree Metric Distances:**
   Let $d_{\\text{tree}}(f, 0)$ and $d_{\\text{tree}}(f, 1)$ denote the ultrametric tree path distances on the Berkovich projective tree $\\mathbf{P}^1_{\\text{Berk}}(\\mathbb{Q}_p)$.
   If $f(x_1, x_2)$ and a target point share $k$ matching $p$-adic digits, their least common ancestor in the tree is at depth $k$, with geodesic path distance:
   $$d_{\\text{tree}}(f, y) = (\\rho_f - (-k)) + (\\rho_y - (-k)) = \\rho_f + \\rho_y + 2k$$
2. **Softmax Probabilities ($P_1$):**
   Using temperature parameter $\\beta$, logit energies $\\ell_0 = -d_{\\text{tree}}(f, 0)$ and $\\ell_1 = -d_{\\text{tree}}(f, 1)$ are converted to classification probabilities:
   $$P(y=1 \\mid x_1, x_2) = \\frac{e^{-\\beta \\cdot d_{\\text{tree}}(f, 1)}}{e^{-\\beta \\cdot d_{\\text{tree}}(f, 0)} + e^{-\\beta \\cdot d_{\\text{tree}}(f, 1)}} = \\frac{1}{1 + e^{\\beta (d_{\\text{tree}}(f, 1) - d_{\\text{tree}}(f, 0))}}$$
   * When $f(x_1, x_2)$ is closer to $1$ than $0$ in the tree ($d_{\\text{tree}}(f, 1) < d_{\\text{tree}}(f, 0)$), the probability $P(y=1)$ exceeds $50\\%$.
   * As parameter optimization aligns additional $p$-adic digits, $P(y=1)$ rapidly saturates to $100\\%$ (e.g. $95\\% - 99\\%$).

---

#### 4. Parameter Initializations & Why to Use Each

The **Parameter Presets & Actions** panel provides 5 canonical starting configurations:
* **Exact Target:** Calculates the exact Fourier/multilinear coefficients ($b, w_1, w_2, w_3$) directly from the truth table.
  * *Why use it:* Instantly test the ground-truth global optimum (100% accuracy, near-zero loss) and inspect the canonical $p$-adic digit expansions for this circuit.
* **Zero Init ($b=w_i=0$):** Sets all 4 parameters to $0 \\in \\mathbb{Q}_p$.
  * *Why use it:* Tests if gradient descent can discover the non-linear interaction term $w_3$ and linear weights starting from a completely blank baseline without prior bias.
* **Linear Only ($w_3 = 0$):** Sets linear weights ($b, w_1, w_2$) to their best linear values while freezing the interaction term $w_3 = 0$.
  * *Why use it:* Demonstrates the classical Minsky-Papert linear separability barrier on non-linear gates (e.g. XOR achieves at most 75% accuracy) and proves why the interaction term $w_3 x_1 x_2$ is mathematically required.
* **Perturbed:** Sets parameter centers to the exact algebraic solution but assigns a broad uncertainty radius ($\\rho = 0.0$).
  * *Why use it:* Visualizes how Berkovich disk radii soften the 2D decision boundary and observes how optimization contracts radii ($\\rho \\to -2$) into sharp discrete points.
* **Randomize:** Generates pseudo-random $p$-adic disks in $\\mathcal{B}(\\mathbb{Q}_p)$ across all parameters.
  * *Why use it:* Validates general optimization robustness, testing whether gradient descent reliably converges to 100% accuracy from arbitrary initial configurations.
`;

  ngOnInit(): void {
    const params = this.route.snapshot.queryParams;
    if (params['p']) {
      const p = +params['p'];
      if (!isNaN(p)) this.prime.set(p);
    }
    if (params['mode'] === 'padic' || params['mode'] === 'berkovich') {
      this.trainingMode.set(params['mode']);
    }
    if (params['lr']) {
      const lr = +params['lr'];
      if (!isNaN(lr)) this.learningRate.set(lr);
    }
    if (params['beta']) {
      const b = +params['beta'];
      if (!isNaN(b)) this.beta.set(b);
    }
    if (params['dl']) {
      const dl = +params['dl'];
      if (!isNaN(dl)) this.digitsLeft.set(dl);
    }
    if (params['dr']) {
      const dr = +params['dr'];
      if (!isNaN(dr)) this.digitsRight.set(dr);
    }
    if (params['rho']) {
      const rho = +params['rho'];
      if (!isNaN(rho)) this.initialRho.set(rho);
    }
    if (params['sample']) {
      const parts = String(params['sample']).split(',').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        this.activeSample.set([parts[0], parts[1]]);
      }
    }

    let fnIdx = 6; // Default: XOR
    if (params['fn'] !== undefined) {
      const idx = +params['fn'];
      if (!isNaN(idx) && idx >= 0 && idx < this.all16Functions.length) {
        fnIdx = idx;
      }
    }

    this.selectedFunctionIndex.set(fnIdx);
    const fn = this.all16Functions[fnIdx];
    this.truthTable.set([...fn.truthTable]);

    if (params['tt']) {
      const ttStr = String(params['tt']);
      if (ttStr.length === 4) {
        const bits = ttStr.split('').map(Number);
        if (bits.every((b) => b === 0 || b === 1)) {
          this.truthTable.set(bits as [number, number, number, number]);
          const matchIdx = this.all16Functions.findIndex(
            (f) =>
              f.truthTable[0] === bits[0] &&
              f.truthTable[1] === bits[1] &&
              f.truthTable[2] === bits[2] &&
              f.truthTable[3] === bits[3]
          );
          if (matchIdx >= 0) this.selectedFunctionIndex.set(matchIdx);
        }
      }
    }

    const preset = params['preset'] as 'exact' | 'zero' | 'linear' | 'perturbed' | 'random' | undefined;
    if (preset === 'zero') {
      this.initZero();
    } else if (preset === 'linear') {
      this.initLinearOnly();
    } else if (preset === 'perturbed') {
      this.initPerturbed();
    } else if (preset === 'random') {
      this.initRandom();
    } else {
      this.initExactAlgebraic();
    }

    if (params['rhopreset']) {
      const rp = params['rhopreset'] as '-2' | '-1' | '0' | '1' | 'random';
      if (rp === 'random') {
        this.setRandomRho();
      } else if (rp === '-2') {
        this.setAllRho(-2.0);
      } else if (rp === '-1') {
        this.setAllRho(-1.0);
      } else if (rp === '0') {
        this.setAllRho(0.0);
      } else if (rp === '1') {
        this.setAllRho(1.0);
      }
    }

    this.isInitialized = true;
  }

  ngOnDestroy(): void {
    this.stopAutoTrain();
  }

  selectFunction(index: number) {
    this.selectedFunctionIndex.set(index);
    const fn = this.all16Functions[index];
    this.truthTable.set([...fn.truthTable]);
    this.stopAutoTrain();
    this.stepCount.set(0);
    this.trainLossHistory.set([]);
    this.trainAccHistory.set([]);
    this.applyCurrentPreset();
  }

  toggleTruthTableBit(index: number) {
    this.truthTable.update((table) => {
      const copy: [number, number, number, number] = [...table];
      copy[index] = copy[index] === 1 ? 0 : 1;
      return copy;
    });

    // Check if matching any of the 16 presets
    const current = this.truthTable();
    const matchIdx = this.all16Functions.findIndex(
      (f) =>
        f.truthTable[0] === current[0] &&
        f.truthTable[1] === current[1] &&
        f.truthTable[2] === current[2] &&
        f.truthTable[3] === current[3]
    );
    if (matchIdx >= 0) {
      this.selectedFunctionIndex.set(matchIdx);
    }

    this.stopAutoTrain();
    this.stepCount.set(0);
    this.trainLossHistory.set([]);
    this.trainAccHistory.set([]);
    this.applyCurrentPreset();
  }

  applyCurrentPreset() {
    const preset = this.selectedPreset();
    if (preset === 'zero') {
      this.initZero();
    } else if (preset === 'linear') {
      this.initLinearOnly();
    } else if (preset === 'perturbed') {
      this.initPerturbed();
    } else if (preset === 'random') {
      this.initRandom();
    } else {
      this.initExactAlgebraic();
    }

    const rhoPreset = this.selectedRhoPreset();
    if (rhoPreset === 'random') {
      this.setRandomRho();
    } else if (rhoPreset === '-2') {
      this.setAllRho(-2.0);
    } else if (rhoPreset === '-1') {
      this.setAllRho(-1.0);
    } else if (rhoPreset === '0') {
      this.setAllRho(0.0);
    } else if (rhoPreset === '1') {
      this.setAllRho(1.0);
    }
  }

  resetModel() {
    this.stopAutoTrain();
    this.stepCount.set(0);
    this.trainLossHistory.set([]);
    this.trainAccHistory.set([]);
    this.applyCurrentPreset();
  }

  private ensureLearner(): BBool2Learner {
    let l = this.learner();
    if (!l) {
      l = new BBool2Learner(this.prime(), 'zero');
      this.learner.set(l);
    }
    return l;
  }

  // Systematic Parameter Initializations
  initExactAlgebraic() {
    this.stopAutoTrain();
    const l = this.ensureLearner();
    l.setExactSolutionForTruthTable(this.truthTable(), this.initialRho());
    this.selectedPreset.set('exact');
    this.trainTick.update((n) => n + 1);
  }

  initZero() {
    this.stopAutoTrain();
    const l = this.ensureLearner();
    l.setFromCoefficients(0, 0, 0, 0, this.initialRho());
    this.selectedPreset.set('zero');
    this.trainTick.update((n) => n + 1);
  }

  initLinearOnly() {
    this.stopAutoTrain();
    const l = this.ensureLearner();
    const coeffs = computeExactCoefficients(this.truthTable());
    // Zero out the non-linear interaction term w3
    l.setFromCoefficients(coeffs.b, coeffs.w1, coeffs.w2, 0, this.initialRho());
    this.selectedPreset.set('linear');
    this.trainTick.update((n) => n + 1);
  }

  initPerturbed() {
    this.stopAutoTrain();
    const l = this.ensureLearner();
    const coeffs = computeExactCoefficients(this.truthTable());
    // Near the exact solution with slight perturbation
    l.setFromCoefficients(
      coeffs.b,
      coeffs.w1,
      coeffs.w2,
      coeffs.w3,
      0.0 // higher uncertainty radius
    );
    this.initialRho.set(0.0);
    this.selectedRhoPreset.set('0');
    this.selectedPreset.set('perturbed');
    this.trainTick.update((n) => n + 1);
  }

  initRandom() {
    this.stopAutoTrain();
    const l = this.ensureLearner();
    l.randomize(this.prime(), 3, this.initialRho());
    this.selectedPreset.set('random');
    this.trainTick.update((n) => n + 1);
  }

  onParamEdit(event: { param: 'b' | 'w1' | 'w2' | 'w3'; center: Rational; rho: number }) {
    const l = this.learner();
    if (!l) return;
    l[event.param] = { center: event.center, rho: event.rho };
    this.selectedPreset.set(null);
    this.selectedRhoPreset.set(null);
    this.trainTick.update((n) => n + 1);
  }

  onParamCenterDirectChange(param: 'b' | 'w1' | 'w2' | 'w3', valStr: string) {
    const l = this.learner();
    if (!l) return;
    try {
      const parsed = parsePadicOrRationalInput(valStr, BigInt(this.prime()));
      l[param].center = parsed;
      this.selectedPreset.set(null);
      this.trainTick.update((n) => n + 1);
    } catch {
      // ignore
    }
  }

  onParamRhoDirectChange(param: 'b' | 'w1' | 'w2' | 'w3', rhoVal: number) {
    const l = this.learner();
    if (!l) return;
    l[param].rho = rhoVal;
    this.selectedRhoPreset.set(null);
    this.trainTick.update((n) => n + 1);
  }

  stepActiveSample() {
    const l = this.learner();
    const cfg = this.modelConfig();
    if (!l) return;
    const [x1, x2] = this.activeSample();
    const target = this.truthTable()[(x1 * 2 + x2)];
    l.trainStep([x1, x2], target, cfg);
    const nextStep = this.stepCount() + 1;
    this.stepCount.set(nextStep);

    const allFwd = this.currentPredictions();
    const totalLoss = allFwd.reduce((sum, p) => sum + p.prob1, 0) / (allFwd.length || 1);
    const correctCount = allFwd.filter((p) => p.isCorrect).length;
    const acc = correctCount / (allFwd.length || 1);

    this.trainLossHistory.update((h) => [...h, { x: nextStep, y: totalLoss, name: 'Train Loss' }]);
    this.trainAccHistory.update((h) => [...h, { x: nextStep, y: acc, name: 'Train Accuracy' }]);
    this.trainTick.update((n) => n + 1);
  }

  stepTrain() {
    const l = this.learner();
    const data = this.dataset();
    const cfg = this.modelConfig();
    if (!l) return;

    const res = l.trainBatch(data, cfg);
    const nextStep = this.stepCount() + 1;
    this.stepCount.set(nextStep);

    this.trainLossHistory.update((h) => [...h, { x: nextStep, y: res.loss, name: 'Train Loss' }]);
    this.trainAccHistory.update((h) => [...h, { x: nextStep, y: res.accuracy, name: 'Train Accuracy' }]);
    this.trainTick.update((n) => n + 1);

    if (res.accuracy >= 0.9999 && this.isAutoTraining()) {
      this.stopAutoTrain();
    }
  }

  trainSteps(count: number = 5) {
    for (let i = 0; i < count; i++) {
      this.stepTrain();
      const lastAcc = this.trainAccHistory();
      if (lastAcc.length > 0 && lastAcc[lastAcc.length - 1].y >= 0.9999) {
        break;
      }
    }
  }

  toggleAutoTrain() {
    if (this.isAutoTraining()) {
      this.stopAutoTrain();
    } else {
      this.startAutoTrain();
    }
  }

  startAutoTrain() {
    this.isAutoTraining.set(true);
    this.autoTrainInterval = setInterval(() => {
      this.stepTrain();
    }, 150);
  }

  stopAutoTrain() {
    this.isAutoTraining.set(false);
    if (this.autoTrainInterval) {
      clearInterval(this.autoTrainInterval);
      this.autoTrainInterval = null;
    }
  }

  closePopup() {
    this.activePopup.set(null);
  }

  togglePopup(id: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.activePopup() === id) {
      this.activePopup.set(null);
    } else {
      this.activePopup.set(id);
    }
  }

  parseNumberInput(val: string): number {
    const normalized = (val || '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }
}
