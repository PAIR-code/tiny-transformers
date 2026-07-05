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
import { EuclideanLookupWalkthroughComponent } from './shared/euclidean-lookup-walkthrough.component';
import { EuclideanDecoderWalkthroughComponent } from './shared/euclidean-decoder-walkthrough.component';

@Component({
  selector: 'app-euclidean-walkthrough',
  imports: [
    CommonModule,
    MatIconModule,
    MarkdownComponent,
    WalkthroughContextComponent,
    SoftmaxWalkthroughTableComponent,
    EuclideanLookupWalkthroughComponent,
    EuclideanDecoderWalkthroughComponent
  ],
  templateUrl: './euclidean-walkthrough.component.html',
  styleUrl: './euclidean-walkthrough.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EuclideanWalkthroughComponent {
  readonly descriptionMarkdown = 'This baseline uses standard vector spaces. Characters are mapped to Euclidean vectors $e_c \\in \\mathbb{R}^d$.';

  readonly explanationMarkdown = `- **Values vs. Parameters**: Values are exact Type I leaf points ($c \\in \\mathbb{Q}_p$) with a fixed log-radius of $-2.0$. Parameters (Embeddings & Constraints) are dynamic Berkovich disks ($E_c, W_{k,\\rho}$).
- **Why two Radius Regularizations?**: Same as the Bigram model, regularizing constraint and embedding radii ensures tight class boundaries and clean tree coordinates.`;

  readonly softmaxGuide = `- **Logit Score (S)**: The standard linear score $S_k = b_k + H \\cdot W_k$ from Step 3.
- **$e^{\\beta \\cdot S}$ (Numerator)**: Exponentiates the score scaled by temperature $\\beta$.
- **Denominator Sum**: Sum of $e^{\\beta \\cdot S}$ across all vocabulary characters.
- **Probability (Ratio)**: Final probability $\\frac{\\text{Numerator}}{\\text{Denominator Sum}}.$`;

  details = input.required<WalkthroughDetails | null>();
  walkthroughInput = input.required<string>();
  walkthroughInputError = input.required<string | null>();
  beta = input.required<number>();
  vocab = input.required<string[]>();
  contextLength = input.required<number>();

  stepData = input.required<{
    step1: string;
    step2: string;
    step3: string;
    step4: string;
  }>();

  walkthroughInputChange = output<string>();
}
