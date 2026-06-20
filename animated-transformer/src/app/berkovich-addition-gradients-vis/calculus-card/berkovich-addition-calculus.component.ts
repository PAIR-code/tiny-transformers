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
          Chain rule for f(A,B) = A + B
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content class="calc-content">
        <div class="explainer-section">
          <markdown [katex]="true" [data]="explainerMarkdown"></markdown>
        </div>

        <div class="math-block">
          <div class="eq-row">
            <span class="var">(x+y)<sub>ρ</sub></span> = max(<span class="varA">x<sub>ρ</sub></span>, <span class="varB">y<sub>ρ</sub></span>) = max({{ rhoA().toFixed(2) }}, {{ rhoB().toFixed(2) }}) = {{ rhoC().toFixed(2) }}
          </div>
          
          <div class="eq-row">
            <strong>Active Degree (Derivative):</strong>
          </div>
          <div class="eq-row indent">
            <markdown [inline]="true" [katex]="true" [data]="'$\\\\frac{\\\\partial (x+y)_\\\\rho}{\\\\partial x_\\\\rho} =$'"></markdown> 
            <span [class.active-val]="drhoC_drhoA() === 1">{{ drhoC_drhoA() }}</span>
            <span class="explanation"> (because {{ rhoA() >= rhoB() ? 'x_ρ ≥ y_ρ' : 'x_ρ < y_ρ' }})</span>
          </div>
          <div class="eq-row indent">
            <markdown [inline]="true" [katex]="true" [data]="'$\\\\frac{\\\\partial (x+y)_\\\\rho}{\\\\partial y_\\\\rho} =$'"></markdown> 
            <span [class.active-val]="drhoC_drhoB() === 1">{{ drhoC_drhoB() }}</span>
            <span class="explanation"> (because {{ rhoB() >= rhoA() ? 'y_ρ ≥ x_ρ' : 'y_ρ < x_ρ' }})</span>
          </div>

          <hr class="divider"/>

          <div class="eq-row">
            <strong>Loss Gradient (L1 Path Metric):</strong>
          </div>
          <div class="eq-row indent">
            <markdown [inline]="true" [katex]="true" [data]="'$\\\\frac{\\\\partial L}{\\\\partial (x+y)_\\\\rho} =$'"></markdown> 
            <span [class.active-val]="dL_drhoC() !== 0">{{ dL_drhoC() > 0 ? '+1' : (dL_drhoC() < 0 ? '-1' : '0') }}</span>
          </div>

          <div class="eq-row">
            <strong>Backpropagation:</strong>
          </div>
          <div class="eq-row indent">
            <markdown [inline]="true" [katex]="true" [data]="'$\\\\frac{\\\\partial L}{\\\\partial x_\\\\rho} =$'"></markdown> 
            {{ dL_drhoC() }} × {{ drhoC_drhoA() }} = 
            <span class="final-grad" [class.active-val]="drhoC_drhoA() === 1">{{ dL_drhoC() * drhoC_drhoA() }}</span>
          </div>
          <div class="eq-row indent">
            <markdown [inline]="true" [katex]="true" [data]="'$\\\\frac{\\\\partial L}{\\\\partial y_\\\\rho} =$'"></markdown> 
            {{ dL_drhoC() }} × {{ drhoC_drhoB() }} = 
            <span class="final-grad" [class.active-val]="drhoC_drhoB() === 1">{{ dL_drhoC() * drhoC_drhoB() }}</span>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .calc-card { margin-top: 16px; background: white; border: 1px solid #e2e8f0; }
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
  readonly rhoA = input.required<number>();
  readonly rhoB = input.required<number>();
  readonly dL_drhoC = input.required<number>();
  
  readonly rhoC = computed(() => Math.max(this.rhoA(), this.rhoB()));
  
  readonly drhoC_drhoA = computed(() => this.rhoA() >= this.rhoB() ? 1 : 0);
  readonly drhoC_drhoB = computed(() => this.rhoB() >= this.rhoA() ? 1 : 0);

  readonly explainerMarkdown = `
Under non-Archimedean addition, the sum's radius is dominated by the maximum input radius: $(x+y)_\\rho = \\max(x_\\rho, y_\\rho)$. 
Consequently, the gradient propagates strictly to the input parameter with the larger radius.
`;
}
