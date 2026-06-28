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

@Component({
  selector: 'app-berkovich-addition-calculus',
  template: `
    <mat-card class="calc-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>functions</mat-icon>
          Non-Archimedean Gradient Flow
        </mat-card-title>
        <mat-card-subtitle>
          Chain rule for f(x₁, x₂) = x₁ + x₂
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content class="calc-content">
        <div class="explainer-section">
          <markdown [katex]="true" [data]="explainerMarkdown"></markdown>
        </div>

        <div class="math-block">
          <div class="eq-row">
            <markdown [katex]="true" [data]="sumRowMarkdown()"></markdown>
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
export class BerkovichAdditionCalculusComponent {
  readonly rhoX1 = input.required<number>();
  readonly rhoX2 = input.required<number>();
  readonly dL_drhoSum = input.required<number>();
  
  readonly rhoSum = computed(() => Math.max(this.rhoX1(), this.rhoX2()));
  
  readonly activeDegrees = computed(() => {
    const r1 = this.rhoX1();
    const r2 = this.rhoX2();
    if (r1 > r2) return { x1: 1, x2: 0 };
    if (r2 > r1) return { x1: 0, x2: 1 };
    return { x1: 0.5, x2: 0.5 };
  });

  readonly sumRowMarkdown = computed(() => {
    const r1 = this.rhoX1().toFixed(2);
    const r2 = this.rhoX2().toFixed(2);
    const rSum = this.rhoSum().toFixed(2);
    return `$(x_1+x_2)_\\rho = \\max(x_{1,\\rho}, x_{2,\\rho}) = \\max(${r1}, ${r2}) = ${rSum}$`;
  });

  readonly drhoX1Markdown = computed(() => {
    const val = this.activeDegrees().x1;
    const isAct = val > 0;
    const valStr = isAct ? `\\color{#10b981}{\\mathbf{${val}}}` : `${val}`;
    const reason = this.rhoX1() >= this.rhoX2() ? 'x_{1,\\rho} \\ge x_{2,\\rho}' : 'x_{1,\\rho} < x_{2,\\rho}';
    return `$\\frac{\\partial (x_1+x_2)_\\rho}{\\partial x_{1,\\rho}} = ${valStr} \\quad (${reason})$`;
  });

  readonly drhoX2Markdown = computed(() => {
    const val = this.activeDegrees().x2;
    const isAct = val > 0;
    const valStr = isAct ? `\\color{#10b981}{\\mathbf{${val}}}` : `${val}`;
    const reason = this.rhoX2() >= this.rhoX1() ? 'x_{2,\\rho} \\ge x_{1,\\rho}' : 'x_{2,\\rho} < x_{1,\\rho}';
    return `$\\frac{\\partial (x_1+x_2)_\\rho}{\\partial x_{2,\\rho}} = ${valStr} \\quad (${reason})$`;
  });

  readonly lossGradMarkdown = computed(() => {
    const val = this.dL_drhoSum();
    const valStr = val > 0 ? '+1' : (val < 0 ? '-1' : '0');
    const isAct = val !== 0;
    const styledVal = isAct ? `\\color{#10b981}{\\mathbf{${valStr}}}` : `${valStr}`;
    return `$\\frac{\\partial L}{\\partial (x_1+x_2)_\\rho} = ${styledVal}$`;
  });

  readonly backpropX1Markdown = computed(() => {
    const dL = this.dL_drhoSum();
    const val = this.activeDegrees().x1;
    const result = dL * val;
    const isAct = val > 0 && dL !== 0;
    const styledResult = isAct ? `\\color{#10b981}{\\mathbf{${result.toFixed(2)}}}` : `${result.toFixed(2)}`;
    return `$\\frac{\\partial L}{\\partial x_{1,\\rho}} = \\frac{\\partial L}{\\partial (x_1+x_2)_\\rho} \\cdot \\frac{\\partial (x_1+x_2)_\\rho}{\\partial x_{1,\\rho}} = ${dL} \\cdot ${val} = ${styledResult}$`;
  });

  readonly backpropX2Markdown = computed(() => {
    const dL = this.dL_drhoSum();
    const val = this.activeDegrees().x2;
    const result = dL * val;
    const isAct = val > 0 && dL !== 0;
    const styledResult = isAct ? `\\color{#10b981}{\\mathbf{${result.toFixed(2)}}}` : `${result.toFixed(2)}`;
    return `$\\frac{\\partial L}{\\partial x_{2,\\rho}} = \\frac{\\partial L}{\\partial (x_1+x_2)_\\rho} \\cdot \\frac{\\partial (x_1+x_2)_\\rho}{\\partial x_{2,\\rho}} = ${dL} \\cdot ${val} = ${styledResult}$`;
  });

  readonly explainerMarkdown = `
Under non-Archimedean addition, the sum's radius is dominated by the maximum input radius: $(x_1+x_2)_\\rho = \\max(x_{1,\\rho}, x_{2,\\rho})$. 
Consequently, the gradient propagates strictly to the input parameter with the larger radius.
`;
}
