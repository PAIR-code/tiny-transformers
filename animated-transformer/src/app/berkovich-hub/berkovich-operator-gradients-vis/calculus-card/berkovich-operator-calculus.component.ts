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

export type BerkovichBinaryOperator = 'addition' | 'multiplication' | 'softmax';

@Component({
  selector: 'app-berkovich-operator-calculus',
  template: `
    <mat-card class="calc-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>functions</mat-icon>
          Non-Archimedean Gradient Flow
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
          @if (operator() !== 'softmax') {
            <div class="eq-row">
              <markdown [katex]="true" [data]="outRowMarkdown()"></markdown>
            </div>
            
            <div class="eq-section-title">Active Degree (Derivative):</div>
            <div class="eq-row indent">
              <markdown [katex]="true" [data]="drhoX1Markdown()"></markdown>
            </div>
            <div class="eq-row indent">
              <markdown [katex]="true" [data]="drhoX2Markdown()"></markdown>
            </div>

            <hr class="divider"/>

            <div class="eq-section-title">Loss Gradient (L1 Path Metric):</div>
            <div class="eq-row indent">
              <markdown [katex]="true" [data]="lossGradMarkdown()"></markdown>
            </div>

            <div class="eq-section-title">Backpropagation:</div>
            <div class="eq-row indent">
              <markdown [katex]="true" [data]="backpropX1Markdown()"></markdown>
            </div>
            <div class="eq-row indent">
              <markdown [katex]="true" [data]="backpropX2Markdown()"></markdown>
            </div>
          } @else {
            <div class="eq-section-title">Class Probabilities & Loss:</div>
            <div class="eq-row indent">
              <markdown [katex]="true" [data]="softmaxProbMarkdown()"></markdown>
            </div>
            
            <div class="eq-section-title">Backpropagation (Cross-Entropy Gradients):</div>
            <div class="eq-row indent">
              <markdown [katex]="true" [data]="softmaxBackpropX1Markdown()"></markdown>
            </div>
            <div class="eq-row indent">
              <markdown [katex]="true" [data]="softmaxBackpropX2Markdown()"></markdown>
            </div>
          }
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
export class BerkovichOperatorCalculusComponent {
  readonly operator = input<BerkovichBinaryOperator>('addition');
  readonly rhoX1 = input.required<number>();
  readonly rhoX2 = input.required<number>();
  readonly stepDetails = input.required<any>();

  readonly subtitle = computed(() => {
    const op = this.operator();
    if (op === 'multiplication') return 'Chain rule for f(x₁, x₂) = x₁ * x₂';
    if (op === 'softmax') return 'Affinoid Softmax classification';
    return 'Chain rule for f(x₁, x₂) = x₁ + x₂';
  });

  readonly explainerMarkdown = computed(() => {
    const op = this.operator();
    if (op === 'multiplication') {
      return `Under non-Archimedean multiplication, the product's radius is governed by the max-plus formula: $(x_1 \\cdot x_2)_\\rho = \\max(\\log_p |x_1|_p + x_{2,\\rho}, \\log_p |x_2|_p + x_{1,\\rho}, x_{1,\\rho} + x_{2,\\rho})$. Active degrees are determined by the dominating term.`;
    }
    if (op === 'softmax') {
      return `Affinoid classification computes logs of class centroid distances to input target $y$. Loss is Cross-Entropy: $\\mathcal{L}_{\\text{CE}} = -\\log(\\pi_1)$ (assuming Class 1 is correct).`;
    }
    return `Under non-Archimedean addition, the sum's radius is dominated by the maximum input radius: $(x_1+x_2)_\\rho = \\max(x_{1,\\rho}, x_{2,\\rho})$. Consequently, the gradient propagates strictly to the input parameter with the larger radius.`;
  });

  readonly outRowMarkdown = computed(() => {
    const op = this.operator();
    const r1 = this.rhoX1().toFixed(2);
    const r2 = this.rhoX2().toFixed(2);
    const details = this.stepDetails();
    if (op === 'multiplication') {
      const outR = details.outRho.toFixed(2);
      return `$(x_1 \\cdot x_2)_\\rho = \\max(\\log_p |x_{1}|_p + ${r2}, \\log_p |x_{2}|_p + ${r1}, ${r1} + ${r2}) = ${outR}$`;
    }
    const outR = details.outRho.toFixed(2);
    return `$(x_1+x_2)_\\rho = \\max(x_{1,\\rho}, x_{2,\\rho}) = \\max(${r1}, ${r2}) = ${outR}$`;
  });

  readonly drhoX1Markdown = computed(() => {
    const op = this.operator();
    const details = this.stepDetails();
    const val = details.drhoX1;
    const isAct = val > 0;
    const valStr = isAct ? `\\color{#10b981}{\\mathbf{${val.toFixed(2)}}}` : `${val.toFixed(2)}`;
    if (op === 'multiplication') {
      return `$\\frac{\\partial (x_1 \\cdot x_2)_\\rho}{\\partial x_{1,\\rho}} = ${valStr}$`;
    }
    return `$\\frac{\\partial (x_1+x_2)_\\rho}{\\partial x_{1,\\rho}} = ${valStr}$`;
  });

  readonly drhoX2Markdown = computed(() => {
    const op = this.operator();
    const details = this.stepDetails();
    const val = details.drhoX2;
    const isAct = val > 0;
    const valStr = isAct ? `\\color{#10b981}{\\mathbf{${val.toFixed(2)}}}` : `${val.toFixed(2)}`;
    if (op === 'multiplication') {
      return `$\\frac{\\partial (x_1 \\cdot x_2)_\\rho}{\\partial x_{2,\\rho}} = ${valStr}$`;
    }
    return `$\\frac{\\partial (x_1+x_2)_\\rho}{\\partial x_{2,\\rho}} = ${valStr}$`;
  });

  readonly lossGradMarkdown = computed(() => {
    const op = this.operator();
    const details = this.stepDetails();
    const val = details.drOut;
    const valStr = val > 0 ? '+1' : (val < 0 ? '-1' : '0');
    const isAct = val !== 0;
    const styledVal = isAct ? `\\color{#10b981}{\\mathbf{${valStr}}}` : `${valStr}`;
    if (op === 'multiplication') {
      return `$\\frac{\\partial L}{\\partial (x_1 \\cdot x_2)_\\rho} = ${styledVal}$`;
    }
    return `$\\frac{\\partial L}{\\partial (x_1+x_2)_\\rho} = ${styledVal}$`;
  });

  readonly backpropX1Markdown = computed(() => {
    const op = this.operator();
    const details = this.stepDetails();
    const dL = details.drOut;
    const val = details.drhoX1;
    const result = dL * val;
    const isAct = val > 0 && dL !== 0;
    const styledResult = isAct ? `\\color{#10b981}{\\mathbf{${result.toFixed(2)}}}` : `${result.toFixed(2)}`;
    if (op === 'multiplication') {
      return `$\\frac{\\partial L}{\\partial x_{1,\\rho}} = \\frac{\\partial L}{\\partial (x_1 \\cdot x_2)_\\rho} \\cdot \\frac{\\partial (x_1 \\cdot x_2)_\\rho}{\\partial x_{1,\\rho}} = ${dL} \\cdot ${val.toFixed(2)} = ${styledResult}$`;
    }
    return `$\\frac{\\partial L}{\\partial x_{1,\\rho}} = \\frac{\\partial L}{\\partial (x_1+x_2)_\\rho} \\cdot \\frac{\\partial (x_1+x_2)_\\rho}{\\partial x_{1,\\rho}} = ${dL} \\cdot ${val.toFixed(2)} = ${styledResult}$`;
  });

  readonly backpropX2Markdown = computed(() => {
    const op = this.operator();
    const details = this.stepDetails();
    const dL = details.drOut;
    const val = details.drhoX2;
    const result = dL * val;
    const isAct = val > 0 && dL !== 0;
    const styledResult = isAct ? `\\color{#10b981}{\\mathbf{${result.toFixed(2)}}}` : `${result.toFixed(2)}`;
    if (op === 'multiplication') {
      return `$\\frac{\\partial L}{\\partial x_{2,\\rho}} = \\frac{\\partial L}{\\partial (x_1 \\cdot x_2)_\\rho} \\cdot \\frac{\\partial (x_1 \\cdot x_2)_\\rho}{\\partial x_{2,\\rho}} = ${dL} \\cdot ${val.toFixed(2)} = ${styledResult}$`;
    }
    return `$\\frac{\\partial L}{\\partial x_{2,\\rho}} = \\frac{\\partial L}{\\partial (x_1+x_2)_\\rho} \\cdot \\frac{\\partial (x_1+x_2)_\\rho}{\\partial x_{2,\\rho}} = ${dL} \\cdot ${val.toFixed(2)} = ${styledResult}$`;
  });

  readonly softmaxProbMarkdown = computed(() => {
    const details = this.stepDetails();
    const p1 = details.pi1.toFixed(3);
    const p2 = details.pi2.toFixed(3);
    const loss = details.loss.toFixed(4);
    return `$\\pi_1 = ${p1}, \\quad \\pi_2 = ${p2} \\implies \\mathcal{L}_{\\text{CE}} = ${loss}$`;
  });

  readonly softmaxBackpropX1Markdown = computed(() => {
    const details = this.stepDetails();
    const val = details.drhoX1;
    const isAct = Math.abs(val) > 0.001;
    const valStr = isAct ? `\\color{#10b981}{\\mathbf{${val.toFixed(3)}}}` : `${val.toFixed(3)}`;
    return `$\\frac{\\partial \\mathcal{L}_{\\text{CE}}}{\\partial x_{1,\\rho}} = \\beta(1 - \\pi_1) \\operatorname{sgn}(x_{1,\\rho} - d_1) = ${valStr}$`;
  });

  readonly softmaxBackpropX2Markdown = computed(() => {
    const details = this.stepDetails();
    const val = details.drhoX2;
    const isAct = Math.abs(val) > 0.001;
    const valStr = isAct ? `\\color{#10b981}{\\mathbf{${val.toFixed(3)}}}` : `${val.toFixed(3)}`;
    if (val === 0) {
      return `$\\frac{\\partial \\mathcal{L}_{\\text{CE}}}{\\partial x_{2,\\rho}} = 0 \\quad (\\text{outside domain})$`;
    }
    return `$\\frac{\\partial \\mathcal{L}_{\\text{CE}}}{\\partial x_{2,\\rho}} = -\\beta \\pi_2 \\operatorname{sgn}(x_{2,\\rho} - d_2) = ${valStr}$`;
  });
}
