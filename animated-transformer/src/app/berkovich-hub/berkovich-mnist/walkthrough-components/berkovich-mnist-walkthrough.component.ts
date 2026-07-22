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

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownComponent } from 'ngx-markdown';

import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';
import { SoftmaxWalkthroughTableComponent } from '../../berkovich-space-explorers/walkthrough-components/shared/softmax-walkthrough-table.component';
import { formatRational } from '../../../../lib/berkovich/berkovich';

export interface MnistWalkthroughDetails {
  type: 'berkovich' | 'euclidean' | 'padic-linear';
  digit: number;
  patchMeans: number[];
  aggregated: { dim: number; center?: any; rho?: number; val?: number }[];
  scores: {
    digit: number;
    finalScore: number;
    dimDetails?: any[];
  }[];
  predictions: { char: string; prob: number; score: number; expScore: number }[];
  sumExp: number;
}

@Component({
  selector: 'app-berkovich-mnist-walkthrough',
  imports: [
    CommonModule,
    MatIconModule,
    MarkdownComponent,
    SoftmaxWalkthroughTableComponent,
    BerkovichDigitDisplayComponent
  ],
  templateUrl: './berkovich-mnist-walkthrough.component.html',
  styleUrl: './berkovich-mnist-walkthrough.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichMnistWalkthroughComponent {
  readonly descriptionMarkdown =
    'This model classifies handwritten $28 \\times 28$ MNIST images in Berkovich spaces by projecting spatial patch features into non-Archimedean affinoid domains.';

  readonly explanationMarkdown = `- **Affinoid Domains (Poly-disks)**: Each digit class $k \\in \\{0, \\dots, 9\\}$ is defined by the intersection of $M$ constraints ($W_{k,m}$). The logit score is the worst-case path loss across constraints $D_k = -\\max_m M_{k,m}$.
- **Tree Patch Aggregation**: Spatial patches are aggregated into a hidden Berkovich disk $H$ using $p^{-j}$ positional tree scaling: $c_H = \\sum_j c_j p^{-j}$, $\\rho_H = \\max_j (\\rho_j - j)$.
- **Radius Margin Regularization**: A convex penalty $\\lambda \\sum_{k,m,d} p^{\\rho_{W,k,m,d}}$ contracts target disk radii, guaranteeing strictly positive logit margins and eliminating exact valuation ties.`;

  readonly step1Markdown = 'The $28 \\times 28$ image is divided into spatial grid patches. The mean intensity of each patch is mapped to a $p$-adic embedding disk $E_j \\in \\Gamma_p^d$.';
  readonly step2Markdown = 'Patch embeddings are aggregated into a single root hidden disk $H = (c_H, \\rho_H)$ using $p^{-j}$ positional shift in the tree: $c_H = \\sum_{j=1}^{N_p} c_j p^{-j}$, $\\rho_H = \\max_j (\\rho_j - j)$.';
  readonly step3Markdown = 'The aggregated disk $H$ is evaluated against the learned Affinoid target constraints $W_{k,m}$ for each digit class $k \\in \\{0..9\\}$. The worst-case path loss across constraints dictates the logit score $D_k = -\\max_m M_{k,m}$.';
  readonly step4Markdown = 'Applies temperature-scaled Softmax to compute predicted class probabilities:';

  readonly softmaxGuide = `- **Logit Score ($D_k$)**: The negated worst-case affinoid path loss for digit $k$.
- **$e^{\\beta \\cdot D_k}$**: Temperature-scaled exponential score.
- **Probability (Ratio)**: Class probability $\\pi_k = \\frac{e^{\\beta \\cdot D_k}}{\\sum_j e^{\\beta \\cdot D_j}}$.`;

  details = input.required<MnistWalkthroughDetails | null>();
  selectedDigit = input.required<number>();
  beta = input.required<number>();
  prime = input.required<number>();
  numConstraints = input.required<number>();
  aggMode = input.required<'min' | 'average'>();

  digitsLeft = input.required<number>();
  digitsRight = input.required<number>();

  formatRationalVal(r: any): string {
    if (!r) return '0';
    return formatRational(r);
  }
}
