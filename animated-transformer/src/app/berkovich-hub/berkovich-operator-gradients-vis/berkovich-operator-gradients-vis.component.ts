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

import { Component, ChangeDetectionStrategy, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MarkdownComponent } from 'ngx-markdown';
import { MatCardModule } from '@angular/material/card';

import {
  Rational,
  parseDigitSequence,
  truncateToTreeRange,
  formatDigitSequence,
  add,
  subtract,
  multiply,
  getValuation,
  stepAdditionGradients,
  stepMultiplicationGradients,
  stepSoftmaxGradients,
  VertexResolutionMethod,
  extNegate,
  computePathLoss
} from '../../../lib/berkovich/berkovich';

import { BerkovichOperatorCalculusComponent } from './calculus-card/berkovich-operator-calculus.component';
import {
  BerkovichMultiTreeVisComponent,
  TrackedNode,
  EditableNodeInputs,
  BerkovichBinaryOperator
} from './tree-vis/berkovich-multi-tree-vis.component';

@Component({
  selector: 'app-berkovich-operator-gradients-vis',
  templateUrl: './berkovich-operator-gradients-vis.component.html',
  styleUrls: ['./berkovich-operator-gradients-vis.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    FormsModule,
    RouterModule,
    MarkdownComponent,
    BerkovichOperatorCalculusComponent,
    BerkovichMultiTreeVisComponent
  ]
})
export class BerkovichOperatorGradientsVisComponent implements OnDestroy {
  readonly operator = signal<BerkovichBinaryOperator>('addition');
  readonly prime = signal<number>(3);
  readonly isExplainerExpanded = signal<boolean>(true);
  readonly vertexMethod = signal<VertexResolutionMethod>('exact-per-coord');
  readonly isPlaying = signal<boolean>(false);
  readonly learningRateInput = signal<string>('0.20');
  readonly learningRate = computed(() => {
    const v = parseFloat(this.learningRateInput());
    return isNaN(v) ? 0.20 : v;
  });
  readonly history = signal<{
    operator: BerkovichBinaryOperator;
    centerX1Input: string;
    rhoX1Input: string;
    centerX2Input: string;
    rhoX2Input: string;
    centerYInput: string;
  }[]>([]);
  readonly canUndo = computed(() => this.history().length > 0);

  readonly playStepMs = signal<number>(1000);

  private playIntervalId: any = null;

  readonly subtitleMath = computed(() => {
    const op = this.operator();
    if (op === 'multiplication') return '$x_1 \\cdot x_2 \\to y$';
    return '$x_1 + x_2 \\to y$';
  });

  readonly explainerMarkdown = computed(() => {
    const op = this.operator();
    if (op === 'multiplication') {
      return `
This page demonstrates training the inputs $x_1$ and $x_2$ of a multiplication operation $x_1 \\cdot x_2$ to match a target disk $y$.

### The Product Radius Formula
Under non-Archimedean multiplication, the product disk's log-radius is given by:
$$(x_1 \\cdot x_2)_\\rho = \\max(\\log_p |x_{1,c}|_p + x_{2,\\rho}, \\quad \\log_p |x_{2,c}|_p + x_{1,\\rho}, \\quad x_{1,\\rho} + x_{2,\\rho})$$
Where $|c|_p = p^{-\\nu_p(c)}$ is the $p$-adic norm.

### Why do $\\rho$ values get so big? (The Uncertainty Amplifier)
In $p$-adic metrics, a number with a high denominator power (like $1/9 \\implies$ valuation $-2$) has a huge norm ($|1/9|_3 = 9 \\implies \\log_3 |1/9|_3 = 2$). 
When you multiply a disk by such a number, its uncertainty is amplified:
* If $x_1$ has a center with a large norm (e.g. $\\log_p |x_{1,c}|_p = K > 0$), then the first term in the max becomes $K + x_{2,\\rho}$.
* This means the product's radius is magnified by $K$, pushing $(x_1 \\cdot x_2)_{\\rho}$ to be much larger than either input radius.
* **Intuitively**: Multiplying by a large value stretches the uncertainty interval. If you are uncertain about $x_2$ by $1/3$ (log-radius $-1$), and you multiply it by $9$ (norm log-radius $2$), your uncertainty about the product becomes $9 \\times (1/3) = 3$ (log-radius $+1$).

### How Gradients Flow
1. **Gradient on Centers ($\\partial L / \\partial c$)**: The gradient w.r.t centers propagates back using the derivative of the product.
2. **Gradient on Radii ($\\partial L / \\partial \\rho$)**: The gradient flows back only to the radius parameter that dominates the product radius max-plus term.
      `;
    }
    return `
In non-Archimedean machine learning, we optimize parameters inside Berkovich space using continuous gradient descent (SGD). This page demonstrates training the inputs $x_1$ and $x_2$ of an addition operation $x_1+x_2$ to match a target disk $y$.

### The Loss Function & Distance
We define the loss function $L(x_1, x_2; y)$ as the branching distance between the sum disk $x_1+x_2$ and the target disk $y$:
$$L(x_1, x_2; y) = \\text{dist}(x_1+x_2, y)$$
In tree topology, this is the length of the path from the sum disk node up to the lowest common ancestor (LCA) junction with the target disk.

### How Gradients Flow
Since the sum disk's center is $(x_1+x_2)_c = x_{1,c} + x_{2,c}$ and its radius is $(x_1+x_2)_{\\rho} = \\max(x_{1,\\rho}, x_{2,\\rho})$:
1. **Gradient on Centers ($\\partial L / \\partial c$)**: The gradient on the sum center propagates back equally to the centers of $x_1$ and $x_2$. The gradient points toward the branch that leads closer to the target center $y_c$.
2. **Gradient on Radii ($\\partial L / \\partial \\rho$)**: The loss is only sensitive to the radii of the inputs that dominate the sum's uncertainty. The gradient of the sum radius $\\partial L / \\partial (x_1+x_2)_{\\rho}$ flows back:
   * Entirely to $x_{1,\\rho}$ if $x_{1,\\rho} > x_{2,\\rho}$
   * Entirely to $x_{2,\\rho}$ if $x_{2,\\rho} > x_{1,\\rho}$
   * Equally divided between them if $x_{1,\\rho} = x_{2,\\rho}$
    `;
  });

  readonly centerYInput = signal<string>('00.00');
  readonly centerX1Input = signal<string>('12.20');
  readonly rhoX1Input = signal<string>('0.0');
  readonly centerX2Input = signal<string>('02.20');
  readonly rhoX2Input = signal<string>('-1.0');

  // Parsed State
  readonly centerY = computed<Rational>(() => this.parseParam(this.centerYInput()));
  readonly centerX1 = computed<Rational>(() => this.parseParam(this.centerX1Input()));
  readonly centerX2 = computed<Rational>(() => this.parseParam(this.centerX2Input()));

  readonly rhoX1 = computed<number>(() => {
    const v = parseFloat(this.rhoX1Input());
    return isNaN(v) ? 0.0 : Math.max(-2, Math.min(2, v));
  });

  readonly rhoX2 = computed<number>(() => {
    const v = parseFloat(this.rhoX2Input());
    return isNaN(v) ? 0.0 : Math.max(-2, Math.min(2, v));
  });

  private parseParam(s: string): Rational {
    try {
      return truncateToTreeRange(
        parseDigitSequence(s, BigInt(this.prime())),
        BigInt(this.prime()), -2, 1
      );
    } catch {
      return { num: 0n, den: 1n };
    }
  }

  // Combined dynamics
  readonly stepDetails = computed(() => {
    const op = this.operator();
    const p = BigInt(this.prime());
    const c1 = this.centerX1();
    const r1 = this.rhoX1();
    const c2 = this.centerX2();
    const r2 = this.rhoX2();
    const targetY = this.centerY();

    if (op === 'multiplication') {
      const prodCenter = truncateToTreeRange(multiply(c1, c2), p, -2, 1);
      const val1 = getValuation(c1, p);
      const val2 = getValuation(c2, p);
      const logNorm1 = val1.type === 'finite' ? -val1.value : -Infinity;
      const logNorm2 = val2.type === 'finite' ? -val2.value : -Infinity;
      const prodRho = Math.max(logNorm2 + r1, logNorm1 + r2, r1 + r2);

      const diff = subtract(prodCenter, targetY);
      const valDiff = getValuation(diff, p);
      const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;

      const y_rho = -2;
      const loss = valDiff.type === 'pos-infinity' && prodRho <= y_rho
        ? 0
        : computePathLoss(prodRho, extNegate(valDiff), y_rho);

      let drProd = 0;
      if (prodRho > d) drProd = 1;
      else if (prodRho < d) drProd = -1;

      // Active degrees w.r.t product:
      let drhoProd_drhoX1 = 0.0;
      let drhoProd_drhoX2 = 0.0;
      const t1 = logNorm2 + r1;
      const t2 = logNorm1 + r2;
      const t3 = r1 + r2;
      const m = Math.max(t1, t2, t3);
      let count = 0;
      if (Math.abs(t1 - m) < 1e-9) count++;
      if (Math.abs(t2 - m) < 1e-9) count++;
      if (Math.abs(t3 - m) < 1e-9) count++;

      if (Math.abs(t1 - m) < 1e-9) drhoProd_drhoX1 += 1.0 / count;
      if (Math.abs(t2 - m) < 1e-9) drhoProd_drhoX2 += 1.0 / count;
      if (Math.abs(t3 - m) < 1e-9) {
        drhoProd_drhoX1 += 1.0 / count;
        drhoProd_drhoX2 += 1.0 / count;
      }

      return {
        outCenter: prodCenter,
        outRho: prodRho,
        loss,
        drhoX1: drhoProd_drhoX1,
        drhoX2: drhoProd_drhoX2,
        drOut: drProd,
        dY1: d,
        dY2: d
      };
    } else {
      // addition
      const sumCenter = truncateToTreeRange(add(c1, c2), p, -2, 1);
      const sumRho = Math.max(r1, r2);

      const diff = subtract(sumCenter, targetY);
      const valDiff = getValuation(diff, p);
      const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;

      const y_rho = -2;
      const loss = valDiff.type === 'pos-infinity' && sumRho <= y_rho
        ? 0
        : computePathLoss(sumRho, extNegate(valDiff), y_rho);

      let drSum = 0;
      if (sumRho > d) drSum = 1;
      else if (sumRho < d) drSum = -1;

      let drhoSum_drhoX1 = 0.0;
      let drhoSum_drhoX2 = 0.0;
      if (r1 > r2) {
        drhoSum_drhoX1 = 1.0;
      } else if (r2 > r1) {
        drhoSum_drhoX2 = 1.0;
      } else {
        drhoSum_drhoX1 = 0.5;
        drhoSum_drhoX2 = 0.5;
      }

      return {
        outCenter: sumCenter,
        outRho: sumRho,
        loss,
        drhoX1: drhoSum_drhoX1,
        drhoX2: drhoSum_drhoX2,
        drOut: drSum,
        dY1: d,
        dY2: d
      };
    }
  });

  readonly loss = computed(() => this.stepDetails().loss);

  // Multi-tree Nodes
  readonly trackedNodes = computed<TrackedNode[]>(() => {
    const op = this.operator();
    const details = this.stepDetails();

    const labelOut = op === 'multiplication' ? '(x1*x2)_ρ' : '(x1+x2)_ρ';
    const idOut = op === 'multiplication' ? 'X1*X2' : 'X1+X2';
    return [
      { id: 'X1', center: this.centerX1(), rho: this.rhoX1(), color: '#60a5fa', label: 'x1_ρ' },
      { id: 'X2', center: this.centerX2(), rho: this.rhoX2(), color: '#f472b6', label: 'x2_ρ' },
      { id: idOut, center: details.outCenter, rho: details.outRho, color: '#a78bfa', label: labelOut },
      { id: 'Y', center: this.centerY(), rho: -2, color: '#eab308', label: 'y_c (Target)' }
    ];
  });

  // Editable inputs for inline editing inside the tree vis
  readonly editableInputs = computed<EditableNodeInputs[]>(() => {
    const p = BigInt(this.prime());
    const op = this.operator();
    const details = this.stepDetails();



    const idOut = op === 'multiplication' ? 'X1*X2' : 'X1+X2';
    const labelOut = op === 'multiplication' ? 'x₁·x₂' : 'x₁+x₂';

    return [
      {
        nodeId: 'X1',
        trackedNodeId: 'X1',
        centerInput: this.centerX1Input(),
        rhoInput: this.rhoX1Input(),
        color: '#2563eb',
        labelPrefix: 'x₁'
      },
      {
        nodeId: 'X2',
        trackedNodeId: 'X2',
        centerInput: this.centerX2Input(),
        rhoInput: this.rhoX2Input(),
        color: '#db2777',
        labelPrefix: 'x₂'
      },
      {
        nodeId: idOut,
        trackedNodeId: idOut,
        centerInput: formatDigitSequence(details.outCenter, p),
        rhoInput: details.outRho.toFixed(2),
        color: '#7c3aed',
        labelPrefix: labelOut,
        readonly: true
      },
      {
        nodeId: 'Y',
        trackedNodeId: 'Y',
        centerInput: this.centerYInput(),
        color: '#eab308',
        labelPrefix: 'y'
      }
    ];
  });

  // Handlers
  onOperatorChange(op: BerkovichBinaryOperator) {
    this.stopPlaying();
    this.operator.set(op);
    this.history.set([]);
  }

  onPrimeChange(p: number) {
    this.stopPlaying();
    this.prime.set(p);
    this.history.set([]);
  }

  onInputChange(event: { nodeId: string; field: 'center' | 'rho'; value: string }) {
    this.stopPlaying();
    this.history.set([]);
    switch (event.nodeId) {
      case 'Y':
        if (event.field === 'center') this.centerYInput.set(event.value);
        break;
      case 'X1':
        if (event.field === 'center') this.centerX1Input.set(event.value);
        else this.rhoX1Input.set(event.value);
        break;
      case 'X2':
        if (event.field === 'center') this.centerX2Input.set(event.value);
        else this.rhoX2Input.set(event.value);
        break;
    }
  }

  onInputBlur(event: { nodeId: string; field: 'center' | 'rho' }) {
    const p = BigInt(this.prime());
    switch (event.nodeId) {
      case 'Y':
        this.centerYInput.set(formatDigitSequence(this.centerY(), p));
        break;
      case 'X1':
        if (event.field === 'center') {
          this.centerX1Input.set(formatDigitSequence(this.centerX1(), p));
        } else {
          this.rhoX1Input.set(this.rhoX1().toFixed(1));
        }
        break;
      case 'X2':
        if (event.field === 'center') {
          this.centerX2Input.set(formatDigitSequence(this.centerX2(), p));
        } else {
          this.rhoX2Input.set(this.rhoX2().toFixed(1));
        }
        break;
    }
  }

  onLearningRateBlur(): void {
    let v = parseFloat(this.learningRateInput());
    if (isNaN(v)) {
      v = 0.20;
    } else {
      v = Math.max(0.01, Math.min(2.0, v));
    }
    this.learningRateInput.set(v.toFixed(2));
  }

  onRandomize() {
    this.stopPlaying();
    this.history.set([]);
    const p = this.prime();
    const randomDigits = () => {
      const d1 = Math.floor(Math.random() * p).toString();
      const d0 = Math.floor(Math.random() * p).toString();
      const dm1 = Math.floor(Math.random() * p).toString();
      const dm2 = Math.floor(Math.random() * p).toString();
      return `${d1}${d0}.${dm1}${dm2}`;
    };
    const randomRho = () => (Math.random() * 3 - 1.5).toFixed(1);

    this.centerX1Input.set(randomDigits());
    this.centerX2Input.set(randomDigits());
    this.rhoX1Input.set(randomRho());
    this.rhoX2Input.set(randomRho());
    this.centerYInput.set(randomDigits());
  }

  onStep() {
    this.history.update(h => [
      ...h,
      {
        operator: this.operator(),
        centerX1Input: this.centerX1Input(),
        rhoX1Input: this.rhoX1Input(),
        centerX2Input: this.centerX2Input(),
        rhoX2Input: this.rhoX2Input(),
        centerYInput: this.centerYInput()
      }
    ]);

    const eta = this.learningRate();
    const op = this.operator();
    const p = BigInt(this.prime());

    let result: {
      nextCenterX1: Rational;
      nextRhoX1: number;
      nextCenterX2: Rational;
      nextRhoX2: number;
    };

    if (op === 'multiplication') {
      result = stepMultiplicationGradients(
        this.centerX1(),
        this.rhoX1(),
        this.centerX2(),
        this.rhoX2(),
        this.centerY(),
        p,
        eta,
        this.vertexMethod()
      );
    } else {
      result = stepAdditionGradients(
        this.centerX1(),
        this.rhoX1(),
        this.centerX2(),
        this.rhoX2(),
        this.centerY(),
        p,
        eta,
        this.vertexMethod()
      );
    }

    this.centerX1Input.set(formatDigitSequence(result.nextCenterX1, p));
    this.rhoX1Input.set(result.nextRhoX1.toFixed(2));
    this.centerX2Input.set(formatDigitSequence(result.nextCenterX2, p));
    this.rhoX2Input.set(result.nextRhoX2.toFixed(2));
  }

  onUndo() {
    this.stopPlaying();
    const currentHist = this.history();
    if (currentHist.length === 0) {
      return;
    }
    const newHist = currentHist.slice(0, -1);
    const prev = currentHist[currentHist.length - 1];

    this.operator.set(prev.operator);
    this.centerX1Input.set(prev.centerX1Input);
    this.rhoX1Input.set(prev.rhoX1Input);
    this.centerX2Input.set(prev.centerX2Input);
    this.rhoX2Input.set(prev.rhoX2Input);
    this.centerYInput.set(prev.centerYInput);
    this.history.set(newHist);
  }

  onVertexMethodChange(method: VertexResolutionMethod) {
    this.stopPlaying();
    this.vertexMethod.set(method);
  }

  onTogglePlay() {
    if (this.isPlaying()) {
      this.stopPlaying();
    } else {
      this.startPlaying();
    }
  }

  private startPlaying() {
    this.isPlaying.set(true);
    const interval = this.playStepMs();
    this.playIntervalId = setInterval(() => {
      if (this.loss() <= 1e-7) {
        this.stopPlaying();
        return;
      }
      this.onStep();
    }, interval);
  }

  private stopPlaying() {
    this.isPlaying.set(false);
    if (this.playIntervalId !== null) {
      clearInterval(this.playIntervalId);
      this.playIntervalId = null;
    }
  }

  ngOnDestroy() {
    this.stopPlaying();
  }
}
