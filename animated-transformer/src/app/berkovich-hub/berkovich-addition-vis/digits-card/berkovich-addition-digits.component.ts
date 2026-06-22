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

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface AdditionDigitRow {
  power: number;
  powerLabel: string;
  digitA: number;
  digitB: number;
  digitC: number;
  isResolvedA: boolean;
  isResolvedB: boolean;
  isResolvedC: boolean;
  isCarryOut: boolean;
}

@Component({
  selector: 'app-berkovich-addition-digits',
  template: `
    <mat-card class="digits-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>calculate</mat-icon>
          p-adic Addition & Carries
        </mat-card-title>
        <mat-card-subtitle>
          Addition propagates carries to higher powers (upwards). 
          The sum's uncertainty swallowed the smaller digits below max(x<sub>ρ</sub>, y<sub>ρ</sub>).
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content class="digits-content">
        <div class="digits-table-container">
          <table class="digits-table">
            <thead>
              <tr>
                <th class="power-col">Power</th>
                <th class="digit-col a-col">x</th>
                <th class="operator-col"></th>
                <th class="digit-col b-col">y</th>
                <th class="operator-col"></th>
                <th class="digit-col c-col">x+y (Sum)</th>
                <th class="carry-col">Carry Out</th>
              </tr>
            </thead>
            <tbody>
              @for (row of digitRows(); track row.power) {
                <tr [class.unresolved-row]="!row.isResolvedC">
                  <td class="power-col">{{ row.powerLabel }}</td>
                  
                  <td class="digit-col a-col" [class.unresolved]="!row.isResolvedA">
                    <span class="digit-value">{{ row.digitA }}</span>
                  </td>
                  
                  <td class="operator-col">+</td>
                  
                  <td class="digit-col b-col" [class.unresolved]="!row.isResolvedB">
                    <span class="digit-value">{{ row.digitB }}</span>
                  </td>
                  
                  <td class="operator-col">=</td>
                  
                  <td class="digit-col c-col" [class.unresolved]="!row.isResolvedC">
                    <span class="digit-value">{{ row.digitC }}</span>
                  </td>
                  
                  <td class="carry-col">
                    @if (row.isCarryOut) {
                      <mat-icon class="carry-icon" matTooltip="Carry propagates to p^{{row.power + 1}}">
                        arrow_upward
                      </mat-icon>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .digits-card { margin-top: 16px; background: white; border: 1px solid #e2e8f0; }
    .digits-content { padding: 16px; overflow-x: auto; }
    
    .digits-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0 4px;
      font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
      
      th { text-align: center; color: #64748b; font-weight: 500; font-size: 12px; padding: 8px; }
      td { padding: 8px; text-align: center; background: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
      
      .power-col { 
        color: #94a3b8; font-weight: 600; text-align: right; 
        border-top-left-radius: 6px; border-bottom-left-radius: 6px; border-left: 1px solid #e2e8f0;
      }
      
      .a-col { color: #2563eb; }
      .b-col { color: #db2777; }
      .c-col { color: #7c3aed; font-weight: bold; }
      
      .operator-col { color: #94a3b8; width: 24px; padding: 0; }
      
      .carry-col {
        border-top-right-radius: 6px; border-bottom-right-radius: 6px; border-right: 1px solid #e2e8f0;
        color: #d97706;
        width: 40px;
      }
      
      .carry-icon { font-size: 18px; width: 18px; height: 18px; vertical-align: middle; }
      
      .unresolved {
        opacity: 0.35;
        text-decoration: line-through;
      }
      
      .unresolved-row {
        td { background: #f1f5f9; }
      }
      
      .digit-value {
        display: inline-block;
        width: 24px;
        height: 24px;
        line-height: 24px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.02);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatCardModule, MatIconModule, MatTooltipModule]
})
export class BerkovichAdditionDigitsComponent {
  readonly digitRows = input.required<AdditionDigitRow[]>();
}
