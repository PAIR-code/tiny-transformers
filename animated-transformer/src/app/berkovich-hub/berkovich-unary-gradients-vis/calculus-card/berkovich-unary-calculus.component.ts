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

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownComponent } from 'ngx-markdown';
import { formatRational } from '../../../../lib/berkovich/berkovich';
import { BerkovichUnaryOperator } from '../../../../lib/berkovich/berkovich_gradients';

@Component({
  selector: 'app-berkovich-unary-calculus',
  template: `
    <mat-card class="calc-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>functions</mat-icon>
          Non-Archimedean Unary Flow
        </mat-card-title>
        <mat-card-subtitle>
          {{ subtitle() }}
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content class="calc-content">
        <div class="explainer-section">
          <markdown [katex]="true" [data]="explainerMarkdown()"></markdown>
        </div>

        <div class="math-block">
          <div class="eq-row">
            <markdown [katex]="true" [data]="outRowMarkdown()"></markdown>
          </div>
          
          <div class="eq-section-title">Active Degree (Derivative):</div>
          <div class="eq-row indent">
            <markdown [katex]="true" [data]="drhoXMarkdown()"></markdown>
          </div>

          <hr class="divider"/>

          <div class="eq-section-title">Loss Gradient (L1 Path Metric):</div>
          <div class="eq-row indent">
            <markdown [katex]="true" [data]="lossGradMarkdown()"></markdown>
          </div>

          <div class="eq-section-title">Backpropagation:</div>
          <div class="eq-row indent">
            <markdown [katex]="true" [data]="backpropXMarkdown()"></markdown>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .calc-card { }
    
    mat-card-header {
      padding: 12px 16px;
      border-bottom: 1px solid #e2e8f0;
    }
    
    mat-card-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      
      mat-icon {
        color: #0f766e;
      }
    }
    
    .calc-content { padding: 16px; }
    .explainer-section { color: #475569; font-size: 13px; line-height: 1.5; margin-bottom: 16px; }
    
    .math-block { display: flex; flex-direction: column; gap: 8px; }
    .eq-section-title { font-size: 12px; font-weight: 700; color: #475569; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .eq-row { display: flex; align-items: center; }
    .indent { padding-left: 12px; }
    
    .divider { border: 0; border-top: 1px dashed #e2e8f0; margin: 12px 0; width: 100%; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatCardModule, MatIconModule, MarkdownComponent]
})
export class BerkovichUnaryCalculusComponent {
  readonly operator = input<BerkovichUnaryOperator>('shift');
  readonly rhoX = input.required<number>();
  readonly stepDetails = input.required<any>();

  readonly subtitle = computed(() => {
    const op = this.operator();
    if (op === 'scale') return 'Scaling operator f(x) = p * x';
    if (op === 'square') return 'Squaring operator f(x) = x²';
    return 'Shift operator f(x) = x + 1';
  });

  readonly explainerMarkdown = computed(() => {
    const op = this.operator();
    if (op === 'scale') {
      return `
The **scaling operator** $f(x) = p \\cdot x$ scales the center and shifts the uncertainty level downwards.
In p-adic metrics:
$$(p \\cdot x)_c = p \\cdot x_c, \\quad (p \\cdot x)_\\rho = \\rho_x - 1$$
Because multiplying by $p$ (valuation $1$, norm $p^{-1}$) reduces the radius of the disk by a factor of $p$.
      `;
    }
    if (op === 'square') {
      return `
The **squaring operator** $f(x) = x^2$ squares the center and propagates the radius using Taylor expansion properties:
$$(x^2)_c = x_c^2, \\quad (x^2)_\\rho = \\max(\\log_p |x_c|_p + \\rho_x, \\quad 2\\rho_x)$$
The active degree w.r.t $\\rho_x$ is $1.0$ if the first term dominates, and $2.0$ if the second term dominates.
      `;
    }
    return `
The **shift operator** $f(x) = x + 1$ translates the center by $1$ and leaves the uncertainty radius unchanged.
In p-adic metrics:
$$(x + 1)_c = x_c + 1, \\quad (x + 1)_\\rho = \\rho_x$$
      `;
  });

  readonly outRowMarkdown = computed(() => {
    const op = this.operator();
    const details = this.stepDetails();
    const outCenterStr = details.out?.center ? formatRational(details.out.center) : '?';
    if (op === 'scale') {
      return `$$f(x)_c = \\text{scale}(x_c) = ${outCenterStr}$$
              $$f(x)_\\rho = \\rho_x - 1 = ${details.out?.rho !== undefined ? details.out.rho.toFixed(2) : '?'}$$`;
    }
    if (op === 'square') {
      return `$$f(x)_c = x_c^2 = ${outCenterStr}$$
              $$f(x)_\\rho = \\max(\\log_p |x_c|_p + \\rho_x, 2\\rho_x) = ${details.out?.rho !== undefined ? details.out.rho.toFixed(2) : '?'}$$`;
    }
    return `$$f(x)_c = x_c + 1 = ${outCenterStr}$$
            $$f(x)_\\rho = \\rho_x = ${details.out?.rho !== undefined ? details.out.rho.toFixed(2) : '?'}$$`;
  });

  readonly drhoXMarkdown = computed(() => {
    const details = this.stepDetails();
    const val = details.drhoOut_drhoX !== undefined ? details.drhoOut_drhoX.toFixed(2) : '?';
    return `$$\\frac{\\partial f(x)_\\rho}{\\partial \\rho_x} = ${val}$$`;
  });

  readonly lossGradMarkdown = computed(() => {
    const details = this.stepDetails();
    const val = details.drOut !== undefined ? details.drOut.toFixed(1) : '?';
    const sgnText = val === '1.0' ? '1 \\quad (\\text{shrink } f(x))' : val === '-1.0' ? '-1 \\quad (\\text{expand } f(x))' : '0';
    return `$$\\frac{\\partial L}{\\partial f(x)_\\rho} = \\operatorname{sgn}(f(x)_\\rho - d) = ${sgnText}$$`;
  });

  readonly backpropXMarkdown = computed(() => {
    const details = this.stepDetails();
    const dr = details.drOut;
    const deg = details.drhoOut_drhoX;
    let finalGradStr = '?';
    if (dr !== undefined && deg !== undefined) {
      finalGradStr = (dr * deg).toFixed(2);
    }
    return `$$\\frac{\\partial L}{\\partial \\rho_x} = \\frac{\\partial L}{\\partial f(x)_\\rho} \\cdot \\frac{\\partial f(x)_\\rho}{\\partial \\rho_x} = ${finalGradStr}$$`;
  });
}
