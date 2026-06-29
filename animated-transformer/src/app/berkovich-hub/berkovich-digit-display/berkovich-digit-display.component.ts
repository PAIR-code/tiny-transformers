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

import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Rational, getAlignedDigits } from '../../../lib/berkovich/berkovich';

export interface DigitDisplayCell {
  power: number;
  digit: number;
  uncertaintyRatio: number; // Value between 0.0 and 1.0
}

@Component({
  selector: 'app-berkovich-digit-display',
  template: `
    <div class="digit-display-wrapper">
      <div class="digits-strip">
        @for (cell of cells(); track cell.power) {
          @if (cell.power === -1) {
            <span class="decimal-dot">.</span>
          }
          <span 
            class="digit-box"
            [class.uncertain]="cell.uncertaintyRatio === 1"
            [class.partially-uncertain]="cell.uncertaintyRatio > 0 && cell.uncertaintyRatio < 1"
            [style.background]="getBackgroundStyle(cell.uncertaintyRatio)"
            [style.border-color]="getBorderStyle(cell.uncertaintyRatio)"
          >
            {{ cell.digit }}
          </span>
        }
      </div>
      @if (showRho()) {
        <div class="rho-label" [class.uncertain-outline]="hasUncertainty()">
          ρ={{ rho().toFixed(2) }}
        </div>
      }
    </div>
  `,
  styleUrls: ['./berkovich-digit-display.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule]
})
export class BerkovichDigitDisplayComponent {
  readonly center = input.required<Rational>();
  readonly rho = input.required<number>();
  readonly prime = input.required<number>();
  readonly showRho = input<boolean>(true);

  readonly cells = computed<DigitDisplayCell[]>(() => {
    const r = this.center();
    const p = BigInt(this.prime());
    const valRho = this.rho();

    const aligned = getAlignedDigits(r, p, -2, 1);
    // Reverse: highest power (1) left, lowest power (-2) right
    const reversed = [...aligned].reverse();
    
    const val = -valRho;
    
    return reversed.map(item => {
      let uncertaintyRatio = 0.0;
      
      if (item.power >= val) {
        uncertaintyRatio = 1.0;
      } else if (item.power + 1 <= val) {
        uncertaintyRatio = 0.0;
      } else {
        uncertaintyRatio = item.power + 1 - val;
      }

      return {
        power: item.power,
        digit: item.digit,
        uncertaintyRatio
      };
    });
  });

  readonly hasUncertainty = computed(() => {
    return this.cells().some(c => c.uncertaintyRatio > 0);
  });

  getBackgroundStyle(u: number): string {
    if (u === 1) return 'rgba(168, 85, 247, 0.12)';
    if (u === 0) return 'transparent';
    return `linear-gradient(to right, rgba(168, 85, 247, 0.12) ${u * 100}%, transparent ${u * 100}%)`;
  }

  getBorderStyle(u: number): string {
    if (u === 1) return '#c084fc';
    if (u > 0.5) return '#c084fc';
    return '#cbd5e1';
  }
}
