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
  getValuation,
  stepAdditionGradients,
  VertexResolutionMethod,
  extNegate,
  computePathLoss
} from '../../../lib/berkovich/berkovich';

import { BerkovichAdditionCalculusComponent } from './calculus-card/berkovich-addition-calculus.component';
import {
  BerkovichMultiTreeVisComponent,
  TrackedNode,
  EditableNodeInputs
} from './tree-vis/berkovich-multi-tree-vis.component';

@Component({
  selector: 'app-berkovich-addition-gradients-vis',
  templateUrl: './berkovich-addition-gradients-vis.component.html',
  styleUrls: ['./berkovich-addition-gradients-vis.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    FormsModule,
    RouterModule,
    MarkdownComponent,
    BerkovichAdditionCalculusComponent,
    BerkovichMultiTreeVisComponent
  ]
})
export class BerkovichAdditionGradientsVisComponent implements OnDestroy {
  readonly prime = signal<number>(3);
  readonly isExplainerExpanded = signal<boolean>(true);
  readonly vertexMethod = signal<VertexResolutionMethod>('exact-per-coord');
  readonly isPlaying = signal<boolean>(false);

  private playIntervalId: any = null;

  readonly subtitleMath = '$x_1 + x_2 \\to y$';
  readonly explainerMarkdown = `
In non-Archimedean machine learning, we optimize parameters inside Berkovich space using continuous gradient descent (SGD). This page demonstrates training the inputs $x_1$ and $x_2$ of an addition operation $x_1+x_2$ to match a target disk $y$.

### The Loss Function & Distance
We define the loss function $L(x_1, x_2; y)$ as the branching distance between the sum disk $x_1+x_2$ and the target disk $y$:
$$L(x_1, x_2; y) = \\text{dist}(x_1+x_2, y)$$
In tree topology, this is the length of the path from the sum disk node up to the lowest common ancestor (LCA) junction with the target disk.

### How Gradients Flow
Since the sum disk's center is $(x_1+x_2)_c = x_{1,c} + x_{2,c}$ and its radius is $(x_1+x_2)_{\\rho} = \\max(x_{1,\\rho}, x_{2,\\rho})$:
1. **Gradient on Centers ($\\partial L / \\partial c$)**: The gradient on the sum center propagates back equally to the centers of $x_1$ and $x_2$. However, because the tree only branches at discrete levels, the gradient points exactly toward the branch that leads closer to the target center $y_c$.
2. **Gradient on Radii ($\\partial L / \\partial \\rho$)**: The loss is only sensitive to the radii of the inputs that dominate the sum's uncertainty. Specifically, the gradient of the sum radius $\\partial L / \\partial (x_1+x_2)_{\\rho}$ flows back:
   * Entirely to $x_{1,\\rho}$ if $x_{1,\\rho} > x_{2,\\rho}$
   * Entirely to $x_{2,\\rho}$ if $x_{2,\\rho} > x_{1,\\rho}$
   * Equally divided between them if $x_{1,\\rho} = x_{2,\\rho}$

### Simultaneous Vertex Resolution
When both parameters simultaneously land on Type II vertices, there are three strategies for selecting branches (configurable via the dropdown):
- **Per-Coord**: Each coordinate independently selects its optimal branch. $\\mathcal{O}(k \\cdot p)$
- **Heuristic Joint**: Uses finite-field residual projection to select correlated branches. $\\mathcal{O}(k \\cdot p)$
- **Exact Joint**: Evaluates all $p^2$ combinations for global optimum. $\\mathcal{O}(p^2)$

### Visual Guide
* **The Trees**: The four trees represent the target disk $y$ (yellow), input disks $x_1$ (blue) and $x_2$ (pink), and the sum disk $x_1+x_2$ (purple) side-by-side.
* **Step SGD**: Click **Step** to take a gradient step. You will see the paths of $x_1$ and $x_2$ adjust base-$p$ digits from lower levels upwards, shifting the sum disk $x_1+x_2$ closer and closer to matching $y$.
`;


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

  // Output State
  readonly centerSum = computed<Rational>(() => add(this.centerX1(), this.centerX2()));
  readonly rhoSum = computed<number>(() => Math.max(this.rhoX1(), this.rhoX2()));

  // Loss and Calculus
  readonly loss = computed<number>(() => {
    const diff = subtract(this.centerSum(), this.centerY());
    const valDiff = getValuation(diff, BigInt(this.prime()));
    const y_rho = -2;
    return valDiff.type === 'pos-infinity' && this.rhoSum() <= y_rho
      ? 0
      : computePathLoss(this.rhoSum(), extNegate(valDiff), y_rho);
  });

  readonly dY = computed<number>(() => {
    const diff = subtract(this.centerSum(), this.centerY());
    const valDiff = getValuation(diff, BigInt(this.prime()));
    return valDiff.type === 'finite' ? -valDiff.value : -Infinity;
  });

  readonly dL_drhoSum = computed<number>(() => {
    const rSum = this.rhoSum();
    const d = this.dY();
    if (rSum > d) return 1;
    if (rSum < d) return -1;
    return 0;
  });

  // Multi-tree Nodes
  readonly trackedNodes = computed<TrackedNode[]>(() => {
    return [
      { id: 'X1', center: this.centerX1(), rho: this.rhoX1(), color: '#60a5fa', label: 'x1_ρ' },
      { id: 'X2', center: this.centerX2(), rho: this.rhoX2(), color: '#f472b6', label: 'x2_ρ' },
      { id: 'X1+X2', center: this.centerSum(), rho: this.rhoSum(), color: '#a78bfa', label: '(x1+x2)_ρ' },
      { id: 'Y_target', center: this.centerY(), rho: -2, color: '#fcd34d', label: 'y_c (Target)' }
    ];
  });

  // Editable inputs for inline editing inside the tree vis
  readonly editableInputs = computed<EditableNodeInputs[]>(() => {
    const p = BigInt(this.prime());
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
        nodeId: 'X1+X2',
        trackedNodeId: 'X1+X2',
        centerInput: formatDigitSequence(this.centerSum(), p),
        rhoInput: this.rhoSum().toFixed(2),
        color: '#7c3aed',
        labelPrefix: 'x₁+x₂',
        readonly: true
      },
      {
        nodeId: 'Y',
        trackedNodeId: 'Y_target',
        centerInput: this.centerYInput(),
        color: '#d97706',
        labelPrefix: 'y'
      }
    ];
  });

  // Handlers
  onPrimeChange(p: number) {
    this.stopPlaying();
    this.prime.set(p);
  }

  onInputChange(event: { nodeId: string; field: 'center' | 'rho'; value: string }) {
    this.stopPlaying();
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

  onRandomize() {
    this.stopPlaying();
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
    const eta = 1 / this.prime();
    const result = stepAdditionGradients(
      this.centerX1(),
      this.rhoX1(),
      this.centerX2(),
      this.rhoX2(),
      this.centerY(),
      BigInt(this.prime()),
      eta,
      this.vertexMethod()
    );

    this.centerX1Input.set(
      formatDigitSequence(result.nextCenterX1, BigInt(this.prime()))
    );
    this.rhoX1Input.set(result.nextRhoX1.toFixed(2));
    this.centerX2Input.set(
      formatDigitSequence(result.nextCenterX2, BigInt(this.prime()))
    );
    this.rhoX2Input.set(result.nextRhoX2.toFixed(2));
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
    this.playIntervalId = setInterval(() => {
      if (this.loss() <= 1e-7) {
        this.stopPlaying();
        return;
      }
      this.onStep();
    }, 500);
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
