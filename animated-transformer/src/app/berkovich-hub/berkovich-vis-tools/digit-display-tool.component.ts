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

import { BerkovichDigitDisplayComponent } from '../berkovich-digit-display/berkovich-digit-display.component';
import { BerkovichHeaderComponent } from '../berkovich-header/berkovich-header.component';
import {
  Rational,
  formatRational,
  formatDigitSequence,
  parsePadicOrRationalInput
} from '../../../lib/berkovich/berkovich';
import { stringifyState, parseState } from './url-serializer';

export interface DigitDisplayPreset {
  name: string;
  prime: number;
  center: string;
  rho: number;
  showUpdated: boolean;
  updatedRho: number;
  updatedCenter: string;
}

@Component({
  selector: 'app-digit-display-tool',
  templateUrl: './digit-display-tool.component.html',
  styleUrls: ['./digit-display-tool.component.scss'],
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
    BerkovichDigitDisplayComponent,
    BerkovichHeaderComponent
  ]
})
export class DigitDisplayToolComponent {
  readonly formatRational = formatRational;
  readonly prime = signal<number>(5);
  readonly centerDigits = signal<string>('00.30');

  // Gradient update parameters
  readonly showUpdatedLocation = signal<boolean>(false);
  readonly updatedRho = signal<number>(1.2);
  readonly updatedCenterDigits = signal<string>('00.31');
  readonly updatedLineColor = signal<string>('#64748b');
  readonly updatedLineStyle = signal<'dotted' | 'dashed' | 'solid'>('dotted');
  readonly updatedLineExtension = signal<number>(12);
  readonly updatedLineExtensionSide = signal<'above' | 'below'>('above');

  constructor() {
    const router = inject(Router);
    const route = inject(ActivatedRoute);

    // Load initial state if present
    const initialStateStr = route.snapshot.queryParams['state'];
    if (initialStateStr) {
      const state = parseState(initialStateStr);
      if (state) {
        if (state.prime !== undefined) this.prime.set(state.prime);
        if (state.centerDigits !== undefined) this.centerDigits.set(state.centerDigits);
        if (state.rho !== undefined) this.rho.set(state.rho);
        if (state.rhoLabelPosition !== undefined) {
          const pos = state.rhoLabelPosition;
          this.rhoLabelPosition.set(pos === 'above-below' ? 'above' : (pos as any));
        } else if (state.showRho !== undefined) {
          this.rhoLabelPosition.set(state.showRho ? 'above' : 'none');
        }
        if (state.clickRhoLabelPosition !== undefined) {
          this.clickRhoLabelPosition.set(state.clickRhoLabelPosition);
        }
        if (state.digitsLeft !== undefined) this.digitsLeft.set(state.digitsLeft);
        if (state.digitsRight !== undefined) this.digitsRight.set(state.digitsRight);
        if (state.scale !== undefined) {
          this.scale.set(state.scale);
        } else if (state.size !== undefined) {
          this.scale.set(state.size === 'small' ? 0.7 : state.size === 'large' ? 1.4 : 1.0);
        }
        if (state.outerBoxColor !== undefined) this.outerBoxColor.set(state.outerBoxColor);
        if (state.customCellWidth !== undefined) this.customCellWidth.set(state.customCellWidth);
        if (state.cellWidth !== undefined) this.cellWidth.set(state.cellWidth);
        if (state.customCellHeight !== undefined) this.customCellHeight.set(state.customCellHeight);
        if (state.cellHeight !== undefined) this.cellHeight.set(state.cellHeight);
        if (state.customCellGap !== undefined) this.customCellGap.set(state.customCellGap);
        if (state.cellGap !== undefined) this.cellGap.set(state.cellGap);

        if (state.showUpdatedLocation !== undefined) this.showUpdatedLocation.set(state.showUpdatedLocation);
        if (state.updatedRho !== undefined) this.updatedRho.set(state.updatedRho);
        if (state.updatedCenterDigits !== undefined) this.updatedCenterDigits.set(state.updatedCenterDigits);
        if (state.updatedLineColor !== undefined) this.updatedLineColor.set(state.updatedLineColor);
        if (state.updatedLineStyle !== undefined) this.updatedLineStyle.set(state.updatedLineStyle);
        if (state.updatedLineExtension !== undefined) this.updatedLineExtension.set(state.updatedLineExtension);
      }
    }

    // Update URL on changes
    effect(() => {
      const state = {
        prime: this.prime(),
        centerDigits: this.centerDigits(),
        rho: this.rho(),
        rhoLabelPosition: this.rhoLabelPosition(),
        clickRhoLabelPosition: this.clickRhoLabelPosition(),
        digitsLeft: this.digitsLeft(),
        digitsRight: this.digitsRight(),
        scale: this.scale(),
        outerBoxColor: this.outerBoxColor(),
        customCellWidth: this.customCellWidth(),
        cellWidth: this.cellWidth(),
        customCellHeight: this.customCellHeight(),
        cellHeight: this.cellHeight(),
        customCellGap: this.customCellGap(),
        cellGap: this.cellGap(),

        showUpdatedLocation: this.showUpdatedLocation(),
        updatedRho: this.updatedRho(),
        updatedCenterDigits: this.updatedCenterDigits(),
        updatedLineColor: this.updatedLineColor(),
        updatedLineStyle: this.updatedLineStyle(),
        updatedLineExtension: this.updatedLineExtension()
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

  readonly rho = signal<number>(0.5);
  readonly rhoLabelPosition = signal<'above' | 'below' | 'left' | 'none'>('above');
  readonly clickRhoLabelPosition = signal<'above' | 'below' | 'left' | 'none'>('none');
  readonly digitsLeft = signal<number>(3);
  readonly digitsRight = signal<number>(3);
  readonly scale = signal<number>(1.0);
  readonly outerBoxColor = signal<string>('#3b82f6');

  // Overrides
  readonly customCellWidth = signal<boolean>(false);
  readonly cellWidth = signal<number>(24);
  readonly customCellHeight = signal<boolean>(false);
  readonly cellHeight = signal<number>(32);
  readonly customCellGap = signal<boolean>(false);
  readonly cellGap = signal<number>(6);

  readonly currentPrecision = computed(() => ({
    minPower: -this.digitsRight(),
    maxPower: this.digitsLeft() - 1
  }));

  readonly parsedCenter = computed<Rational>(() => {
    try {
      return parsePadicOrRationalInput(this.centerDigits(), BigInt(this.prime()), this.currentPrecision());
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedUpdatedCenter = computed<Rational | undefined>(() => {
    if (!this.updatedCenterDigits()) return undefined;
    try {
      return parsePadicOrRationalInput(this.updatedCenterDigits(), BigInt(this.prime()), this.currentPrecision());
    } catch {
      return undefined;
    }
  });

  readonly parsedCenterError = computed<string | null>(() => {
    try {
      parsePadicOrRationalInput(this.centerDigits(), BigInt(this.prime()), this.currentPrecision());
      return null;
    } catch (e: any) {
      return `Invalid digit sequence: ${e.message ?? 'Unknown error'}`;
    }
  });

  readonly presets: DigitDisplayPreset[] = [
    { name: '3/5 (p=5)', prime: 5, center: '3/5', rho: 0.5, showUpdated: false, updatedRho: 1.2, updatedCenter: '3/5' },
    { name: 'SGD Step Update', prime: 5, center: '00.30', rho: 0.3, showUpdated: true, updatedRho: 1.1, updatedCenter: '00.31' },
    { name: 'Digit Change (Same Rho)', prime: 3, center: '101.00', rho: 0.0, showUpdated: true, updatedRho: 0.0, updatedCenter: '102.00' },
    { name: '12 (p=3)', prime: 3, center: '12', rho: -1.0, showUpdated: false, updatedRho: 0.0, updatedCenter: '12' },
    { name: '-1.25 (p=2)', prime: 2, center: '-1.25', rho: 0.0, showUpdated: false, updatedRho: 0.8, updatedCenter: '-1.25' },
    { name: '5/7 (p=7)', prime: 7, center: '5/7', rho: 1.2, showUpdated: true, updatedRho: 0.4, updatedCenter: '5/7' },
  ];

  applyPreset(preset: DigitDisplayPreset) {
    this.prime.set(preset.prime);
    const p = BigInt(preset.prime);

    // Auto-adjust digitsLeft / digitsRight if the preset string has more digit columns
    const centerParts = preset.center.split('.');
    if (centerParts[0] && !preset.center.includes('/')) {
      const neededLeft = centerParts[0].length;
      if (neededLeft > this.digitsLeft()) {
        this.digitsLeft.set(neededLeft);
      }
    }
    if (centerParts[1] && !preset.center.includes('/')) {
      const neededRight = centerParts[1].length;
      if (neededRight > this.digitsRight()) {
        this.digitsRight.set(neededRight);
      }
    }

    const precision = this.currentPrecision();

    try {
      const rat = parsePadicOrRationalInput(preset.center, p, precision);
      const seq = formatDigitSequence(rat, p, precision);
      this.centerDigits.set(seq);
    } catch {
      this.centerDigits.set(preset.center);
    }

    this.rho.set(preset.rho);
    this.showUpdatedLocation.set(preset.showUpdated);
    this.updatedRho.set(preset.updatedRho);

    try {
      const updatedRat = parsePadicOrRationalInput(preset.updatedCenter, p, precision);
      const updatedSeq = formatDigitSequence(updatedRat, p, precision);
      this.updatedCenterDigits.set(updatedSeq);
    } catch {
      this.updatedCenterDigits.set(preset.updatedCenter);
    }
  }
}
