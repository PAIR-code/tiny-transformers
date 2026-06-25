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
            <span class="var">(x₁+x₂)<sub>ρ</sub></span> = max(<span class="varA">x₁<sub>ρ</sub></span>, <span class="varB">x₂<sub>ρ</sub></span>) = max({{ rhoX1().toFixed(2) }}, {{ rhoX2().toFixed(2) }}) = {{ rhoSum().toFixed(2) }}
          </div>
          
          <div class="eq-row">
            <strong>Active Degree (Derivative):</strong>
          </div>
          <div class="eq-row indent">
            <markdown [inline]="true" [katex]="true" [data]="'$\\\\frac{\\\\partial (x_1+x_2)_\\\\rho}{\\\\partial x_{1,\\\\rho}} =$'"></markdown> 
            <span [class.active-val]="drhoSum_drhoX1() === 1">{{ drhoSum_drhoX1() }}</span>
            <span class="explanation"> (because {{ rhoX1() >= rhoX2() ? 'x1_ρ ≥ x2_ρ' : 'x1_ρ < x2_ρ' }})</span>
          </div>
          <div class="eq-row indent">
            <markdown [inline]="true" [katex]="true" [data]="'$\\\\frac{\\\\partial (x_1+x_2)_\\\\rho}{\\\\partial x_{2,\\\\rho}} =$'"></markdown> 
            <span [class.active-val]="drhoSum_drhoX2() === 1">{{ drhoSum_drhoX2() }}</span>
            <span class="explanation"> (because {{ rhoX2() >= rhoX1() ? 'x2_ρ ≥ x1_ρ' : 'x2_ρ < x1_ρ' }})</span>
          </div>

          <hr class="divider"/>

          <div class="eq-row">
            <strong>Loss Gradient (L1 Path Metric):</strong>
          </div>
          <div class="eq-row indent">
            <markdown [inline]="true" [katex]="true" [data]="'$\\\\frac{\\\\partial L}{\\\\partial (x_1+x_2)_\\\\rho} =$'"></markdown> 
            <span [class.active-val]="dL_drhoSum() !== 0">{{ dL_drhoSum() > 0 ? '+1' : (dL_drhoSum() < 0 ? '-1' : '0') }}</span>
          </div>

          <div class="eq-row">
            <strong>Backpropagation:</strong>
          </div>
          <div class="eq-row indent">
            <markdown [inline]="true" [katex]="true" [data]="'$\\\\frac{\\\\partial L}{\\\\partial x_{1,\\\\rho}} =$'"></markdown> 
            {{ dL_drhoSum() }} × {{ drhoSum_drhoX1() }} = 
            <span class="final-grad" [class.active-val]="drhoSum_drhoX1() === 1">{{ dL_drhoSum() * drhoSum_drhoX1() }}</span>
          </div>
          <div class="eq-row indent">
            <markdown [inline]="true" [katex]="true" [data]="'$\\\\frac{\\\\partial L}{\\\\partial x_{2,\\\\rho}} =$'"></markdown> 
            {{ dL_drhoSum() }} × {{ drhoSum_drhoX2() }} = 
            <span class="final-grad" [class.active-val]="drhoSum_drhoX2() === 1">{{ dL_drhoSum() * drhoSum_drhoX2() }}</span>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .calc-card { margin-top: 16px; background: white; border: 1px solid #e2e8f0; }
    
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
    
    .calc-content { padding: 16px; font-family: 'JetBrains Mono', 'Roboto Mono', monospace; font-size: 13px; }
    
    .math-block { display: flex; flex-direction: column; gap: 8px; }
    .eq-row { display: flex; align-items: center; gap: 8px; }
    .indent { padding-left: 16px; }
    
    .var { font-weight: bold; }
    .varA { color: #2563eb; font-weight: bold; }
    .varB { color: #db2777; font-weight: bold; }
    
    .active-val {
      color: #10b981;
      font-weight: bold;
      background: rgba(16, 185, 129, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
    }
    
    .final-grad { font-weight: bold; font-size: 14px; }
    
    .explanation { color: #64748b; font-size: 11px; }
    
    .divider { border: 0; border-top: 1px dashed #e2e8f0; margin: 8px 0; width: 100%; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatCardModule, MatIconModule, MarkdownComponent]
})
export class BerkovichAdditionCalculusComponent {
  readonly rhoX1 = input.required<number>();
  readonly rhoX2 = input.required<number>();
  readonly dL_drhoSum = input.required<number>();
  
  readonly rhoSum = computed(() => Math.max(this.rhoX1(), this.rhoX2()));
  
  readonly drhoSum_drhoX1 = computed(() => this.rhoX1() >= this.rhoX2() ? 1 : 0);
  readonly drhoSum_drhoX2 = computed(() => this.rhoX2() >= this.rhoX1() ? 1 : 0);

  readonly explainerMarkdown = `
Under non-Archimedean addition, the sum's radius is dominated by the maximum input radius: $(x_1+x_2)_\\rho = \\max(x_{1,\\rho}, x_{2,\\rho})$. 
Consequently, the gradient propagates strictly to the input parameter with the larger radius.
`;
}
