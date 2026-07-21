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

import { Component, signal, computed, ChangeDetectionStrategy, inject, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { BerkovichDualDigitDisplayComponent } from '../berkovich-dual-digit-display/berkovich-dual-digit-display.component';
import { BerkovichHeaderComponent } from '../berkovich-header/berkovich-header.component';
import { Rational, parseToRational, formatRational, parseDigitSequence } from '../../../lib/berkovich/berkovich';
import { stringifyState, parseState } from './url-serializer';

@Component({
  selector: 'app-dual-digit-display-tool',
  templateUrl: './dual-digit-display-tool.component.html',
  styleUrls: ['./dual-digit-display-tool.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatSliderModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    BerkovichDualDigitDisplayComponent,
    BerkovichHeaderComponent
  ]
})
export class DualDigitDisplayToolComponent {
  readonly prime = signal<number>(5);
  readonly center1Digits = signal<string>('00.30');
  readonly center2Digits = signal<string>('00.12');
  readonly rho1 = signal<number>(0.5);
  readonly rho2 = signal<number>(0.5);
  readonly targetType = signal<'Point SGD' | 'Disk SGD' | 'Binary Operator'>('Point SGD');
  readonly digitsLeft = signal<number>(3);
  readonly digitsRight = signal<number>(3);
  readonly scale = signal<number>(1.0);
  readonly outerBoxColor1 = signal<string>('#2563eb');
  readonly outerBoxColor2 = signal<string>('#db2777');

  constructor() {
    const router = inject(Router);
    const route = inject(ActivatedRoute);

    const initialStateStr = route.snapshot.queryParams['state'];
    if (initialStateStr) {
      const state = parseState(initialStateStr);
      if (state) {
        if (state.prime !== undefined) this.prime.set(state.prime);
        if (state.center1Digits !== undefined) this.center1Digits.set(state.center1Digits);
        if (state.center2Digits !== undefined) this.center2Digits.set(state.center2Digits);
        if (state.rho1 !== undefined) this.rho1.set(state.rho1);
        if (state.rho2 !== undefined) this.rho2.set(state.rho2);
        if (state.targetType !== undefined) this.targetType.set(state.targetType);
        if (state.digitsLeft !== undefined) this.digitsLeft.set(state.digitsLeft);
        if (state.digitsRight !== undefined) this.digitsRight.set(state.digitsRight);
        if (state.scale !== undefined) this.scale.set(state.scale);
      }
    }

    effect(() => {
      const state = {
        prime: this.prime(),
        center1Digits: this.center1Digits(),
        center2Digits: this.center2Digits(),
        rho1: this.rho1(),
        rho2: this.rho2(),
        targetType: this.targetType(),
        digitsLeft: this.digitsLeft(),
        digitsRight: this.digitsRight(),
        scale: this.scale()
      };
      const stateStr = stringifyState(state);
      const currentUrlState = route.snapshot.queryParams['state'];
      if (currentUrlState !== stateStr) {
        untracked(() => {
          router.navigate([], {
            queryParams: { state: stateStr },
            queryParamsHandling: 'merge',
            replaceUrl: true
          });
        });
      }
    });
  }

  readonly parsedCenter1 = computed<Rational>(() => {
    try {
      return parseDigitSequence(this.center1Digits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedCenter2 = computed<Rational>(() => {
    try {
      return parseDigitSequence(this.center2Digits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedTargetCenter = computed<Rational | undefined>(() => undefined);
  readonly targetRho = computed<number | undefined>(() => undefined);

  readonly parsedError = computed<string | null>(() => {
    try {
      parseDigitSequence(this.center1Digits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
      parseDigitSequence(this.center2Digits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
      return null;
    } catch (e: any) {
      return `Invalid digit sequence: ${e.message ?? 'Unknown error'}`;
    }
  });

  readonly presets = [
    { name: 'Common Ancestor (p=5)', prime: 5, c1: '00.30', c2: '00.31', r1: 0.5, r2: 0.5 },
    { name: 'Divergent Digits (p=3)', prime: 3, c1: '00.12', c2: '00.21', r1: 0.2, r2: 0.8 },
  ];

  applyPreset(preset: typeof this.presets[0]) {
    this.prime.set(preset.prime);
    this.center1Digits.set(preset.c1);
    this.center2Digits.set(preset.c2);
    this.rho1.set(preset.r1);
    this.rho2.set(preset.r2);
  }
}
