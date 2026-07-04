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

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Rational } from '../../../../../lib/berkovich/berkovich';
import { BerkovichDigitDisplayComponent } from '../../../berkovich-digit-display/berkovich-digit-display.component';

@Component({
  selector: 'app-berkovich-dimension-calculation',
  imports: [CommonModule, MatIconModule, BerkovichDigitDisplayComponent],
  template: `
    <div style="display: flex; flex-direction: column; gap: 4px; padding: 6px 10px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #3b82f6; width: 100%; box-sizing: border-box;">
      
      <!-- Primary Display: Dimension and Loss -->
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <div style="font-weight: 600; font-size: 11.5px; color: #334155; display: flex; align-items: center; gap: 6px;">
          <span style="background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">
            Dim {{ dim() }}
          </span>
          <span style="font-weight: normal; color: #64748b;">
            Loss <i>L</i><sub><i>d</i></sub> =
          </span>
          <strong style="color: #ef4444; font-size: 12px; font-family: monospace;">
            {{ loss().toFixed(4) }}
          </strong>
        </div>

        <!-- Mini Unfold Trigger -->
        <button 
          style="background: transparent; border: none; font-size: 11px; font-weight: 600; color: #2563eb; cursor: pointer; display: flex; align-items: center; gap: 2px; padding: 2px 6px; border-radius: 4px; user-select: none; outline: none;"
          (click)="expanded = !expanded"
          type="button"
        >
          <span>{{ expanded ? 'Hide details' : 'Unfold calculation' }}</span>
          <mat-icon style="font-size: 14px; height: 14px; width: 14px; color: #2563eb; margin: 0;">
            {{ expanded ? 'expand_less' : 'expand_more' }}
          </mat-icon>
        </button>
      </div>

      <!-- Expanded Calculation Arithmetic -->
      @if (expanded) {
        <div style="margin-top: 8px; border-top: 1px dashed #cbd5e1; padding-top: 8px; display: flex; flex-direction: column; gap: 8px; font-size: 11px; line-height: 1.4; color: #475569;">
          
          <!-- Classifier Constraint Disk -->
          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
            <span style="font-weight: 600; color: #334155; width: 125px;">
              Classifier <i>W</i><sub><i>k</i>,<i>d</i></sub>:
            </span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-family: monospace; color: #64748b;">
                ({{ formatRational(constraintCenter()) }}, &rho;={{ constraintRho().toFixed(2) }})
              </span>
              <app-berkovich-digit-display
                [center]="constraintCenter()"
                [rho]="constraintRho()"
                [prime]="prime()"
                [digitsLeft]="digitsLeft()"
                [digitsRight]="digitsRight()"
                [showRho]="false"
              ></app-berkovich-digit-display>
            </div>
          </div>

          <!-- Context Embedding Disk -->
          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
            <span style="font-weight: 600; color: #334155; width: 125px;">
              Context <i>H</i><sub><i>d</i></sub>:
            </span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-family: monospace; color: #64748b;">
                ({{ formatRational(contextCenter()) }}, &rho;={{ contextRho().toFixed(2) }})
              </span>
              <app-berkovich-digit-display
                [center]="contextCenter()"
                [rho]="contextRho()"
                [prime]="prime()"
                [digitsLeft]="digitsLeft()"
                [digitsRight]="digitsRight()"
                [showRho]="false"
              ></app-berkovich-digit-display>
            </div>
          </div>

          <!-- Arithmetic Formulas & Log Distance -->
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px; display: flex; flex-direction: column; gap: 4px; font-family: sans-serif;">
            <div>
              <strong>1. Log-distance:</strong> 
              <i>d</i><sub>cen</sub> = &minus;&nu;<sub>p</sub>(<i>c</i><sub>H,<i>d</i></sub> &minus; <i>c</i><sub>W,<i>k</i>,<i>d</i></sub>) = 
              <span style="font-family: monospace; font-weight: bold; color: #0f172a;">
                {{ isNegInfinity(dist()) ? '&infin;' : (-dist()).toFixed(2) }}
              </span>
            </div>
            
            <div>
              <strong>2. Path Loss formula:</strong> 
              <i>L</i><sub><i>d</i></sub> = |&rho;<sub>W</sub> &minus; <i>d</i><sub>cen</sub>| + <i>d</i><sub>cen</sub> &minus; &rho;<sub>H</sub>
            </div>

            <div style="padding-left: 8px; border-left: 2px solid #cbd5e1; font-family: monospace; color: #0f172a; margin-top: 2px; font-weight: 600;">
              L<sub>d</sub> = |{{ constraintRho().toFixed(2) }} &minus; {{ isNegInfinity(dist()) ? '&infin;' : (-dist()).toFixed(2) }}| 
              + {{ isNegInfinity(dist()) ? '&infin;' : (-dist()).toFixed(2) }} 
              &minus; {{ contextRho().toFixed(2) }} 
              = {{ loss().toFixed(4) }}
            </div>
          </div>

        </div>
      }
      
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichDimensionCalculationComponent {
  dim = input.required<number>();
  contextCenter = input.required<Rational>();
  contextRho = input.required<number>();
  constraintCenter = input.required<Rational>();
  constraintRho = input.required<number>();
  dist = input.required<number>();
  loss = input.required<number>();
  
  prime = input.required<number>();
  digitsLeft = input.required<number>();
  digitsRight = input.required<number>();

  expanded = false;

  formatRational(r: Rational): string {
    if (r.den === 1n) return String(r.num);
    return `${r.num}/${r.den}`;
  }

  isNegInfinity(val: number): boolean {
    return val === -Infinity;
  }
}
