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

import { BerkovichTreeVisComponent } from '../berkovich-point-vis/tree-vis/berkovich-tree-vis.component';
import { BerkovichHeaderComponent } from '../berkovich-header/berkovich-header.component';
import { Rational, parseToRational, formatRational, parseDigitSequence } from '../../../lib/berkovich/berkovich';
import { stringifyState, parseState } from './url-serializer';

@Component({
  selector: 'app-tree-vis-tool',
  templateUrl: './tree-vis-tool.component.html',
  styleUrls: ['./tree-vis-tool.component.scss'],
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
    BerkovichTreeVisComponent,
    BerkovichHeaderComponent
  ]
})
export class TreeVisToolComponent {
  readonly prime = signal<number>(5);
  readonly center1Digits = signal<string>('00.30');
  readonly rho1 = signal<number>(0.5);
  readonly targetType = signal<'Point SGD' | 'Disk SGD'>('Point SGD');
  readonly targetCenterDigits = signal<string>('00.31');
  readonly targetRho = signal<number>(0.8);

  readonly width = signal<number>(600);
  readonly height = signal<number>(380);
  readonly digitsLeft = signal<number>(3);
  readonly digitsRight = signal<number>(3);

  constructor() {
    const router = inject(Router);
    const route = inject(ActivatedRoute);

    const initialStateStr = route.snapshot.queryParams['state'];
    if (initialStateStr) {
      const state = parseState(initialStateStr);
      if (state) {
        if (state.prime !== undefined) this.prime.set(state.prime);
        if (state.center1Digits !== undefined) this.center1Digits.set(state.center1Digits);
        if (state.rho1 !== undefined) this.rho1.set(state.rho1);
        if (state.targetType !== undefined) this.targetType.set(state.targetType as any);
        if (state.targetCenterDigits !== undefined) this.targetCenterDigits.set(state.targetCenterDigits);
        if (state.targetRho !== undefined) this.targetRho.set(state.targetRho);
        if (state.width !== undefined) this.width.set(state.width);
        if (state.height !== undefined) this.height.set(state.height);
      }
    }

    effect(() => {
      const state = {
        prime: this.prime(),
        center1Digits: this.center1Digits(),
        rho1: this.rho1(),
        targetType: this.targetType(),
        targetCenterDigits: this.targetCenterDigits(),
        targetRho: this.targetRho(),
        width: this.width(),
        height: this.height()
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

  readonly parsedTargetCenter = computed<Rational>(() => {
    try {
      return parseDigitSequence(this.targetCenterDigits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedError = computed<string | null>(() => {
    try {
      parseDigitSequence(this.center1Digits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
      parseDigitSequence(this.targetCenterDigits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
      return null;
    } catch (e: any) {
      return `Invalid digit sequence: ${e.message ?? 'Unknown error'}`;
    }
  });

  readonly presets = [
    { name: 'Point SGD (p=5)', prime: 5, c1: '00.30', r1: 0.5, type: 'Point SGD' as const, tc: '00.31', tr: 0.8 },
    { name: 'Disk SGD (p=3)', prime: 3, c1: '00.12', r1: -0.5, type: 'Disk SGD' as const, tc: '00.21', tr: 1.0 },
  ];

  applyPreset(preset: typeof this.presets[0]) {
    this.prime.set(preset.prime);
    this.center1Digits.set(preset.c1);
    this.rho1.set(preset.r1);
    this.targetType.set(preset.type);
    this.targetCenterDigits.set(preset.tc);
    this.targetRho.set(preset.tr);
  }
}
