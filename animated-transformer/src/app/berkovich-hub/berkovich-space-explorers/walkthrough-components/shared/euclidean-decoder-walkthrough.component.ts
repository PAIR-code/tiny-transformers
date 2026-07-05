/* Copyright 2026 Google LLC. All Rights Reserved.
==============================================================================*/

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalkthroughScore } from './walkthrough-types';

@Component({
  selector: 'app-euclidean-decoder-walkthrough',
  imports: [CommonModule],
  templateUrl: './euclidean-decoder-walkthrough.component.html',
  styleUrl: './euclidean-decoder-walkthrough.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EuclideanDecoderWalkthroughComponent {
  scores = input.required<WalkthroughScore[]>();

  formatDisplayString(str: string): string {
    if (str === ' ') return '␣';
    if (str === '\n') return '↵';
    return str;
  }

  wrapInQuotes(str: string): string {
    return `'${str}'`;
  }
}
