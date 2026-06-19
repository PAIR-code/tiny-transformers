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

import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownComponent } from 'ngx-markdown';
import { Rational, simplify } from '../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-berkovich-disk-state',
  templateUrl: './berkovich-disk-state.component.html',
  styleUrls: ['./berkovich-disk-state.component.scss'],
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MarkdownComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichDiskStateComponent {
  // Inputs
  readonly prime = input.required<number>();
  readonly currentCenter = input.required<Rational>();
  readonly currentLogRadius = input.required<number>();
  readonly currentDistanceValuation = input.required<number>();
  readonly currentLoss = input.required<number>();
  readonly stepCount = input.required<number>();

  // Derived state
  readonly currentPointType = computed(() => {
    const rho = this.currentLogRadius();
    if (rho <= -4.0) return 'Type I (Leaf)';
    if (Math.abs(rho - Math.round(rho)) < 1e-7) return 'Type II (Vertex)';
    return 'Type III (Edge)';
  });

  readonly radius = computed(() => {
    return this.prime() ** this.currentLogRadius();
  });

  formatRationalLatex(r: Rational): string {
    const simplified = simplify(r);
    if (simplified.den === 1n) {
      return simplified.num.toString();
    }
    return `\\frac{${simplified.num}}{${simplified.den}}`;
  }
}
