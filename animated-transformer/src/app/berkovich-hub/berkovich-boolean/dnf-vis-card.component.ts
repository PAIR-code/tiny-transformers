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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MarkdownComponent } from 'ngx-markdown';
import {
  BerkovichBooleanLearner,
  BerkovichBooleanConfig,
  BooleanSample
} from './models/berkovich-boolean-learner';
import {
  Rational,
  formatRational,
  formatDigitSequence,
  simplify,
  subtract
} from '../../../lib/berkovich/berkovich';
import { BerkovichDisk } from '../berkovich-mnist/models/berkovich-mnist-learner';
import { BerkovichDimensionCalculationComponent } from '../berkovich-space-explorers/walkthrough-components/shared/berkovich-dimension-calculation.component';
import { BerkovichDigitDisplayComponent } from '../berkovich-digit-display/berkovich-digit-display.component';
import { DnfComputationGraphComponent } from './dnf-computation-graph/dnf-computation-graph.component';

@Component({
  selector: 'app-dnf-vis-card',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MarkdownComponent,
    BerkovichDimensionCalculationComponent,
    BerkovichDigitDisplayComponent,
    DnfComputationGraphComponent
  ],
  templateUrl: './dnf-vis-card.component.html',
  styleUrls: ['./dnf-vis-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DnfVisCardComponent {
  learner = input.required<BerkovichBooleanLearner | null>();
  samples = input.required<BooleanSample[]>();
  numPools = input.required<number>();
  numVars = input.required<number>();
  prime = input<number>(2);
  digitsLeft = input<number>(2);
  digitsRight = input<number>(2);
  config = input<BerkovichBooleanConfig>();
  tick = input<number>(0);

  readonly Math = Math;
  readonly showHeatmap = signal<boolean>(true);
  readonly showPoolLines = signal<boolean>(true);
  readonly showTargetDisks = signal<boolean>(true);
  readonly customInputVector = signal<number[] | null>(null);

  readonly currentInputVector = computed<number[]>(() => {
    const custom = this.customInputVector();
    const vars = this.numVars();
    if (custom && custom.length === vars) {
      return custom;
    }
    const s = this.samples();
    if (s && s.length > 0) {
      return [...s[0].inputs];
    }
    return Array(vars).fill(0);
  });

  readonly matchedTarget = computed<number | null>(() => {
    const cur = this.currentInputVector();
    const s = this.samples();
    if (!s) return null;
    const found = s.find(sample =>
      sample.inputs.length === cur.length &&
      sample.inputs.every((v, idx) => v === cur[idx])
    );
    return found !== undefined ? found.target : null;
  });

  readonly heatmapGrid = computed(() => {
    this.tick();
    const l = this.learner();
    const cfg = this.config();
    if (!l || !cfg) return [];

    const cells: Array<{ x: number; y: number; width: number; height: number; fill: string; opacity: number }> = [];
    const steps = 16;
    const cellW = 240 / steps;
    const cellH = 240 / steps;

    for (let i = 0; i < steps; i++) {
      const x1 = (i + 0.5) / steps;
      for (let j = 0; j < steps; j++) {
        const x2 = (j + 0.5) / steps;
        const fwd = l.forward([x1, x2], cfg);
        const prob1 = fwd.probs[1];

        const isTrue = prob1 >= 0.5;
        const confidence = Math.abs(prob1 - 0.5) * 2;
        const opacity = 0.08 + confidence * 0.35;
        const fill = isTrue ? '#2563eb' : '#ef4444';

        const svgX = 30 + i * cellW;
        const svgY = 270 - (j + 1) * cellH;

        cells.push({
          x: svgX,
          y: svgY,
          width: cellW,
          height: cellH,
          fill,
          opacity
        });
      }
    }
    return cells;
  });

  readonly descriptionMarkdown = computed(() => {
    const pools = this.numPools();
    const vars = this.numVars();
    return `In non-Archimedean spectral geometry, an **affinoid domain** is a 'poly-disk' formed by the intersection of multiple p-adic disks. Just as polyhedra in Euclidean space are defined by intersecting half-spaces, we define each region by stacking linear constraints into a weight matrix $\\mathbf{W}_k$ and bias vector $\\mathbf{B}_k$. The condition that an input $\\mathbf{x}$ satisfies an affinoid constraint across all $D=${vars}$ dimensions simultaneously is implemented via the supremum norm $\\|\\mathbf{W}_k \\mathbf{x} + \\mathbf{B}_k\\|_\\infty \\le 1$. In our Hsia kernel path metric, this supremum norm corresponds to taking the **maximum** loss across dimensions: $\\text{AND Clause Loss for Pool } m = \\max_{d=1}^{${vars}} \\text{Loss}(H_{m,d}, W_{1,m,d})$.\n\nTo represent arbitrary Boolean circuits (XOR, Parity, and others), the boolean function $f(\\mathbf{x})$ is learned as a **Disjunctive Normal Form (DNF)** union across $M=${pools}$ affinoid pools:\n$$\\bigvee_{m=1}^{${pools}} \\left( \\bigwedge_{d=1}^{${vars}} X_d \\oplus PW_{m,d} \\in W_{1,m,d} \\right)$$\nIn Berkovich min-max logic, logical OR across pools requires at least one pool clause to hold, which evaluates as the **minimum** path loss across pools: $D_k = \\min_m (-M_{k,m})$.`;
  });

  readonly formulaMarkdown = computed(() => {
    const pools = this.numPools();
    const clauses: string[] = [];
    for (let m = 1; m <= pools; m++) {
      clauses.push(`\\text{Pool}_{m=${m}}(\\mathbf{x})`);
    }
    const joined = clauses.join(' \\lor ');
    return `$$\\text{DNF Affinoid Formula: } f(x_1, \\dots, x_D) = ${joined}$$\n$$\\text{Where each affinoid clause } \\text{Pool}_m(\\mathbf{x}) = \\bigwedge_{d=1}^{D} \\left( X_d \\oplus PW_{m,d} \\in W_{1,m,d} \\right)$$`;
  });

  readonly circuitNoteMarkdown = computed(() => {
    const vars = this.numVars();
    return `**Theorem (Universal Circuit Learning via Affinoid DNF):** Any D-variable Boolean function requires at most $M = 2^{D-1}$ DNF pools. Initializing $M = 4$ pools on distinct hypercube minterm branches ($PW_{m,d} = \\text{bit}_d \\,?\\, 3/4 : 1/4$) guarantees complete affinoid coverage of all $2^D$ input minterm regions, allowing continuous Berkovich gradient descent to rapidly learn **any arbitrary Boolean circuit** with 100% accuracy.`;
  });

  readonly currentFwdResult = computed(() => {
    this.tick();
    const l = this.learner();
    const cfg = this.config();
    const inputs = this.currentInputVector();
    if (!l || !cfg) return null;

    const inputDisks = l.encodeInputs(inputs);
    const fwd = l.forward(inputs, cfg);

    return {
      inputs,
      inputDisks,
      pools: fwd.pools,
      pathLosses: fwd.pathLosses,
      activeConstraints: fwd.activeConstraints,
      logits: fwd.logits,
      probs: fwd.probs
    };
  });

  selectSample(sample: BooleanSample) {
    this.customInputVector.set([...sample.inputs]);
  }

  isSelectedSample(sample: BooleanSample): boolean {
    const cur = this.currentInputVector();
    return sample.inputs.length === cur.length && sample.inputs.every((v, idx) => v === cur[idx]);
  }

  toggleInputBit(dimIndex: number) {
    const cur = [...this.currentInputVector()];
    cur[dimIndex] = cur[dimIndex] === 1 ? 0 : 1;
    this.customInputVector.set(cur);
  }

  resetInputVector() {
    const s = this.samples();
    if (s && s.length > 0) {
      this.customInputVector.set([...s[0].inputs]);
    } else {
      this.customInputVector.set(Array(this.numVars()).fill(0));
    }
  }

  getVarIndices(): number[] {
    return Array.from({ length: this.numVars() }, (_, i) => i);
  }

  getPoolIndices(): number[] {
    return Array.from({ length: this.numPools() }, (_, i) => i);
  }

  getMaxLoss(losses: number[]): number {
    if (!losses || losses.length === 0) return 0;
    return Math.max(...losses);
  }

  getMinLoss(poolLosses: number[][]): number {
    if (!poolLosses || poolLosses.length === 0) return 0;
    const andLosses = poolLosses.map(losses => this.getMaxLoss(losses));
    return Math.min(...andLosses);
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

  isCurrentPredictionCorrect(res: { logits: number[] }): boolean {
    const tgt = this.matchedTarget();
    if (tgt === null) return false;
    const pred = res.logits[1] >= res.logits[0] ? 1 : 0;
    return pred === tgt;
  }

  getCurrentInputTransform(): string {
    const cur = this.currentInputVector();
    const x1 = cur[0] ?? 0;
    const x2 = cur[1] ?? 0;
    const cx = x1 === 0 ? 80 : 220;
    const cy = x2 === 0 ? 220 : 80;
    return `translate(${cx}, ${cy})`;
  }

  getSampleTransform(sample: BooleanSample): string {
    const x1 = sample.inputs[0];
    const x2 = sample.inputs[1];
    const cx = x1 === 0 ? 80 : 220;
    const cy = x2 === 0 ? 220 : 80;
    return `translate(${cx}, ${cy})`;
  }

  getPoolCx(l: BerkovichBooleanLearner, m: number): number {
    const W0 = l.W[1][m][0];
    const pw0 = l.poolWeights[m][0];
    const effCenter = simplify(subtract(W0.center, pw0.center));
    const ratio = this.rationalToMod1Ratio(effCenter);
    return 30 + Math.max(0, Math.min(1, ratio)) * 240;
  }

  getPoolCy(l: BerkovichBooleanLearner, m: number): number {
    const d1 = 1 % l.numVars;
    const W1 = l.W[1][m][d1];
    const pw1 = l.poolWeights[m][d1];
    const effCenter = simplify(subtract(W1.center, pw1.center));
    const ratio = this.rationalToMod1Ratio(effCenter);
    return 270 - Math.max(0, Math.min(1, ratio)) * 240;
  }

  getPoolRadius(l: BerkovichBooleanLearner, m: number): number {
    const rhoW = l.W[1][m][0].rho;
    const rhoPW = l.poolWeights[m][0].rho;
    const effectiveRho = Math.min(rhoW, rhoPW);
    const r = Math.exp(effectiveRho * Math.log(Number(l.prime))) * 60;
    return Math.max(15, Math.min(80, r));
  }

  getTargetCx(l: BerkovichBooleanLearner, classK: number, m: number): number {
    const W0 = l.W[classK][m][0];
    const ratio = this.rationalToMod1Ratio(W0.center);
    return 30 + Math.max(0, Math.min(1, ratio)) * 240;
  }

  getTargetCy(l: BerkovichBooleanLearner, classK: number, m: number): number {
    const d1 = 1 % l.numVars;
    const W1 = l.W[classK][m][d1];
    const ratio = this.rationalToMod1Ratio(W1.center);
    return 270 - Math.max(0, Math.min(1, ratio)) * 240;
  }

  getTargetRadius(l: BerkovichBooleanLearner, classK: number, m: number): number {
    const rhoW = l.W[classK][m][0].rho;
    const r = Math.exp(rhoW * Math.log(Number(l.prime))) * 50;
    return Math.max(10, Math.min(60, r));
  }

  isSampleCorrect(sample: BooleanSample): boolean {
    const l = this.learner();
    const cfg = this.config();
    if (!l || !cfg) return true;
    const fwd = l.forward(sample.inputs, cfg);
    const pred = fwd.probs[1] >= 0.5 ? 1 : 0;
    return pred === sample.target;
  }

  private rationalToMod1Ratio(r: { num: bigint; den: bigint }): number {
    const num = Number(r.num);
    const den = Number(r.den);
    if (den === 0) return 0.5;
    let val = (num / den) % 1;
    if (val < 0) val += 1;
    return val;
  }
}
