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
=============================================================================*/

import { Component, OnInit, signal, computed, effect, OnDestroy, ChangeDetectionStrategy, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { MarkdownComponent } from 'ngx-markdown';
import katex from 'katex';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render.js';

if (typeof window !== 'undefined') {
  (window as any).katex = katex;
  (window as any).renderMathInElement = renderMathInElement;
}

import {
  Rational,
  simplify,
  subtract,
  formatRational,
  parseToRational,
  getValuation,
  getAlignedDigits,
  truncateToTreeRange,
  formatDigitSequence,
  parseDigitSequence,
  computeGradientDetails,
  GradientDetails,
  computePathLoss,
  ExtendedNumber,
  extNegate
} from '../../../lib/berkovich/berkovich';

import { BerkovichTreeVisComponent } from './tree-vis/berkovich-tree-vis.component';
import { BerkovichConfigComponent } from './config-card/berkovich-config.component';

import { BerkovichDigitsComponent } from './digits-card/berkovich-digits.component';
import { BerkovichCalculusComponent } from './calculus-card/berkovich-calculus.component';
import { BerkovichHistoryComponent } from './history-card/berkovich-history.component';

@Component({
  selector: 'app-berkovich-point-vis',
  templateUrl: './berkovich-point-vis.component.html',
  styleUrls: ['./berkovich-point-vis.component.scss'],
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    RouterModule,
    MarkdownComponent,
    BerkovichTreeVisComponent,
    BerkovichConfigComponent,
    BerkovichDigitsComponent,
    BerkovichCalculusComponent,
    BerkovichHistoryComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichPointVisComponent implements OnInit, OnDestroy {
  // Configurable parameters
  readonly prime = signal<number>(3);
  readonly targetInput = signal<string>('5/3');
  readonly targetDigitsInput = signal<string>('01.20');
  readonly centerInput = signal<string>('0');
  readonly centerDigitsInput = signal<string>('00.00');
  readonly logRadiusInput = signal<string>('0.0');
  readonly learningRateInput = signal<string>('0.20');


  readonly initLogRadius = computed(() => {
    const v = parseFloat(this.logRadiusInput());
    return isNaN(v) ? 0.0 : v;
  });

  readonly learningRate = computed(() => {
    const v = parseFloat(this.learningRateInput());
    return isNaN(v) ? 0.20 : v;
  });

  // Simulation run state
  readonly currentCenter = signal<Rational>({ num: 0n, den: 1n });
  readonly currentLogRadius = signal<number>(0.0);
  readonly stepCount = signal<number>(0);
  readonly history = signal<{ step: number; center: Rational; logRadius: number; loss: number; type: string }[]>([]);

  // Animation state
  private animationTimeout: any = null;
  readonly isPlaying = signal<boolean>(false);
  readonly isDraggingRho = signal<boolean>(false);
  // Tracks the animation phase for vertex steps:
  // 'idle' = no animation in progress
  // 'fadeout' = non-optimal loss labels are fading out, state not yet updated
  // 'show' = new candidates are being shown after state update
  readonly animationPhase = signal<'idle' | 'fadeout' | 'show'>('idle');

  // Real-time displaying values for parameters inputs
  readonly displayCenter = computed(() => {
    if (this.stepCount() > 0) {
      return formatRational(this.currentCenter());
    }
    return this.centerInput();
  });

  readonly displayCenterDigits = computed(() => {
    const p = BigInt(this.prime());
    if (this.stepCount() > 0) {
      return formatDigitSequence(this.currentCenter(), p);
    }
    return this.centerDigitsInput();
  });

  readonly displayLogRadius = computed(() => {
    if (this.stepCount() > 0 || this.isDraggingRho()) {
      return this.currentLogRadius().toFixed(2);
    }
    return this.logRadiusInput();
  });

  // Parse targets and starting conditions
  readonly targetRational = computed(() => {
    const p = BigInt(this.prime());
    try {
      const raw = parseToRational(this.targetInput());
      return truncateToTreeRange(raw, p, -2, 1);
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly initCenterRational = computed(() => {
    const p = BigInt(this.prime());
    try {
      const raw = parseToRational(this.centerInput());
      return truncateToTreeRange(raw, p, -2, 1);
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  // Calculate current distance and loss
  readonly currentDistanceValuation = computed(() => {
    const p = BigInt(this.prime());
    const c = this.currentCenter();
    const y = this.targetRational();
    const diff = subtract(c, y);
    return getValuation(diff, p);
  });

  readonly currentLoss = computed(() => {
    const rho = this.currentLogRadius();
    const val = this.currentDistanceValuation();
    // If they match exactly, log-radius distance d is -infinity.
    const d = extNegate(val);
    return computePathLoss(rho, d, -2);
  });

  // Aligned digit row comparisons
  readonly digitRows = computed(() => {
    const p = BigInt(this.prime());
    const y = this.targetRational();
    const c = this.currentCenter();
    const rho = this.currentLogRadius();

    const minP = -2;
    const maxP = 2;
    const columns: {
      power: number;
      powerLabel: string;
      targetDigit: number;
      centerDigit: number;
      isResolved: boolean;
      isMatching: boolean;
    }[] = [];

    const targetDigits = getAlignedDigits(y, p, minP, maxP);
    const centerDigits = getAlignedDigits(c, p, minP, maxP);

    for (let i = 0; i < targetDigits.length; i++) {
      const k = targetDigits[i].power;
      const tDigit = targetDigits[i].digit;
      const cDigit = centerDigits[i].digit;

      const isResolved = k < -rho;
      const isMatching = tDigit === cDigit;

      let powerLabel = `p^${k}`;
      if (k === 0) powerLabel = '1';
      else if (k === 1) powerLabel = 'p';
      else if (k === -1) powerLabel = '1/p';

      columns.push({
        power: k,
        powerLabel,
        targetDigit: tDigit,
        centerDigit: cDigit,
        isResolved,
        isMatching
      });
    }

    return columns.reverse();
  });

  // Dynamic gradient and calculus updates
  readonly gradientBreakdown = computed(() => {
    const p = BigInt(this.prime());
    const c = this.currentCenter();
    const rho = this.currentLogRadius();
    const y = this.targetRational();
    const eta = this.learningRate();

    return computeGradientDetails(c, rho, y, -2, p, eta);
  });

  constructor() {
    // Re-initialize state when config parameters change
    effect(() => {
      this.prime();
      this.targetRational();
      this.initCenterRational();
      this.initLogRadius();
      untracked(() => {
        this.reset();
      });
    });

    // Keep digit sequence string in sync with starting center and prime
    effect(() => {
      const c = this.initCenterRational();
      const p = BigInt(this.prime());
      untracked(() => {
        this.centerDigitsInput.set(formatDigitSequence(c, p));
      });
    });

    // Keep target digit sequence string in sync with target rational and prime
    effect(() => {
      const y = this.targetRational();
      const p = BigInt(this.prime());
      untracked(() => {
        this.targetDigitsInput.set(formatDigitSequence(y, p));
      });
    });
  }

  ngOnInit(): void {
    this.reset();
  }

  ngOnDestroy(): void {
    this.stopAnimation();
  }

  reset(): void {
    this.stopAnimation();
    this.currentCenter.set(this.initCenterRational());
    this.currentLogRadius.set(this.initLogRadius());
    this.stepCount.set(0);
    this.history.set([]);
  }

  async step(): Promise<void> {
    const p = BigInt(this.prime());
    const c = this.currentCenter();
    const rho = this.currentLogRadius();
    const y = this.targetRational();
    const eta = this.learningRate();

    const details = computeGradientDetails(c, rho, y, -2, p, eta);

    if (details.isVertex || details.crossesInteger) {
      if (details.crossesInteger) {
        // Snap visually to the boundary first
        const snapped = details.snappedRho!;
        this.currentLogRadius.set(snapped);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Phase 1: Pause to observe candidates
      await new Promise(resolve => setTimeout(resolve, 500));

      // Phase 2: Fade out non-optimal candidates
      this.animationPhase.set('fadeout');
      await new Promise(resolve => setTimeout(resolve, 300));

      // Phase 3: Move to final position
      this.animationPhase.set('idle');
      this.applyStepDetails(details);
    } else {
      this.applyStepDetails(details);
    }

    // Stop playing if we reach convergence (loss = 0) or the leaf resolution limit of the tree (-2.0)
    if (details.loss <= 1e-7 || details.nextLogRadius <= -2.0) {
      this.stopAnimation();
    }
  }

  /** Execute one animated step. */
  private async animatedStep(): Promise<void> {
    const p = BigInt(this.prime());
    const c = this.currentCenter();
    const rho = this.currentLogRadius();
    const y = this.targetRational();
    const eta = this.learningRate();
    const details = computeGradientDetails(c, rho, y, -2, p, eta);

    if (details.isVertex) {
      // Phase 1: Pause to let the user observe the node candidates
      await new Promise(resolve => setTimeout(resolve, 800));
      if (!this.isPlaying()) return;

      // Phase 2: Fade out non-optimal candidates
      this.animationPhase.set('fadeout');
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!this.isPlaying()) return;

      // Phase 3: Apply the state update (moves away from the vertex)
      this.animationPhase.set('idle');
      this.applyStepDetails(details);
    } else if (details.crossesInteger) {
      // Snap visual representation to the integer boundary first
      const snapped = details.snappedRho!;
      this.currentLogRadius.set(snapped);
      // Wait a tiny bit for computed signals to update so candidate branches are visible
      await new Promise(resolve => setTimeout(resolve, 50));
      if (!this.isPlaying()) return;

      // Phase 1: Pause to observe candidates
      await new Promise(resolve => setTimeout(resolve, 800));
      if (!this.isPlaying()) return;

      // Phase 2: Fade out non-optimal candidates
      this.animationPhase.set('fadeout');
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!this.isPlaying()) return;

      // Phase 3: Apply the remaining step coordinates
      this.animationPhase.set('idle');
      this.applyStepDetails(details);
    } else {
      // Edge steps: smooth, shorter delay
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!this.isPlaying()) return;

      this.animationPhase.set('idle');
      this.applyStepDetails(details);
    }
  }

  /** Shared helper to apply gradient step results to state signals. */
  private applyStepDetails(details: GradientDetails): void {
    this.currentCenter.set(details.nextCenter);
    this.currentLogRadius.set(details.nextLogRadius);
    this.stepCount.update(s => s + 1);

    this.history.update(h => [...h, {
      step: this.stepCount(),
      center: details.nextCenter,
      logRadius: details.nextLogRadius,
      loss: details.loss,
      type: details.stepType
    }]);

    if (details.loss <= 1e-7 || details.nextLogRadius <= -2.0) {
      this.stopAnimation();
    }
  }

  randomizeCenterAndTarget(): void {
    this.stopAnimation();
    const p = BigInt(this.prime());
    const pNum = Number(p);

    const getRandomSeqString = (): string => {
      const d1 = Math.floor(Math.random() * pNum);
      const d0 = Math.floor(Math.random() * pNum);
      const dm1 = Math.floor(Math.random() * pNum);
      const dm2 = Math.floor(Math.random() * pNum);
      return `${d1}${d0}.${dm1}${dm2}`;
    };

    let cSeq = getRandomSeqString();
    let ySeq = getRandomSeqString();
    while (cSeq === ySeq) {
      ySeq = getRandomSeqString();
    }

    const cRational = parseDigitSequence(cSeq, p);
    const yRational = parseDigitSequence(ySeq, p);

    this.centerInput.set(formatRational(cRational));
    this.centerDigitsInput.set(cSeq);
    this.targetInput.set(formatRational(yRational));
    this.targetDigitsInput.set(ySeq);

    this.reset();
  }

  togglePlay(): void {
    if (this.isPlaying()) {
      this.stopAnimation();
    } else {
      this.startAnimation();
    }
  }

  undo(): void {
    if (this.isPlaying()) {
      this.stopAnimation();
    }
    const currentHist = this.history();
    if (currentHist.length <= 1) {
      return;
    }
    const newHist = currentHist.slice(0, -1);
    const prevStep = newHist[newHist.length - 1];

    this.currentCenter.set(prevStep.center);
    this.currentLogRadius.set(prevStep.logRadius);
    this.stepCount.set(prevStep.step);
    this.history.set(newHist);
  }

  private startAnimation(): void {
    this.isPlaying.set(true);
    this.scheduleNextStep();
  }

  /** Schedule the next animated step. */
  private scheduleNextStep(): void {
    if (!this.isPlaying()) return;

    this.animationTimeout = setTimeout(async () => {
      if (!this.isPlaying()) return;
      await this.animatedStep();
      this.scheduleNextStep();
    }, 200);
  }

  private stopAnimation(): void {
    this.isPlaying.set(false);
    this.animationPhase.set('idle');
    if (this.animationTimeout) {
      clearTimeout(this.animationTimeout);
      this.animationTimeout = null;
    }
  }

  onPrimeChange(newPrime: number): void {
    this.prime.set(newPrime);
  }

  onTargetBlur(): void {
    const p = BigInt(this.prime());
    try {
      const r = parseToRational(this.targetInput());
      const truncated = truncateToTreeRange(r, p, -2, 1);
      this.targetInput.set(formatRational(truncated));
    } catch {
      this.targetInput.set('0');
    }
  }

  onTargetDigitsBlur(): void {
    const p = BigInt(this.prime());
    try {
      const parsed = parseDigitSequence(this.targetDigitsInput(), p);
      this.targetInput.set(formatRational(parsed));
      this.targetDigitsInput.set(formatDigitSequence(parsed, p));
    } catch {
      this.targetInput.set('0');
      this.targetDigitsInput.set('00.00');
    }
  }

  onCenterBlur(): void {
    const p = BigInt(this.prime());
    try {
      const r = parseToRational(this.centerInput());
      const truncated = truncateToTreeRange(r, p, -2, 1);
      this.centerInput.set(formatRational(truncated));
    } catch {
      this.centerInput.set('0');
    }
  }

  onCenterDigitsBlur(): void {
    const p = BigInt(this.prime());
    try {
      const parsed = parseDigitSequence(this.centerDigitsInput(), p);
      this.centerInput.set(formatRational(parsed));
      this.centerDigitsInput.set(formatDigitSequence(parsed, p));
    } catch {
      this.centerInput.set('0');
      this.centerDigitsInput.set('00.00');
    }
  }

  onLogRadiusBlur(): void {
    let v = parseFloat(this.logRadiusInput());
    if (isNaN(v)) {
      v = 0.0;
    } else {
      v = Math.max(-2, Math.min(2, v));
    }
    this.logRadiusInput.set(v.toFixed(1));
  }

  onLearningRateBlur(): void {
    let v = parseFloat(this.learningRateInput());
    if (isNaN(v)) {
      v = 0.2;
    } else {
      v = Math.max(0.01, Math.min(1.0, v));
    }
    this.learningRateInput.set(v.toFixed(2));
  }

  onLogRadiusChange(rho: number): void {
    this.currentLogRadius.set(rho);
    if (this.stepCount() === 0) {
      this.logRadiusInput.set(rho.toFixed(2));
    }
  }

  onDraggingChange(isDragging: boolean): void {
    this.isDraggingRho.set(isDragging);
    if (isDragging && this.isPlaying()) {
      this.stopAnimation();
    }
  }

  onManualLogRadiusAdjust(rho: number): void {
    const lossVal = this.currentLoss();
    this.history.update(h => [...h, {
      step: this.stepCount(),
      center: this.currentCenter(),
      logRadius: rho,
      loss: lossVal,
      type: `Manual adjust log-radius to ρ=${rho.toFixed(2)}`
    }]);
  }
}
