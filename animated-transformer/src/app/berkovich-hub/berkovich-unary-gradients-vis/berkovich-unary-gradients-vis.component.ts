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

import { Component, ChangeDetectionStrategy, signal, computed, OnDestroy, inject, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MarkdownComponent } from 'ngx-markdown';
import { MatCardModule } from '@angular/material/card';

import {
  Rational,
  simplify,
  parseDigitSequence,
  parsePadicOrRationalInput,
  truncateToTreeRange,
  formatDigitSequence,
  add,
  subtract,
  multiply,
  getValuation,
  extNegate,
  computePathLoss,
  formatRational
} from '../../../lib/berkovich/berkovich';
import {
  BerkovichPoint,
  ShiftOperator,
  ScaleOperator,
  SquareOperator,
  CubeOperator,
  UnaryOperator,
  VertexResolutionMethod,
  BerkovichUnaryOperator
} from '../../../lib/berkovich/berkovich_gradients';

import { BerkovichUnaryCalculusComponent } from './calculus-card/berkovich-unary-calculus.component';
import { BerkovichUnaryTreeVisComponent, TrackedNode, EditableNodeInputs } from './tree-vis/berkovich-unary-tree-vis.component';
import { BerkovichHeaderComponent } from '../berkovich-header/berkovich-header.component';
import { BerkovichVisSettingsService } from '../services/berkovich-vis-settings.service';

@Component({
  selector: 'app-berkovich-unary-gradients-vis',
  templateUrl: './berkovich-unary-gradients-vis.component.html',
  styleUrls: ['./berkovich-unary-gradients-vis.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    FormsModule,
    RouterModule,
    MarkdownComponent,
    BerkovichHeaderComponent,
    BerkovichUnaryTreeVisComponent,
    BerkovichUnaryCalculusComponent,
  ]
})
export class BerkovichUnaryGradientsVisComponent implements OnInit, OnDestroy {
  formatRational(r: Rational): string {
    return formatRational(r);
  }

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly visSettingsService = inject(BerkovichVisSettingsService);

  readonly visMode = this.visSettingsService.visStyle;
  readonly constantLabel = signal<string>('k');

  readonly operator = signal<BerkovichUnaryOperator>('shift');
  readonly prime = signal<number>(3);
  readonly isExplainerExpanded = signal<boolean>(true);
  readonly vertexMethod = signal<VertexResolutionMethod>('exact-per-coord');

  constructor() {
    effect(() => {
      const mode = this.visMode();
      const op = this.operator();
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { mode, operator: op },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    });
  }

  ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const modeParam = params.get('mode');
    if (modeParam === 'tree' || modeParam === 'digits') {
      this.visSettingsService.setVisStyle(modeParam);
    }
    const opParam = params.get('operator');
    if (opParam === 'shift' || opParam === 'scale' || opParam === 'square' || opParam === 'cube') {
      this.operator.set(opParam as BerkovichUnaryOperator);
    }
  }

  // Input states
  readonly centerXInput = signal<string>('00.10'); // 1/3 in base 3
  readonly rhoXInput = signal<string>('0.0');
  readonly constantKInput = signal<string>('01.00'); // 1 in base 3

  readonly centerYInput = signal<string>('10.00'); // 3 in base 3 is 10

  // Simulation states
  readonly currentCenterX = signal<Rational>({ num: 0n, den: 1n });
  readonly currentRhoX = signal<number>(0.0);
  readonly stepCount = signal<number>(0);

  readonly constantK = computed<Rational>(() => {
    const p = BigInt(this.prime());
    try {
      return parsePadicOrRationalInput(this.constantKInput(), p);
    } catch {
      return { num: 1n, den: 1n };
    }
  });

  // Initial values parsed from inputs
  readonly initCenterX = computed<Rational>(() => {
    const p = BigInt(this.prime());
    try {
      return truncateToTreeRange(parseDigitSequence(this.centerXInput(), p), p, -2, 1);
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly initRhoX = computed<number>(() => {
    const v = parseFloat(this.rhoXInput());
    return isNaN(v) ? 0.0 : Math.max(-2.0, Math.min(2.0, v));
  });

  // Active state during simulation
  readonly centerX = computed<Rational>(() => {
    if (this.stepCount() > 0) {
      return this.currentCenterX();
    }
    return this.initCenterX();
  });

  readonly rhoX = computed<number>(() => {
    if (this.stepCount() > 0) {
      return this.currentRhoX();
    }
    return this.initRhoX();
  });

  readonly centerY = computed<Rational>(() => {
    const p = BigInt(this.prime());
    try {
      return truncateToTreeRange(parseDigitSequence(this.centerYInput(), p), p, -2, 1);
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly learningRateInput = signal<string>('0.20');
  readonly learningRate = computed<number>(() => {
    const v = parseFloat(this.learningRateInput());
    return isNaN(v) ? 0.20 : v;
  });

  readonly isPlaying = signal<boolean>(false);
  readonly history = signal<any[]>([]);
  readonly canUndo = computed(() => this.history().length > 0);

  readonly playStepMs = signal<number>(500);

  private playIntervalId: any = null;

  readonly subtitleMath = computed(() => {
    const op = this.operator();
    if (op === 'scale') return '$p \\cdot x \\to y$';
    if (op === 'square') return '$x^2 \\to y$';
    if (op === 'cube') return '$x^3 \\to y$';
    return '$x + k \\to y$';
  });

  readonly explainerMarkdown = computed(() => {
    const op = this.operator();
    if (op === 'scale') {
      return `
This page demonstrates training the input $x$ of a scaling operation $p \\cdot x$ to match a target disk $y$.

### The Scale Radius Formula
Multiplying by $p$ translates the log-radius down by $1$:
$$(p \\cdot x)_\\rho = \\rho_x - 1$$
This shrinks the uncertainty radius of the disk.

### How Gradients Flow
1. **Gradient on Center ($\\partial L / \\partial c_x$)**: The gradient w.r.t center propagates back scaled by $p$.
2. **Gradient on Radius ($\\partial L / \\partial \\rho_x$)**: The gradient w.r.t radius flows back directly since $\\partial (p \\cdot x)_\\rho / \\partial \\rho_x = 1.0$.
      `;
    }
    if (op === 'square') {
      return `
This page demonstrates training the input $x$ of a squaring operation $x^2$ to match a target disk $y$.

### The Square Radius Formula
The squaring operation propagates uncertainty as:
$$(x^2)_\\rho = \\max(\\log_p |x_c|_p + \\rho_x, \\quad 2\\rho_x)$$
Depending on which term dominates, the derivative (active degree) $\\partial (x^2)_\\rho / \\partial \\rho_x$ is either $1.0$ or $2.0$.

### How Gradients Flow
1. **Gradient on Center ($\\partial L / \\partial c_x$)**: The gradient w.r.t center propagates back using the derivative of squaring ($2x$).
2. **Gradient on Radius ($\\partial L / \\partial \\rho_x$)**: The gradient flows back scaled by the active degree ($1.0$, $1.5$ or $2.0$).
      `;
    }
    if (op === 'cube') {
      return `
This page demonstrates training the input $x$ of a cubic operation $x^3$ to match a target disk $y$.

### The Cube Radius Formula
The cubic operation propagates uncertainty as:
$$(x^3)_\\rho = \\max(\\log_p |3x_c^2|_p + \\rho_x, \\quad \\log_p |3x_c|_p + 2\\rho_x, \\quad 3\\rho_x)$$
Depending on which term dominates, the active degree is $1.0$, $2.0$, or $3.0$.

### How Gradients Flow
1. **Gradient on Center ($\\partial L / \\partial c_x$)**: The gradient w.r.t center propagates back using the derivative of cubing ($3x^2$).
2. **Gradient on Radius ($\\partial L / \\partial \\rho_x$)**: The gradient flows back scaled by the active degree ($1.0$, $2.0$, or $3.0$).
      `;
    }
    return `
This page demonstrates training the input $x$ of a shift operation $x + k$ to match a target disk $y$.

### The Shift Radius Formula
Translating a disk by a constant does not change its radius:
$$(x + k)_\\rho = \\rho_x$$

### How Gradients Flow
1. **Gradient on Center ($\\partial L / \\partial c_x$)**: The gradient w.r.t center propagates back directly.
2. **Gradient on Radius ($\\partial L / \\partial \\rho_x$)**: The gradient w.r.t radius flows back directly.
      `;
  });

  // Combined dynamics
  readonly stepDetails = computed(() => {
    const op = this.operator();
    const p = BigInt(this.prime());
    const x = new BerkovichPoint(this.centerX(), this.rhoX());
    const targetY = this.centerY();

    let operator: UnaryOperator;
    if (op === 'shift') {
      operator = new ShiftOperator(this.constantK());
    } else if (op === 'scale') {
      operator = new ScaleOperator(simplify({ num: p, den: 1n }));
    } else if (op === 'square') {
      operator = new SquareOperator();
    } else {
      operator = new CubeOperator();
    }

    return operator.step(
      x,
      targetY,
      p,
      this.learningRate(),
      this.vertexMethod()
    );
  });

  readonly loss = computed(() => this.stepDetails().loss);

  // Multi-tree Nodes
  readonly trackedNodes = computed<TrackedNode[]>(() => {
    const op = this.operator();
    const details = this.stepDetails();
    const p = BigInt(this.prime());
    const labelOut = op === 'scale' ? `(${this.constantLabel()}x)_ρ` : op === 'square' ? '(x²)_ρ' : op === 'cube' ? '(x³)_ρ' : `(x+k)_ρ`;
    const idOut = op === 'scale' ? 'PX' : op === 'square' ? 'X2' : op === 'cube' ? 'X3' : 'X1';

    const nodes: TrackedNode[] = [
      { id: 'X', center: this.centerX(), rho: this.rhoX(), color: '#60a5fa', label: 'x_ρ' }
    ];

    if (op === 'scale' || op === 'shift') {
      let centerC: Rational;
      let rhoC: number;
      let labelC: string;

      if (op === 'scale') {
        centerC = simplify({ num: p, den: 1n });
        rhoC = -2;
        labelC = `${this.constantLabel()} = p`;
      } else {
        centerC = this.constantK();
        rhoC = -2;
        labelC = `${this.constantLabel()} = ${formatDigitSequence(this.constantK(), p)}`;
      }
      nodes.push({ id: 'C', center: centerC, rho: rhoC, color: '#94a3b8', label: labelC });
    }

    nodes.push(
      { id: idOut, center: details.out.center, rho: details.out.rho, color: '#a78bfa', label: labelOut },
      { id: 'Y', center: this.centerY(), rho: -2, color: '#eab308', label: 'y_c (Target)' }
    );
    return nodes;
  });

  // Editable inputs for inline editing inside the tree vis
  readonly editableInputs = computed<EditableNodeInputs[]>(() => {
    const op = this.operator();
    const p = BigInt(this.prime());

    const inputs: EditableNodeInputs[] = [
      {
        nodeId: 'X',
        trackedNodeId: 'X',
        centerInput: formatDigitSequence(this.centerX(), p),
        rhoInput: this.rhoX().toFixed(2),
        color: '#60a5fa',
        labelPrefix: 'x'
      }
    ];

    if (op === 'scale') {
      inputs.push({
        nodeId: 'C',
        trackedNodeId: 'C',
        centerInput: '10.',
        color: '#94a3b8',
        labelPrefix: this.constantLabel(),
        readonly: true
      });
    } else if (op === 'shift') {
      inputs.push({
        nodeId: 'C',
        trackedNodeId: 'C',
        centerInput: this.constantKInput(),
        color: '#94a3b8',
        labelPrefix: this.constantLabel(),
        readonly: false
      });
    }

    inputs.push({
      nodeId: 'Y',
      trackedNodeId: 'Y',
      centerInput: this.centerYInput(),
      color: '#eab308',
      labelPrefix: 'y'
    });

    return inputs;
  });

  reset() {
    this.stopPlaying();
    this.currentCenterX.set(this.initCenterX());
    this.currentRhoX.set(this.initRhoX());
    this.stepCount.set(0);
    this.history.set([]);
  }

  // Handlers
  onOperatorChange(op: BerkovichUnaryOperator) {
    this.operator.set(op);
    // Reset inputs depending on operator
    if (op === 'scale') {
      this.centerXInput.set('00.10'); // 1/3
      this.centerYInput.set('10.00'); // 3
    } else if (op === 'square') {
      this.centerXInput.set('01.00'); // 1
      this.centerYInput.set('11.00'); // 4 (11_3)
    } else if (op === 'cube') {
      this.centerXInput.set('01.00'); // 1
      this.centerYInput.set('22.00'); // 8 (22_3)
    } else {
      this.centerXInput.set('01.00'); // 1
      this.constantKInput.set('01.00'); // 1
      this.centerYInput.set('10.00'); // 3 (10_3)
    }
    this.reset();
  }

  onPrimeChange(p: number) {
    const currentX = this.centerX();
    const currentY = this.centerY();
    const currentK = this.constantK();
    
    this.prime.set(p);
    
    // Re-format the current rational values in the new prime
    const pBig = BigInt(p);
    this.centerXInput.set(formatDigitSequence(currentX, pBig));
    this.centerYInput.set(formatDigitSequence(currentY, pBig));
    this.constantKInput.set(formatDigitSequence(currentK, pBig));
    this.reset();
  }

  onInputChange(event: { nodeId: string; field: 'center' | 'rho'; value: string }) {
    switch (event.nodeId) {
      case 'Y':
        if (event.field === 'center') this.centerYInput.set(event.value);
        break;
      case 'X':
        if (event.field === 'center') this.centerXInput.set(event.value);
        else this.rhoXInput.set(event.value);
        break;
      case 'C':
        if (event.field === 'center') this.constantKInput.set(event.value);
        break;
    }
    this.reset();
  }

  onInputBlur(event: { nodeId: string; field: 'center' | 'rho' }) {
    const p = BigInt(this.prime());
    switch (event.nodeId) {
      case 'Y':
        this.centerYInput.set(formatDigitSequence(this.centerY(), p));
        break;
      case 'X':
        if (event.field === 'center') {
          this.centerXInput.set(formatDigitSequence(this.centerX(), p));
        } else {
          this.rhoXInput.set(this.rhoX().toFixed(1));
        }
        break;
      case 'C':
        this.constantKInput.set(formatDigitSequence(this.constantK(), p));
        break;
    }
    this.reset();
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
    const p = this.prime();
    const randomDigits = () => {
      const d1 = Math.floor(Math.random() * p).toString();
      const d0 = Math.floor(Math.random() * p).toString();
      const dm1 = Math.floor(Math.random() * p).toString();
      const dm2 = Math.floor(Math.random() * p).toString();
      return `${d1}${d0}.${dm1}${dm2}`;
    };
    const randomRho = () => (Math.random() * 3 - 1.5).toFixed(1);

    this.centerXInput.set(randomDigits());
    this.rhoXInput.set(randomRho());
    this.centerYInput.set(randomDigits());
    this.reset();
  }

  onStep() {
    if (this.stepCount() === 0) {
      this.currentCenterX.set(this.initCenterX());
      this.currentRhoX.set(this.initRhoX());
    }

    const c = this.currentCenterX();
    const rho = this.currentRhoX();
    const y = this.centerY();
    const eta = this.learningRate();
    const op = this.operator();
    const p = BigInt(this.prime());

    let operator: UnaryOperator;
    if (op === 'shift') {
      operator = new ShiftOperator(this.constantK());
    } else if (op === 'scale') {
      operator = new ScaleOperator(simplify({ num: p, den: 1n }));
    } else if (op === 'square') {
      operator = new SquareOperator();
    } else {
      operator = new CubeOperator();
    }

    const result = operator.step(
      new BerkovichPoint(c, rho),
      y,
      p,
      eta,
      this.vertexMethod()
    );

    this.history.update(h => [
      ...h,
      {
        centerX: c,
        rhoX: rho,
        stepCount: this.stepCount()
      }
    ]);

    this.currentCenterX.set(result.nextX.center);
    this.currentRhoX.set(result.nextX.rho);
    this.stepCount.update(s => s + 1);

    if (result.loss <= 1e-7 || result.nextX.rho <= -2.0) {
      this.stopPlaying();
    }
  }

  onUndo() {
    this.stopPlaying();
    const h = this.history();
    if (h.length === 0) return;
    const last = h[h.length - 1];
    this.currentCenterX.set(last.centerX);
    this.currentRhoX.set(last.rhoX);
    this.stepCount.set(last.stepCount);
    this.history.set(h.slice(0, -1));
  }

  onRunToggle() {
    if (this.isPlaying()) {
      this.stopPlaying();
    } else {
      this.isPlaying.set(true);
      const interval = this.playStepMs();
      this.playIntervalId = setInterval(() => {
        const d = this.stepDetails();
        if (d.loss <= 1e-6) {
          this.stopPlaying();
          return;
        }
        this.onStep();
      }, interval);
    }
  }

  private stopPlaying() {
    this.isPlaying.set(false);
    if (this.playIntervalId) {
      clearInterval(this.playIntervalId);
      this.playIntervalId = null;
    }
  }

  ngOnDestroy() {
    this.stopPlaying();
  }
}
