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

import {
  Component,
  signal,
  computed,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownComponent } from 'ngx-markdown';

import { BerkovichHeaderComponent } from '../berkovich-header/berkovich-header.component';
import { BerkovichDigitDisplayComponent } from '../berkovich-digit-display/berkovich-digit-display.component';
import { BerkovichEncodingTreeVisComponent } from './berkovich-encoding-tree-vis.component';
import { Rational, formatRational } from '../../../lib/berkovich/berkovich';
import {
  BkBinarySearchStep as BinarySearchStep,
  computeBkBinarySearchSteps,
  decodeBkExactReal,
  decodeBkBiasedReal
} from '../../../lib/berkovich/bk-bounded-real-encoding';

export type { BinarySearchStep };

@Component({
  selector: 'app-berkovich-encoding',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MarkdownComponent,
    BerkovichHeaderComponent,
    BerkovichEncodingTreeVisComponent
  ],
  templateUrl: './berkovich-encoding.component.html',
  styleUrls: ['./berkovich-encoding.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichEncodingComponent {
  readonly Math = Math;

  // Unified Real Target Value x in [0, 1]
  readonly realTarget = signal<number>(0.6875);

  // Decoded Real Value in Reverse Decoding (Qp -> R)
  readonly reverseReal = signal<number>(0.6875);

  // Log-Radius rho in [0, 2K] (editable directly inside digit-display)
  readonly padicRho = signal<number>(0);

  readonly prime = signal<number>(2);

  // Precision Depth (K = 2 bits by default: options 1, 2, 3, 4)
  readonly depth = signal<number>(2);

  readonly activeStepIndex = signal<number>(2);

  readonly presets = [
    { label: '0.50 (1/2)', value: 0.5 },
    { label: '0.75 (3/4)', value: 0.75 },
    { label: '0.625 (5/8)', value: 0.625 },
    { label: '0.6875 (11/16)', value: 0.6875 },
    { label: '0.3333 (1/3)', value: 1 / 3 },
    { label: '0.850', value: 0.85 }
  ];

  // Binary search steps reactive to realTarget and depth
  readonly steps = computed<BinarySearchStep[]>(() => {
    return computeBkBinarySearchSteps(this.realTarget(), this.depth(), this.prime());
  });

  readonly finalStep = computed<BinarySearchStep | null>(() => {
    const list = this.steps();
    return list.length > 0 ? list[list.length - 1] : null;
  });

  // Current Rational Center at selected precision depth K
  readonly currentRationalCenter = computed<Rational>(() => {
    const final = this.finalStep();
    return final ? final.rationalCenter : { num: 11n, den: 16n };
  });

  readonly binaryString = computed<string>(() => {
    return this.steps().map((s) => s.bit).join('');
  });

  // Berkovich Disk Radius: r = p^rho
  readonly diskRadius = computed<number>(() => {
    return Math.pow(this.prime(), this.padicRho());
  });

  // Decoded Exact Real Value from Rational Center
  readonly decodedExactReal = computed<number>(() => {
    return decodeBkExactReal(this.steps());
  });

  // Controls whether rho normalization / regularization is enabled in Reverse Decoding
  readonly useRhoNormalization = signal<boolean>(true);

  // Biased / Regularized Real Value
  readonly decodedBiasedReal = computed<number>(() => {
    return decodeBkBiasedReal(this.steps(), this.padicRho(), this.useRhoNormalization());
  });

  readonly forwardExplanationMarkdown =
    '### Forward Encoding: Real to p-adic\nGiven x in [0, 1], binary search halving determines bits b_k in {0, 1}. The resulting Berkovich disk (c_K, rho_K) is the tightest fitting cover around real value x.';

  readonly reverseExplanationMarkdown = `Given p-adic digits, we decode the continuous real target value $x \\in [0, 1]$.

When **use rho normalization** is enabled, the Berkovich radius parameter $\\rho \\in [0, 2K]$ acts as a continuous **regularization towards the level of certainty**:

- **Maximum radius** (\\rho = 2K, m = 0): The target value is regularized to exact center x = 0.5.
- **Intermediate radius** (\\rho = 2K - 1, m = 1): The target value regularizes to 0.25 or 0.75 depending on digit b_1.
- **Minimum radius** (\\rho = 0, m = 2K): The value narrows tightly to the exact leaf midpoint x_exact.`;

  setUseRhoNormalization(val: boolean) {
    this.useRhoNormalization.set(val);
  }

  setRealTarget(val: number) {
    const clamped = Math.max(0, Math.min(1, val));
    this.realTarget.set(clamped);
    this.reverseReal.set(clamped);
  }

  setReverseReal(val: number) {
    const clamped = Math.max(0, Math.min(1, val));
    this.reverseReal.set(clamped);
    this.realTarget.set(clamped);
  }

  onDepthChange(newDepth: number) {
    this.depth.set(newDepth);
    const maxRho = newDepth * 2;
    if (this.padicRho() > maxRho) {
      this.padicRho.set(maxRho);
    }
  }

  // Reactive updates when user edits digits directly in BerkovichDigitDisplayComponent
  onDigitDisplayCenterChange(newRational: Rational) {
    const den = Number(newRational.den);
    if (den > 0) {
      const newX = Math.max(0, Math.min(1, Number(newRational.num) / den));
      this.reverseReal.set(newX);
      this.realTarget.set(newX);
    }
  }

  onDigitDisplayRhoChange(newRho: number) {
    this.padicRho.set(newRho);
  }

  formatRationalVal(r: Rational): string {
    return formatRational(r);
  }
}
