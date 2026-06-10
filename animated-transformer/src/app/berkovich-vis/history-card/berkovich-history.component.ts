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

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownModule } from 'ngx-markdown';
import { Rational, simplify } from '../../../lib/berkovich/berkovich';

export interface HistoryItem {
  step: number;
  center: Rational;
  logRadius: number;
  loss: number;
  type: string;
}

@Component({
  selector: 'app-berkovich-history',
  templateUrl: './berkovich-history.component.html',
  styleUrls: ['./berkovich-history.component.scss'],
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MarkdownModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichHistoryComponent {
  readonly history = input.required<HistoryItem[]>();

  formatRationalLatex(r: Rational): string {
    const simplified = simplify(r);
    if (simplified.den === 1n) {
      return simplified.num.toString();
    }
    return `\\frac{${simplified.num}}{${simplified.den}}`;
  }
}
