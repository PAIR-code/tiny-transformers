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
  simplify,
  parseDigitSequence,
  truncateToTreeRange,
  formatDigitSequence,
  add,
  subtract,
  multiply,
  getValuation,
  stepUnaryOperatorGradients,
  VertexResolutionMethod,
  extNegate,
  computePathLoss,
  BerkovichUnaryOperator
} from '../../../lib/berkovich/berkovich';

import { BerkovichUnaryCalculusComponent } from './calculus-card/berkovich-unary-calculus.component';
import {
  BerkovichUnaryTreeVisComponent,
  TrackedNode,
  EditableNodeInputs
} from './tree-vis/berkovich-unary-tree-vis.component';

@Component({
  selector: 'app-berkovich-unary-gradients-vis',
  templateUrl: './berkovich-unary-gradients-vis.component.html',
  styleUrls: ['./berkovich-unary-gradients-vis.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    FormsModule,
    RouterModule,
    MarkdownComponent,
    BerkovichUnaryCalculusComponent,
    BerkovichUnaryTreeVisComponent
  ]
})
export class BerkovichUnaryGradientsVisComponent implements OnDestroy {
  readonly operator = signal<BerkovichUnaryOperator>('shift');
  readonly prime = signal<number>(3);
  readonly isExplainerExpanded = signal<boolean>(true);
  readonly vertexMethod = signal<VertexResolutionMethod>('exact-per-coord');

  // Input states
  readonly centerXInput = signal<string>('0.1'); // 1/3 in base 3
  readonly rhoXInput = signal<string>('0.0');

  readonly centerYInput = signal<string>('1.0'); // 3 in base 3 is 10, let's start with target 3 (10.) or 1.

  // Parsed states
  readonly centerX = computed<Rational>(() => {
    const p = BigInt(this.prime());
    try {
      return truncateToTreeRange(parseDigitSequence(this.centerXInput(), p), p, -2, 1);
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly rhoX = computed<number>(() => {
    const v = parseFloat(this.rhoXInput());
    return isNaN(v) ? 0.0 : Math.max(-2.0, Math.min(2.0, v));
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

  private playIntervalId: any = null;

  readonly subtitleMath = computed(() => {
    const op = this.operator();
    if (op === 'scale') return '$p \\cdot x \\to y$';
    if (op === 'square') return '$x^2 \\to y$';
    return '$x + 1 \\to y$';
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
    return `
This page demonstrates training the input $x$ of a shift operation $x + 1$ to match a target disk $y$.

### The Shift Radius Formula
Translating a disk by a constant does not change its radius:
$$(x + 1)_\\rho = \\rho_x$$

### How Gradients Flow
1. **Gradient on Center ($\\partial L / \\partial c_x$)**: The gradient w.r.t center propagates back directly.
2. **Gradient on Radius ($\\partial L / \\partial \\rho_x$)**: The gradient w.r.t radius flows back directly.
      `;
  });

  // Combined dynamics
  readonly stepDetails = computed(() => {
    const op = this.operator();
    const p = BigInt(this.prime());
    const cx = this.centerX();
    const rx = this.rhoX();
    const targetY = this.centerY();

    return stepUnaryOperatorGradients(cx, rx, op, targetY, p, this.learningRate(), this.vertexMethod());
  });

  readonly loss = computed(() => this.stepDetails().loss);

  // Multi-tree Nodes
  readonly trackedNodes = computed<TrackedNode[]>(() => {
    const op = this.operator();
    const details = this.stepDetails();
    const p = BigInt(this.prime());
    const labelOut = op === 'scale' ? '(px)_ρ' : op === 'square' ? '(x²)_ρ' : '(x+1)_ρ';
    const idOut = op === 'scale' ? 'PX' : op === 'square' ? 'X2' : 'X1';

    let centerC: Rational;
    let rhoC: number;
    let labelC: string;

    if (op === 'scale') {
      centerC = simplify({ num: p, den: 1n });
      rhoC = -2;
      labelC = 'c = p';
    } else if (op === 'square') {
      centerC = this.centerX();
      rhoC = this.rhoX();
      labelC = 'x_ρ (copy)';
    } else {
      centerC = simplify({ num: 1n, den: 1n });
      rhoC = -2;
      labelC = 'c = 1';
    }

    return [
      { id: 'X', center: this.centerX(), rho: this.rhoX(), color: '#60a5fa', label: 'x_ρ' },
      { id: 'C', center: centerC, rho: rhoC, color: '#94a3b8', label: labelC },
      { id: idOut, center: details.outCenter, rho: details.outRho, color: '#a78bfa', label: labelOut },
      { id: 'Y', center: this.centerY(), rho: -2, color: '#eab308', label: 'y_c (Target)' }
    ];
  });

  // Editable inputs for inline editing inside the tree vis
  readonly editableInputs = computed<EditableNodeInputs[]>(() => {
    const op = this.operator();

    let centerCInput: string;
    let rhoCInput: string | undefined = undefined;
    let labelPrefixC: string;

    if (op === 'scale') {
      centerCInput = '10.';
      labelPrefixC = 'c';
    } else if (op === 'square') {
      centerCInput = this.centerXInput();
      rhoCInput = this.rhoXInput();
      labelPrefixC = 'x';
    } else {
      centerCInput = '1';
      labelPrefixC = 'c';
    }

    return [
      {
        nodeId: 'X',
        trackedNodeId: 'X',
        centerInput: this.centerXInput(),
        rhoInput: this.rhoXInput(),
        color: '#60a5fa',
        labelPrefix: 'x'
      },
      {
        nodeId: 'C',
        trackedNodeId: 'C',
        centerInput: centerCInput,
        rhoInput: rhoCInput,
        color: '#94a3b8',
        labelPrefix: labelPrefixC,
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
  onOperatorChange(op: BerkovichUnaryOperator) {
    this.stopPlaying();
    this.operator.set(op);
    this.history.set([]);
    // Reset inputs depending on operator
    const p = this.prime();
    if (op === 'scale') {
      this.centerXInput.set('0.1'); // 1/3
      this.centerYInput.set('1.0'); // 3
    } else if (op === 'square') {
      this.centerXInput.set('1.0'); // 1
      this.centerYInput.set('1.1'); // 4 (11_3)
    } else {
      this.centerXInput.set('1.0'); // 1
      this.centerYInput.set('1.0'); // 3 (10_3)
    }
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
      case 'X':
        if (event.field === 'center') this.centerXInput.set(event.value);
        else this.rhoXInput.set(event.value);
        break;
    }
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

    this.centerXInput.set(randomDigits());
    this.rhoXInput.set(randomRho());
    this.centerYInput.set(randomDigits());
  }

  onStep() {
    this.history.update(h => [
      ...h,
      {
        operator: this.operator(),
        centerXInput: this.centerXInput(),
        rhoXInput: this.rhoXInput(),
        centerYInput: this.centerYInput()
      }
    ]);

    const eta = this.learningRate();
    const op = this.operator();
    const p = BigInt(this.prime());

    const result = stepUnaryOperatorGradients(
      this.centerX(),
      this.rhoX(),
      op,
      this.centerY(),
      p,
      eta,
      this.vertexMethod()
    );

    this.centerXInput.set(formatDigitSequence(result.nextCenterX, p));
    this.rhoXInput.set(result.nextRhoX.toFixed(2));
  }

  onUndo() {
    this.stopPlaying();
    const h = this.history();
    if (h.length === 0) return;
    const last = h[h.length - 1];
    this.centerXInput.set(last.centerXInput);
    this.rhoXInput.set(last.rhoXInput);
    this.centerYInput.set(last.centerYInput);
    this.operator.set(last.operator);
    this.history.set(h.slice(0, -1));
  }

  onRunToggle() {
    if (this.isPlaying()) {
      this.stopPlaying();
    } else {
      this.isPlaying.set(true);
      this.playIntervalId = setInterval(() => {
        const d = this.stepDetails();
        if (d.loss <= 1e-6) {
          this.stopPlaying();
          return;
        }
        this.onStep();
      }, 150);
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
