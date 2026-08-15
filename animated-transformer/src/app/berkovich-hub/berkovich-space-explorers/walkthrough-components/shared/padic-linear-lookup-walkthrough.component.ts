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
import { WalkthroughEmbedGroup } from './walkthrough-types';
import { Rational, formatRational, formatDigitSequence } from '../../../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-padic-linear-lookup-walkthrough',
  imports: [CommonModule],
  templateUrl: './padic-linear-lookup-walkthrough.component.html',
  styleUrl: './padic-linear-lookup-walkthrough.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PadicLinearLookupWalkthroughComponent {
  embeddings = input.required<WalkthroughEmbedGroup[]>();
  contextText = input<string>('');

  prime = input<number>(3);
  digitsLeft = input<number>(2);
  digitsRight = input<number>(2);

  formatRationalVal(r?: Rational): string {
    if (!r) return '';
    return formatRational(r);
  }

  formatDigitSeqVal(r?: Rational): string {
    if (!r) return '';
    return formatDigitSequence(r, BigInt(this.prime()));
  }

  formatDisplayString(str: string): string {
    if (str === ' ') return '␣';
    if (str === '\n') return '↵';
    return str;
  }

  wrapInQuotes(str: string): string {
    return `'${str}'`;
  }
}
