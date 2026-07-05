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
