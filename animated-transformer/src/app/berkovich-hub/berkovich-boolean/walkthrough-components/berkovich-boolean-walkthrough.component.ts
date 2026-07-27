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
  output,
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
  tick = input<number>(0);

  digitsLeft = input<number>(2);
  digitsRight = input<number>(2);

  // Parameter Change Outputs
  readonly targetInitModeChange = output<'pre-fixed-leaves' | 'random'>();
  readonly poolInitModeChange = output<'separated-branches' | 'random'>();
  readonly targetCenterModeChange = output<'fixed' | 'gradient' | 'repulsion' | 'combined'>();
  readonly numPoolsChange = output<number>();
  readonly learningRateChange = output<number>();
  readonly regularizationChange = output<number>();
  readonly repulsionRegChange = output<number>();
  readonly betaChange = output<number>();

  readonly selectedSampleIndex = signal<number>(0);
  readonly activePopup = signal<string | null>(null);

  // Inspector visibility toggles
  readonly showPW = signal<boolean>(false);
  readonly showW0 = signal<boolean>(false);
  readonly showW1 = signal<boolean>(false);

  readonly descriptionMarkdown =
    'This walkthrough traces the live forward inference step-by-step for a selected Boolean input vector. It shows **2-adic input encoding**, **Berkovich pool matrix multiplication ($H = X \\oplus PW$)**, **DNF affinoid path losses**, and **softmax class probabilities**.';

  readonly targetModeExplainerMarkdown = computed(() => {
    const cfg = this.config();
    const mode = cfg.targetCenterMode || (cfg.updateTargetCenters ? 'combined' : 'fixed');
    const initMode = cfg.targetInitMode;
    const poolMode = cfg.poolInitMode;

    let targetExpl = '';
    if (mode === 'fixed') {
      targetExpl = '**Fixed Target Centers**: Target constraint centers $W_{0,m}$ and $W_{1,m}$ stay fixed at canonical leaves ($c_0=0, c_1=1/p$). Gradient descent updates pool weight shifts $PW_{m,d}$ so $X_d \\oplus PW_{m,d} \\to W_{1,m,d}$.';
    } else if (mode === 'gradient' || mode === 'dynamic') {
      targetExpl = '**Dynamic Gradient Updates**: Target constraint centers $W_{0,m}$ and $W_{1,m}$ update dynamically toward active pooled disks $H_{m,d}$ during training.';
    } else if (mode === 'repulsion') {
      targetExpl = '**Softmax Repulsion Only**: Target constraint centers $W_{0,m}$ and $W_{1,m}$ move purely via softmax-normalized repulsion forces pushing pool/class target centers apart across distinct branches of the 2-adic tree.';
    } else {
      targetExpl = '**Combined (Gradient + Repulsion)**: Target centers update via gradient descent toward pooled centers $H_{m,d}$ AND apply a weighted softmax repulsion force ($\\lambda_{\\text{repulsion}} = ' + cfg.repulsionReg + ') pushing target centers apart simultaneously.';
    }

    let initExpl = '';
    if (initMode === 'random') {
      initExpl = 'Target centers $W$ are **randomly initialized** across 2-adic tree depth 4.';
    } else {
      initExpl = 'Target centers $W$ are initialized at **canonical $p$-adic leaves** ($c_0=0, c_1=1/p$).';
    }

    let poolExpl = '';
    if (poolMode === 'random') {
      poolExpl = 'Pool weights $PW$ are initialized to **random 2-adic centers** across depth 4.';
    } else {
      poolExpl = 'Pool weights $PW$ are initialized across **hypercube minterm branches** ($1/4$ vs $3/4$).';
    }

    return `💡 **Active Architecture & Dynamics:** ${targetExpl} ${initExpl} ${poolExpl}`;
  });

  readonly initStrategyMarkdown = computed(() => {
    const cfg = this.config();
    const targetMode = cfg.targetInitMode;
    const poolMode = cfg.poolInitMode;

    const poolDesc = poolMode === 'separated-branches'
      ? '**Programmatic Minterm Corners**: Initialized at $PW_{m,d} = \\text{bit}_d \\,?\\, 3/4 : 1/4$. Guarantees $100\\%$ initial coverage of all $2^D$ hypercube minterms for universal circuit learning.'
      : '**Random Tree Centers**: Initialized to random depth-4 2-adic rational centers $\\frac{n}{16}$ ($n \\in \\{0..15\\}$). Evaluates standard unguided neural initialization.';

    const targetDesc = targetMode === 'pre-fixed-leaves'
      ? '**Programmatic Canonical Leaves**: Class 0 at $c_0 = 0$, Class 1 at $c_1 = 1/p$. Rooted in $p$-adic spectral leaf topology where distinct leaves represent distinct boolean values.'
      : '**Random Learned Disks**: Target centers $W$ are sampled randomly across depth-4 tree fractions $\\frac{n}{16}$. Evaluates soft boundary adaptation.';

    return `### Initialization Strategy: Programmatic vs. Random
- **Pool Translation Weights ($PW$)**: ${poolDesc}
- **Target Constraint Disks ($W$)**: ${targetDesc}`;
  });

  readonly lossBreakdownMarkdown = computed(() => {
    const cfg = this.config();
    return `### Loss Function & Parameter Breakdown
$$\\mathcal{L}_{\\text{total}} = \\mathcal{L}_{\\text{CE}} + \\lambda_{\\text{reg}} \\mathcal{L}_{\\text{radius}} + \\lambda_{\\text{repulsion}} \\mathcal{L}_{\\text{repulsion}}$$

- **Cross-Entropy Loss ($\\mathcal{L}_{\\text{CE}}$)**: $-\\log P(y_i \\mid \\mathbf{x}_i)$ where $P(y=k) = \\frac{e^{\\beta S_k}}{\\sum e^{\\beta S_{k'}}}$ and score $S_k = -\\min_m \\max_d \\text{Loss}(H_{m,d}, W_{k,m,d})$. Optimizes input pool alignment.
- **Radius Regularization ($\\mathcal{L}_{\\text{radius}}$)**: $\\sum_{k,m,d} e^{\\rho_{W,k,m,d} \\ln p}$. Shrinks disk log-radii ($\\rho \\to -\\infty$) with weight $\\lambda_{\\text{reg}} = ${cfg.reg} to sharpen DNF decision boundaries into crisp Boolean regions.
- **Softmax Repulsion Penalty ($\\mathcal{L}_{\\text{repulsion}}$)**: $\\sum_{m \\neq m'} e^{-v_p(c_{W,m} - c_{W,m'})}$. Applies a repulsion penalty with weight $\\lambda_{\\text{repulsion}} = ${cfg.repulsionReg} pushing pool/class target centers to distinct branches of the 2-adic tree.`;
  });

  onTargetInitChange(val: string) {
    this.targetInitModeChange.emit(val as 'pre-fixed-leaves' | 'random');
  }

  onPoolInitChange(val: string) {
    this.poolInitModeChange.emit(val as 'separated-branches' | 'random');
  }

  onTargetCenterModeChange(val: string) {
    this.targetCenterModeChange.emit(val as 'fixed' | 'gradient' | 'repulsion' | 'combined');
  }

  onNumPoolsChange(val: string) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 8) {
      this.numPoolsChange.emit(parsed);
    }
  }

  onLrChange(val: string) {
    const parsed = parseFloat(val.replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) {
      this.learningRateChange.emit(parsed);
    }
  }

  onRegChange(val: string) {
    const parsed = parseFloat(val.replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 0) {
      this.regularizationChange.emit(parsed);
    }
  }

  onRepulsionRegChange(val: string) {
    const parsed = parseFloat(val.replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 0) {
      this.repulsionRegChange.emit(parsed);
    }
  }

  onBetaChange(val: string) {
    const parsed = parseFloat(val.replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) {
      this.betaChange.emit(parsed);
    }
  }

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
    this.tick();
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
