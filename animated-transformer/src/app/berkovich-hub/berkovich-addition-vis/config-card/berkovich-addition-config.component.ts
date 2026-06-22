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
  selector: 'app-berkovich-addition-config',
  template: `
    <mat-card class="config-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>settings</mat-icon>
          Addition Configuration
        </mat-card-title>
      </mat-card-header>
      <mat-card-content class="config-content">
        <!-- Disk x -->
        <div class="node-config node-a">
          <div class="node-title">Disk x (x<sub>c</sub>, x<sub>ρ</sub>) [Blue]</div>
          <div class="fields-row">
            <mat-form-field appearance="outline" class="flex-field">
              <mat-label>Center x<sub>c</sub></mat-label>
              <input matInput [ngModel]="centerAInput()" (ngModelChange)="centerAInputChange.emit($event)" (blur)="centerABlur.emit()" />
              <mat-hint>base-p digits</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="flex-field small-field">
              <mat-label>Radius x<sub>ρ</sub></mat-label>
              <input matInput type="number" step="1" [ngModel]="rhoAInput()" (ngModelChange)="rhoAInputChange.emit($event)" (blur)="rhoABlur.emit()" />
            </mat-form-field>
          </div>
        </div>

        <!-- Disk y -->
        <div class="node-config node-b">
          <div class="node-title">Disk y (y<sub>c</sub>, y<sub>ρ</sub>) [Pink]</div>
          <div class="fields-row">
            <mat-form-field appearance="outline" class="flex-field">
              <mat-label>Center y<sub>c</sub></mat-label>
              <input matInput [ngModel]="centerBInput()" (ngModelChange)="centerBInputChange.emit($event)" (blur)="centerBBlur.emit()" />
              <mat-hint>base-p digits</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="flex-field small-field">
              <mat-label>Radius y<sub>ρ</sub></mat-label>
              <input matInput type="number" step="1" [ngModel]="rhoBInput()" (ngModelChange)="rhoBInputChange.emit($event)" (blur)="rhoBBlur.emit()" />
            </mat-form-field>
          </div>
        </div>

        <div class="fields-row bottom-controls">
          <mat-form-field appearance="outline" class="flex-field small-field">
            <mat-label>Prime p</mat-label>
            <input matInput type="number" [ngModel]="prime()" (ngModelChange)="primeChange.emit($event)" min="2" max="11" step="1" />
          </mat-form-field>
          <button mat-flat-button color="accent" (click)="randomize.emit()">
            <mat-icon>shuffle</mat-icon>
            Randomize
          </button>
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatCardModule, MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule, FormsModule]
})
export class BerkovichAdditionConfigComponent {
  readonly prime = input.required<number>();
  readonly centerAInput = input.required<string>();
  readonly rhoAInput = input.required<string>();
  readonly centerBInput = input.required<string>();
  readonly rhoBInput = input.required<string>();

  readonly primeChange = output<number>();
  
  readonly centerAInputChange = output<string>();
  readonly centerABlur = output<void>();
  readonly rhoAInputChange = output<string>();
  readonly rhoABlur = output<void>();
  
  readonly centerBInputChange = output<string>();
  readonly centerBBlur = output<void>();
  readonly rhoBInputChange = output<string>();
  readonly rhoBBlur = output<void>();
  
  readonly randomize = output<void>();
}
