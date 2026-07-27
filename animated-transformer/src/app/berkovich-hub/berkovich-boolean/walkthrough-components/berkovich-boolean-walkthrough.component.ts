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
  input,
  signal,
  computed,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownComponent } from 'ngx-markdown';
import {
  BerkovichBooleanLearner,
  BerkovichBooleanConfig,
  BooleanSample
} from '../models/berkovich-boolean-learner';
import {
  Rational,
  formatRational,
  formatDigitSequence
} from '../../../../lib/berkovich/berkovich';
import { BerkovichDisk } from '../../berkovich-mnist/models/berkovich-mnist-learner';
import { BerkovichDimensionCalculationComponent } from '../../berkovich-space-explorers/walkthrough-components/shared/berkovich-dimension-calculation.component';

@Component({
  selector: 'app-berkovich-boolean-walkthrough',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MarkdownComponent,
    BerkovichDimensionCalculationComponent
  ],
  templateUrl: './berkovich-boolean-walkthrough.component.html',
  styleUrls: ['./berkovich-boolean-walkthrough.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closePopup()' }
})
export class BerkovichBooleanWalkthroughComponent {
  readonly Math = Math;

  learner = input.required<BerkovichBooleanLearner | null>();
  dataset = input.required<BooleanSample[]>();
  numPools = input.required<number>();
  numVars = input.required<number>();
  prime = input.required<number>();
  config = input.required<BerkovichBooleanConfig>();

  digitsLeft = input<number>(2);
  digitsRight = input<number>(2);

  readonly selectedSampleIndex = signal<number>(0);
  readonly activePopup = signal<string | null>(null);

  // Inspector visibility toggles
  readonly showPW = signal<boolean>(false);
  readonly showW0 = signal<boolean>(false);
  readonly showW1 = signal<boolean>(false);

  readonly descriptionMarkdown =
    'This walkthrough traces the live forward inference step-by-step for a selected Boolean input vector. It shows **2-adic input encoding**, **Berkovich pool matrix multiplication ($H = X \\oplus PW$)**, **DNF affinoid path losses**, and **softmax class probabilities**.';

  readonly explanationMarkdown = `- **Inputs ($X$)**: Each binary input bit $x_d \\in \\{0, 1\\}$ is mapped to a 2-adic Berkovich leaf disk $X_d \\in \\mathcal{B}$.
- **Matrix Operations ($H = X \\oplus PW$)**: Input vector $X \\in \\mathcal{B}^{1 \\times D}$ is translated by learned pool weight matrix $PW \\in \\mathcal{B}^{M \\times D}$ using disk addition in $\\mathbb{Q}_p$: center $c_H = c_X + c_{PW}$, log-radius $\\rho_H = \\max(\\rho_X, \\rho_{PW})$.
- **DNF Affinoid Logic**: Logical AND across dimensions selects maximum path loss; logical OR across pools selects minimum path loss ($m^* = \\text{argmin}_m \\max_d \\text{Loss}$).`;

  readonly currentSample = computed<BooleanSample | null>(() => {
    const data = this.dataset();
    const idx = this.selectedSampleIndex();
    if (!data || data.length === 0) return null;
    return data[Math.min(idx, data.length - 1)];
  });

  readonly forwardResult = computed(() => {
    const l = this.learner();
    const sample = this.currentSample();
    const cfg = this.config();
    if (!l || !sample) return null;

    const inputDisks = l.encodeInputs(sample.inputs);
    const fwd = l.forward(sample.inputs, cfg);

    return {
      sample,
      inputDisks,
      pools: fwd.pools,
      pathLosses: fwd.pathLosses,
      activeConstraints: fwd.activeConstraints,
      logits: fwd.logits,
      probs: fwd.probs
    };
  });

  closePopup() {
    this.activePopup.set(null);
  }

  togglePopup(id: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.activePopup() === id) {
      this.activePopup.set(null);
    } else {
      this.activePopup.set(id);
    }
  }

  selectSample(idx: number) {
    this.selectedSampleIndex.set(idx);
  }

  formatRationalVal(r?: Rational): string {
    if (!r) return '0';
    return formatRational(r);
  }

  formatDigitSeqVal(r?: Rational): string {
    if (!r) return '';
    return formatDigitSequence(r, BigInt(this.prime()));
  }

  getMaxLoss(losses: number[]): number {
    if (!losses || losses.length === 0) return 0;
    return Math.max(...losses);
  }

  getPoolIndices(): number[] {
    return Array.from({ length: this.numPools() }, (_, i) => i);
  }

  getVarIndices(): number[] {
    return Array.from({ length: this.numVars() }, (_, i) => i);
  }

  getPWDisk(m: number, d: number): BerkovichDisk | null {
    const l = this.learner();
    if (!l || !l.poolWeights || !l.poolWeights[m]) return null;
    return l.poolWeights[m][d] || null;
  }

  getWDisk(classK: number, m: number, d: number): BerkovichDisk | null {
    const l = this.learner();
    if (!l || !l.W || !l.W[classK] || !l.W[classK][m]) return null;
    return l.W[classK][m][d] || null;
  }
}
