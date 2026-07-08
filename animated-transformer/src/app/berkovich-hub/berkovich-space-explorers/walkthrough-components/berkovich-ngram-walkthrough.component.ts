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

import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownComponent } from 'ngx-markdown';
import { WalkthroughDetails } from './shared/walkthrough-types';
import { WalkthroughContextComponent } from './shared/walkthrough-context.component';
import { SoftmaxWalkthroughTableComponent } from './shared/softmax-walkthrough-table.component';
import { BerkovichLookupWalkthroughComponent } from './shared/berkovich-lookup-walkthrough.component';
import { BerkovichDecoderWalkthroughComponent } from './shared/berkovich-decoder-walkthrough.component';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';
import { BerkovichModelInspectorComponent } from '../inspector-components/berkovich-model-inspector.component';
import { BerkovichDualDigitDisplayComponent } from '../../berkovich-dual-digit-display/berkovich-dual-digit-display.component';
import { BerkovichCharLearnerBase } from '../models/berkovich-char-learner';
import { Rational, formatRational } from '../../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-berkovich-ngram-walkthrough',
  imports: [
    CommonModule,
    MatIconModule,
    MarkdownComponent,
    WalkthroughContextComponent,
    SoftmaxWalkthroughTableComponent,
    BerkovichLookupWalkthroughComponent,
    BerkovichDecoderWalkthroughComponent,
    BerkovichDigitDisplayComponent,
    BerkovichModelInspectorComponent,
    BerkovichDualDigitDisplayComponent
  ],
  templateUrl: './berkovich-ngram-walkthrough.component.html',
  styleUrl: './berkovich-ngram-walkthrough.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichNgramWalkthroughComponent {
  readonly descriptionMarkdown = 'This model aggregates a context of up to $N$ preceding characters to predict the next character using Berkovich spaces.';

  readonly explanationMarkdown = `- **Values vs. Parameters**: Values are exact Type I leaf points ($c \\in \\mathbb{Q}_p$) with a fixed log-radius of $-2.0$. Parameters (Embeddings & Constraints) are dynamic Berkovich disks ($E_c, W_{k,\\rho}$).
- **Why Radius Regularization?**: Training with cross-entropy alone encourages classification disks to expand ($W_{k,\\rho} \\to \\infty$), leading to complete overlap and ties. A regularizer ($\\lambda \\sum p^{\\rho_{W,k,d}}$) shrinks disks, forcing them to remain tight and disjoint around their classes.`;

  readonly softmaxGuide = `- **Logit Score (D)**: The negated projection path loss from Step 3.
- **$e^{\\beta \\cdot D}$ (Numerator)**: Exponentiates the score scaled by temperature $\\beta$.
- **Denominator Sum**: Sum of $e^{\\beta \\cdot D}$ across all vocabulary characters.
- **Probability (Ratio)**: Final probability $\\frac{\\text{Numerator}}{\\text{Denominator Sum}}.$`;

  details = input.required<WalkthroughDetails | null>();
  walkthroughInput = input.required<string>();
  walkthroughInputError = input.required<string | null>();
  beta = input.required<number>();
  prime = input.required<number>();
  vocab = input.required<string[]>();
  contextLength = input.required<number>();
  aggMode = input.required<'min' | 'average'>();
  
  digitsLeft = input.required<number>();
  digitsRight = input.required<number>();

  stepData = input.required<{
    step1: string;
    step2: string;
    step3: string;
    step4: string;
  }>();

  // New inputs/outputs for parameters and gradients
  model = input.required<BerkovichCharLearnerBase | null>();
  dimensions = input.required<number[]>();
  showE = input<boolean>(false);
  showW = input<boolean>(false);
  showH = input<boolean>(false);
  showSoftmax = input<boolean>(false);

  showEChange = output<boolean>();
  showWChange = output<boolean>();
  showHChange = output<boolean>();
  showSoftmaxChange = output<boolean>();

  gradients = input<any[] | null>(null);
  targetChar = input<string>('');
  targetCharChange = output<string>();

  walkthroughInputChange = output<string>();

  formatRationalVal(r: any): string {
    if (!r) return '0';
    return formatRational(r);
  }

  onTargetCharChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.targetCharChange.emit(val);
  }
}
