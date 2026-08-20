/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* Copyright 2026 Google LLC. All Rights Reserved.
==============================================================================*/

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalkthroughScore } from './walkthrough-types';
import { BerkovichDimensionCalculationComponent } from './berkovich-dimension-calculation.component';

@Component({
  selector: 'app-berkovich-decoder-walkthrough',
  imports: [CommonModule, BerkovichDimensionCalculationComponent],
  templateUrl: './berkovich-decoder-walkthrough.component.html',
  styleUrl: './berkovich-decoder-walkthrough.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichDecoderWalkthroughComponent {
  scores = input.required<WalkthroughScore[]>();
  aggMode = input<'min' | 'average'>('min');

  prime = input<number>(3);
  digitsLeft = input<number>(2);
  digitsRight = input<number>(2);

  formatDisplayString(str: string): string {
    if (str === ' ') return '␣';
    if (str === '\n') return '↵';
    return str;
  }

  wrapInQuotes(str: string): string {
    return `'${str}'`;
  }
}
