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

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-berkovich-addition-gradients-config',
  template: `
    <mat-card class="config-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>settings</mat-icon>
          Gradient Config (x₁ + x₂ → y)
        </mat-card-title>
      </mat-card-header>
      <mat-card-content class="config-content">
        <!-- Target Disk y -->
        <div class="node-config node-y">
          <div class="node-title">Target Disk y (y<sub>c</sub>) [Yellow]</div>
          <div class="fields-row">
            <mat-form-field appearance="outline" class="flex-field">
              <mat-label>Center y<sub>c</sub></mat-label>
              <input matInput [ngModel]="centerYInput()" (ngModelChange)="centerYInputChange.emit($event)" (blur)="centerYBlur.emit()" />
              <mat-hint>base-p digits</mat-hint>
            </mat-form-field>
          </div>
        </div>

        <!-- Disk x1 -->
        <div class="node-config node-a">
          <div class="node-title">Disk x₁ (x₁<sub>c</sub>, x₁<sub>ρ</sub>) [Blue]</div>
          <div class="fields-row">
            <mat-form-field appearance="outline" class="flex-field">
              <mat-label>Center x₁<sub>c</sub></mat-label>
              <input matInput [ngModel]="centerX1Input()" (ngModelChange)="centerX1InputChange.emit($event)" (blur)="centerX1Blur.emit()" />
              <mat-hint>base-p digits</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="flex-field small-field">
              <mat-label>Radius x₁<sub>ρ</sub></mat-label>
              <input matInput type="number" step="1" [ngModel]="rhoX1Input()" (ngModelChange)="rhoX1InputChange.emit($event)" (blur)="rhoX1Blur.emit()" />
            </mat-form-field>
          </div>
        </div>

        <!-- Disk x2 -->
        <div class="node-config node-b">
          <div class="node-title">Disk x₂ (x₂<sub>c</sub>, x₂<sub>ρ</sub>) [Pink]</div>
          <div class="fields-row">
            <mat-form-field appearance="outline" class="flex-field">
              <mat-label>Center x₂<sub>c</sub></mat-label>
              <input matInput [ngModel]="centerX2Input()" (ngModelChange)="centerX2InputChange.emit($event)" (blur)="centerX2Blur.emit()" />
              <mat-hint>base-p digits</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="flex-field small-field">
              <mat-label>Radius x₂<sub>ρ</sub></mat-label>
              <input matInput type="number" step="1" [ngModel]="rhoX2Input()" (ngModelChange)="rhoX2InputChange.emit($event)" (blur)="rhoX2Blur.emit()" />
            </mat-form-field>
          </div>
        </div>

        <div class="fields-row bottom-controls">
          <mat-form-field appearance="outline" class="flex-field small-field">
            <mat-label>Prime p</mat-label>
            <input matInput type="number" [ngModel]="prime()" (ngModelChange)="primeChange.emit($event)" min="2" max="11" step="1" />
          </mat-form-field>
          <div class="button-group">
            <button mat-stroked-button color="accent" (click)="randomize.emit()">
              <mat-icon>shuffle</mat-icon>
              Randomize
            </button>
            <button mat-flat-button color="accent" (click)="step.emit()">
              <mat-icon>fast_forward</mat-icon>
              Step SGD
            </button>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .config-card { background: white; }
    .config-content { display: flex; flex-direction: column; gap: 16px; padding: 16px 16px 8px; }
    
    .node-config {
      padding: 12px;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
    
    .node-y { border-left: 4px solid #fcd34d; }
    .node-a { border-left: 4px solid #60a5fa; }
    .node-b { border-left: 4px solid #f472b6; }
    
    .node-title { font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #475569; }
    .node-y .node-title { color: #d97706; }
    .node-a .node-title { color: #2563eb; }
    .node-b .node-title { color: #db2777; }
    
    .fields-row { display: flex; gap: 12px; align-items: flex-start; }
    .flex-field { flex: 1; margin-bottom: -16px; }
    .small-field { flex: 0 0 100px; }
    
    .bottom-controls { align-items: center; justify-content: space-between; }
    .button-group { display: flex; gap: 8px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatCardModule, MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule, FormsModule]
})
export class BerkovichAdditionGradientsConfigComponent {
  readonly prime = input.required<number>();
  
  readonly centerYInput = input.required<string>();
  readonly centerX1Input = input.required<string>();
  readonly rhoX1Input = input.required<string>();
  readonly centerX2Input = input.required<string>();
  readonly rhoX2Input = input.required<string>();

  readonly primeChange = output<number>();
  
  readonly centerYInputChange = output<string>();
  readonly centerYBlur = output<void>();
  
  readonly centerX1InputChange = output<string>();
  readonly centerX1Blur = output<void>();
  readonly rhoX1InputChange = output<string>();
  readonly rhoX1Blur = output<void>();
  
  readonly centerX2InputChange = output<string>();
  readonly centerX2Blur = output<void>();
  readonly rhoX2InputChange = output<string>();
  readonly rhoX2Blur = output<void>();
  
  readonly step = output<void>();
  readonly randomize = output<void>();
}
