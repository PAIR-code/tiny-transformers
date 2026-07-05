/* Copyright 2026 Google LLC. All Rights Reserved.
==============================================================================*/

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalkthroughEmbedGroup } from './walkthrough-types';

@Component({
  selector: 'app-euclidean-lookup-walkthrough',
  imports: [CommonModule],
  templateUrl: './euclidean-lookup-walkthrough.component.html',
  styleUrl: './euclidean-lookup-walkthrough.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EuclideanLookupWalkthroughComponent {
  embeddings = input.required<WalkthroughEmbedGroup[]>();
  contextText = input<string>('');

  formatDisplayString(str: string): string {
    if (str === ' ') return '␣';
    if (str === '\n') return '↵';
    return str;
  }

  wrapInQuotes(str: string): string {
    return `'${str}'`;
  }
}
