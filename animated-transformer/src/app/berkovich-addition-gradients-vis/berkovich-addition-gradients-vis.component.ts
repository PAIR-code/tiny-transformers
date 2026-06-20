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
  getValuation
} from '../../lib/berkovich/berkovich';

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

  readonly subtitleMath = '$x + y \\to z$';
  readonly explainerMarkdown = `
In non-Archimedean machine learning, we optimize parameters inside Berkovich space using continuous gradient descent (SGD). This page demonstrates training the inputs $x$ and $y$ of an addition operation $x+y$ to match a target disk $z$.

### The Loss Function & Distance
We define the loss function $L(x, y; z)$ as the branching distance between the sum disk $x+y$ and the target disk $z$:
$$L(x, y; z) = \\text{dist}(x+y, z)$$
In tree topology, this is the length of the path from the sum disk node up to the lowest common ancestor (LCA) junction with the target disk.

### How Gradients Flow
Since the sum disk's center is $(x+y)_c = x_c + y_c$ and its radius is $(x+y)_{\\rho} = \\max(x_{\\rho}, y_{\\rho})$:
1. **Gradient on Centers ($\\partial L / \\partial c$)**: The gradient on the sum center propagates back equally to the centers of $x$ and $y$. However, because the tree only branches at discrete levels, the gradient points exactly toward the branch that leads closer to the target center $z_c$.
2. **Gradient on Radii ($\\partial L / \\partial \\rho$)**: The loss is only sensitive to the radii of the inputs that dominate the sum's uncertainty. Specifically, the gradient of the sum radius $\\partial L / \\partial (x+y)_{\\rho}$ flows back:
   * Entirely to $x_{\\rho}$ if $x_{\\rho} > y_{\\rho}$
   * Entirely to $y_{\\rho}$ if $y_{\\rho} > x_{\\rho}$
   * Equally divided between them if $x_{\\rho} = y_{\\rho}$

### Visual Guide
* **The Trees**: The four trees represent the target disk $z$ (yellow), input disks $x$ (blue) and $y$ (pink), and the sum disk $x+y$ (purple) side-by-side.
* **Step SGD**: Click **Step SGD** to take a gradient step. You will see the paths of $x$ and $y$ adjust base-$p$ digits from lower levels upwards, shifting the sum disk $x+y$ closer and closer to matching $z$.
`;

  
  readonly centerYInput = signal<string>('00.00');
  readonly centerAInput = signal<string>('12.20');
  readonly rhoAInput = signal<string>('0.0');
  readonly centerBInput = signal<string>('02.20');
  readonly rhoBInput = signal<string>('-1.0');

  // Parsed State
  readonly centerY = computed<Rational>(() => this.parseParam(this.centerYInput()));
  readonly centerA = computed<Rational>(() => this.parseParam(this.centerAInput()));
  readonly centerB = computed<Rational>(() => this.parseParam(this.centerBInput()));

  readonly rhoA = computed<number>(() => {
    const v = parseFloat(this.rhoAInput());
    return isNaN(v) ? 0.0 : Math.max(-2, Math.min(2, v));
  });

  readonly rhoB = computed<number>(() => {
    const v = parseFloat(this.rhoBInput());
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
  readonly centerC = computed<Rational>(() => add(this.centerA(), this.centerB()));
  readonly rhoC = computed<number>(() => Math.max(this.rhoA(), this.rhoB()));

  // Loss and Calculus
  readonly dY = computed<number>(() => {
    const diff = subtract(this.centerC(), this.centerY());
    return -getValuation(diff, BigInt(this.prime()));
  });

  readonly dL_drhoC = computed<number>(() => {
    const rC = this.rhoC();
    const d = this.dY();
    if (rC > d) return 1;
    if (rC < d) return -1;
    return 0; // if exactly matches, gradient is technically zero
  });

  // Multi-tree Nodes
  readonly trackedNodes = computed<TrackedNode[]>(() => {
    return [
      { id: 'Z', center: this.centerY(), rho: -2, color: '#fcd34d', label: 'z_c (Target)' },
      { id: 'X', center: this.centerA(), rho: this.rhoA(), color: '#60a5fa', label: 'x_ρ' },
      { id: 'Y', center: this.centerB(), rho: this.rhoB(), color: '#f472b6', label: 'y_ρ' },
      { id: 'X+Y', center: this.centerC(), rho: this.rhoC(), color: '#a78bfa', label: '(x+y)_ρ' }
    ];
  });

  // Handlers
  onPrimeChange(p: number) { this.prime.set(p); }
  
  onCenterYBlur() { this.centerYInput.set(formatDigitSequence(this.centerY(), BigInt(this.prime()))); }
  onCenterABlur() { this.centerAInput.set(formatDigitSequence(this.centerA(), BigInt(this.prime()))); }
  onCenterBBlur() { this.centerBInput.set(formatDigitSequence(this.centerB(), BigInt(this.prime()))); }
  
  onRhoABlur() { this.rhoAInput.set(this.rhoA().toFixed(2)); }
  onRhoBBlur() { this.rhoBInput.set(this.rhoB().toFixed(2)); }

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

    this.centerAInput.set(randomDigits());
    this.centerBInput.set(randomDigits());
    this.rhoAInput.set(randomRho());
    this.rhoBInput.set(randomRho());
    this.centerYInput.set(randomDigits());
  }

  onStep() {
    const drC = this.dL_drhoC();
    const rA = this.rhoA();
    const rB = this.rhoB();
    
    const drhoC_drhoA = rA >= rB ? 1 : 0;
    const drhoC_drhoB = rB >= rA ? 1 : 0;
    
    // Constant learning rate of 1/p (represented by 0.33 for p=3)
    const eta = 1 / this.prime();
    
    const newRhoA = rA - eta * drC * drhoC_drhoA;
    const newRhoB = rB - eta * drC * drhoC_drhoB;
    
    this.rhoAInput.set(Math.max(-2, Math.min(2, newRhoA)).toFixed(2));
    this.rhoBInput.set(Math.max(-2, Math.min(2, newRhoB)).toFixed(2));
  }
}
