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

import { Component, ChangeDetectionStrategy, signal, computed } from '@angular/core';
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
  stepAdditionGradients
} from '../../../lib/berkovich/berkovich';

import { BerkovichAdditionGradientsConfigComponent } from './config-card/berkovich-addition-gradients-config.component';
import { BerkovichAdditionCalculusComponent } from './calculus-card/berkovich-addition-calculus.component';
import { BerkovichMultiTreeVisComponent, TrackedNode } from '../berkovich-addition-vis/tree-vis/berkovich-multi-tree-vis.component';

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
    BerkovichAdditionGradientsConfigComponent,
    BerkovichAdditionCalculusComponent,
    BerkovichMultiTreeVisComponent
  ]
})
export class BerkovichAdditionGradientsVisComponent {
  readonly prime = signal<number>(3);
  readonly isExplainerExpanded = signal<boolean>(true);

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

### Visual Guide
* **The Trees**: The four trees represent the target disk $y$ (yellow), input disks $x_1$ (blue) and $x_2$ (pink), and the sum disk $x_1+x_2$ (purple) side-by-side.
* **Step SGD**: Click **Step SGD** to take a gradient step. You will see the paths of $x_1$ and $x_2$ adjust base-$p$ digits from lower levels upwards, shifting the sum disk $x_1+x_2$ closer and closer to matching $y$.
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
      return truncateToTreeRange(parseDigitSequence(s, BigInt(this.prime())), BigInt(this.prime()), -2, 1);
    } catch {
      return { num: 0n, den: 1n };
    }
  }

  // Output State
  readonly centerSum = computed<Rational>(() => add(this.centerX1(), this.centerX2()));
  readonly rhoSum = computed<number>(() => Math.max(this.rhoX1(), this.rhoX2()));

  // Loss and Calculus
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
    return 0; // if exactly matches, gradient is technically zero
  });

  // Multi-tree Nodes
  readonly trackedNodes = computed<TrackedNode[]>(() => {
    return [
      { id: 'Y_target', center: this.centerY(), rho: -2, color: '#fcd34d', label: 'y_c (Target)' },
      { id: 'X1', center: this.centerX1(), rho: this.rhoX1(), color: '#60a5fa', label: 'x1_ρ' },
      { id: 'X2', center: this.centerX2(), rho: this.rhoX2(), color: '#f472b6', label: 'x2_ρ' },
      { id: 'X1+X2', center: this.centerSum(), rho: this.rhoSum(), color: '#a78bfa', label: '(x1+x2)_ρ' }
    ];
  });

  // Handlers
  onPrimeChange(p: number) { this.prime.set(p); }
  
  onCenterYBlur() { this.centerYInput.set(formatDigitSequence(this.centerY(), BigInt(this.prime()))); }
  onCenterX1Blur() { this.centerX1Input.set(formatDigitSequence(this.centerX1(), BigInt(this.prime()))); }
  onCenterX2Blur() { this.centerX2Input.set(formatDigitSequence(this.centerX2(), BigInt(this.prime()))); }
  
  onRhoX1Blur() { this.rhoX1Input.set(this.rhoX1().toFixed(2)); }
  onRhoX2Blur() { this.rhoX2Input.set(this.rhoX2().toFixed(2)); }

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
      eta
    );
    
    this.centerX1Input.set(formatDigitSequence(result.nextCenterX1, BigInt(this.prime())));
    this.rhoX1Input.set(result.nextRhoX1.toFixed(2));
    this.centerX2Input.set(formatDigitSequence(result.nextCenterX2, BigInt(this.prime())));
    this.rhoX2Input.set(result.nextRhoX2.toFixed(2));
  }
}
