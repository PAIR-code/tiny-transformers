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
import { PadicLinearLookupWalkthroughComponent } from './shared/padic-linear-lookup-walkthrough.component';
import { PadicLinearDecoderWalkthroughComponent } from './shared/padic-linear-decoder-walkthrough.component';

@Component({
  selector: 'app-padic-linear-walkthrough',
  imports: [
    CommonModule, 
    MatIconModule, 
    MarkdownComponent, 
    WalkthroughContextComponent, 
    SoftmaxWalkthroughTableComponent,
    PadicLinearLookupWalkthroughComponent,
    PadicLinearDecoderWalkthroughComponent
  ],
  templateUrl: './padic-linear-walkthrough.component.html',
  styleUrl: './padic-linear-walkthrough.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PadicLinearWalkthroughComponent {
  readonly descriptionMarkdown = 'Maps each character $c$ to a fixed set of p-adic constants $X_c$. A linear transformation $Y = X_c \\cdot M + B$ is applied in $\\mathbb{Q}_p$, and probabilities are derived from distances to the target constants.';

  readonly explanationMarkdown = `- **Values vs. Parameters**: Values are exact Type I leaf points ($c \\in \\mathbb{Q}_p$) mapped from class indices. Parameters ($M$ and $B$) are dynamic Berkovich disks.
- **Linear Transformation**: The input vector is mapped using matrix multiplication $Y = X \\cdot M + B$. Addition of disks performs a max of radii, or min of $\\rho$. A regularizer ($\\lambda \\sum p^{\\rho_{W,k,d}}$) shrinks disks, forcing them to remain tight and disjoint around their classes.`;

  readonly softmaxGuide = `- **Logit Score (D)**: The negated projection path loss from Step 2.
- **$e^{\\beta \\cdot D}$ (Numerator)**: Exponentiates the score scaled by temperature $\\beta$.
- **Denominator Sum**: Sum of $e^{\\beta \\cdot D}$ across all vocabulary characters.
- **Probability (Ratio)**: Final probability $\\frac{\\text{Numerator}}{\\text{Denominator Sum}}.$`;

  details = input.required<WalkthroughDetails | null>();
  walkthroughInput = input.required<string>();
  walkthroughInputError = input.required<string | null>();
  beta = input.required<number>();
  prime = input.required<number>();
  vocab = input.required<string[]>();
  aggMode = input.required<'min' | 'average'>();
  
  digitsLeft = input<number>(2);
  digitsRight = input<number>(2);
  
  stepData = input.required<{
    step1: string;
    step2: string;
  }>();

  walkthroughInputChange = output<string>();
}
