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
  computeGradientDetails
} from '../../lib/berkovich/berkovich';

import { BerkovichDiskTreeVisComponent } from './tree-vis/berkovich-disk-tree-vis.component';
import { BerkovichDiskConfigComponent } from './config-card/berkovich-disk-config.component';
import { BerkovichDiskStateComponent } from './state-card/berkovich-disk-state.component';
import { BerkovichDiskDigitsComponent } from './digits-card/berkovich-disk-digits.component';
import { BerkovichDiskCalculusComponent } from './calculus-card/berkovich-disk-calculus.component';
import { BerkovichDiskHistoryComponent } from './history-card/berkovich-disk-history.component';

@Component({
  selector: 'app-berkovich-disk-vis',
  templateUrl: './berkovich-disk-vis.component.html',
  styleUrls: ['./berkovich-disk-vis.component.scss'],
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    RouterModule,
    MarkdownComponent,
    BerkovichDiskTreeVisComponent,
    BerkovichDiskConfigComponent,
    BerkovichDiskStateComponent,
    BerkovichDiskDigitsComponent,
    BerkovichDiskCalculusComponent,
    BerkovichDiskHistoryComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichDiskVisComponent implements OnInit, OnDestroy {
  // Configurable parameters
  readonly prime = signal<number>(3);
  readonly targetInput = signal<string>('5/3');
  readonly targetDigitsInput = signal<string>('01.20');
  readonly targetLogRadiusInput = signal<string>('-2.0');
  readonly centerInput = signal<string>('0');
  readonly centerDigitsInput = signal<string>('00.00');
  readonly logRadiusInput = signal<string>('0.0');
  readonly learningRateInput = signal<string>('0.20');

  readonly initLogRadius = computed(() => {
    const v = parseFloat(this.logRadiusInput());
    return isNaN(v) ? 0.0 : v;
  });

  readonly targetLogRadius = computed(() => {
    const v = parseFloat(this.targetLogRadiusInput());
    return isNaN(v) ? -2.0 : v;
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
  private animationInterval: any = null;
  readonly isPlaying = signal<boolean>(false);
  readonly isDraggingRho = signal<boolean>(false);

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
    const y_rho = this.targetLogRadius();
    const val = this.currentDistanceValuation();
    const d = -val;
    return 2 * Math.max(rho, y_rho, d) - rho - y_rho;
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
    const y_rho = this.targetLogRadius();
    const eta = this.learningRate();

    return computeGradientDetails(c, rho, y, y_rho, p, eta);
  });

  constructor() {
    // Re-initialize state when config parameters change
    effect(() => {
      this.prime();
      this.targetRational();
      this.targetLogRadius();
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
    this.history.set([{
      step: 0,
      center: this.initCenterRational(),
      logRadius: this.initLogRadius(),
      loss: this.currentLoss(),
      type: 'Initialization'
    }]);
  }

  step(): void {
    const p = BigInt(this.prime());
    const c = this.currentCenter();
    const rho = this.currentLogRadius();
    const y = this.targetRational();
    const y_rho = this.targetLogRadius();
    const eta = this.learningRate();

    const details = computeGradientDetails(c, rho, y, y_rho, p, eta);

    // Update state signals
    this.currentCenter.set(details.nextCenter);
    this.currentLogRadius.set(details.nextLogRadius);
    this.stepCount.update(s => s + 1);

    // Add to history
    this.history.update(h => [...h, {
      step: this.stepCount(),
      center: details.nextCenter,
      logRadius: details.nextLogRadius,
      loss: details.loss,
      type: details.stepType
    }]);

    // Stop playing if we reach the leaf resolution limit of the tree (-2.0)
    if (details.nextLogRadius <= -2.0) {
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
    this.animationInterval = setInterval(() => {
      this.step();
    }, 600);
  }

  private stopAnimation(): void {
    this.isPlaying.set(false);
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
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

  onTargetLogRadiusBlur(): void {
    let v = parseFloat(this.targetLogRadiusInput());
    if (isNaN(v)) {
      v = -2.0;
    } else {
      v = Math.max(-2, Math.min(2, v));
    }
    this.targetLogRadiusInput.set(v.toFixed(1));
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
