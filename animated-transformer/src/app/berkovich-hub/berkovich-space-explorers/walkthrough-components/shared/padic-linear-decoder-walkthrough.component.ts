/* Copyright 2026 Google LLC. All Rights Reserved.
==============================================================================*/

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalkthroughScore } from './walkthrough-types';
import { BerkovichDimensionCalculationComponent } from './berkovich-dimension-calculation.component';

@Component({
  selector: 'app-padic-linear-decoder-walkthrough',
  imports: [CommonModule, BerkovichDimensionCalculationComponent],
  templateUrl: './padic-linear-decoder-walkthrough.component.html',
  styleUrl: './padic-linear-decoder-walkthrough.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PadicLinearDecoderWalkthroughComponent {
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
