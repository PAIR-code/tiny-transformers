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
=============================================================================*/

import { Component, input, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownComponent } from 'ngx-markdown';
import { 
  Rational, 
  formatDigitSequence, 
  formatRational, 
  subtract, 
  getValuation 
} from '../../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-berkovich-disk-calculus',
  templateUrl: './berkovich-disk-calculus.component.html',
  styleUrls: ['./berkovich-disk-calculus.component.scss'],
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MarkdownComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichDiskCalculusComponent {
  readonly gradientBreakdown = input.required<any>();
  readonly learningRate = input.required<number>();
  readonly prime = input.required<number>();

  readonly currentCenter = input.required<Rational>();
  readonly targetRational = input.required<Rational>();
  readonly currentLogRadius = input.required<number>();
  readonly targetLogRadius = input.required<number>();

  // Local collapse state
  readonly isCollapsed = signal<boolean>(false);

  toggleCollapse(): void {
    this.isCollapsed.update(c => !c);
  }

  formatDigitSequence(r: Rational): string {
    return formatDigitSequence(r, BigInt(this.prime()));
  }

  readonly workedExample = computed(() => {
    const p = BigInt(this.prime());
    const xc = this.currentCenter();
    const yc = this.targetRational();
    const rho = this.currentLogRadius();
    const y_rho = this.targetLogRadius();
    
    const diff = subtract(xc, yc);
    const val = getValuation(diff, p);
    
    const xcDigits = formatDigitSequence(xc, p);
    const ycDigits = formatDigitSequence(yc, p);
    const diffDigits = formatDigitSequence(diff, p);
    
    const xcStr = formatRational(xc);
    const ycStr = formatRational(yc);
    const diffStr = formatRational(diff);
    
    let valStr = '';
    let dVal = 0;
    if (val.type === 'pos-infinity') {
      valStr = '\\infty';
      dVal = -Infinity;
    } else if (val.type === 'neg-infinity') {
      valStr = '-\\infty';
      dVal = Infinity;
    } else {
      valStr = val.value.toString();
      dVal = -val.value;
    }
    
    const dValStr = dVal === -Infinity ? '-\\infty' : dVal.toFixed(2);
    
    // Formula for Disk SGD:
    const maxVal = Math.max(rho, y_rho, dVal);
    const computedLoss = 2 * maxVal - rho - y_rho;
    
    return `
### Worked Example with Current State:
1. **Centers & Difference:**
   - Parameter Center: $x_c = ${xcStr}$ (digits: $${xcDigits}$)
   - Target Center: $y_c = ${ycStr}$ (digits: $${ycDigits}$)
   - Difference: $x_c - y_c = ${diffStr}$ (digits: $${diffDigits}$)

2. **Branching Height ($d$):**
   - Valuation: $\\nu_{${p}}(x_c - y_c) = ${valStr}$ (the index of the lowest-power non-zero digit)
   - Branching Height: $d = -\\nu_{${p}}(x_c - y_c) = ${dValStr}$

3. **Log-Radius Distance Loss:**
   - Current Log-Radius: $\\rho = ${rho.toFixed(2)}$
   - Target Log-Radius: $\\rho_y = ${y_rho.toFixed(2)}$
   - Formula: $L_{\\text{path}} = 2\\max(\\rho, \\rho_y, d) - \\rho - \\rho_y$
   - Calculation:
     $$\\max(\\rho, \\rho_y, d) = \\max(${rho.toFixed(2)}, ${y_rho.toFixed(2)}, ${dValStr}) = ${maxVal.toFixed(2)}$$
     $$L_{\\text{path}} = 2(${maxVal.toFixed(2)}) - (${rho.toFixed(2)}) - (${y_rho.toFixed(2)}) = ${computedLoss.toFixed(4)}$$
`;
  });
}
