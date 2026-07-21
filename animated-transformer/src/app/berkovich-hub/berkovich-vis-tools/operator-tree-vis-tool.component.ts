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

import {
  BerkovichMultiTreeVisComponent,
  BerkovichBinaryOperator,
  TrackedNode
} from '../berkovich-operator-gradients-vis/tree-vis/berkovich-multi-tree-vis.component';

import { Rational, parseToRational, formatRational, parseDigitSequence } from '../../../lib/berkovich/berkovich';
import {
  VertexResolutionMethod
} from '../../../lib/berkovich/berkovich_gradients';
import { stringifyState, parseState } from './url-serializer';
import { BerkovichHeaderComponent } from '../berkovich-header/berkovich-header.component';

@Component({
  selector: 'app-operator-tree-vis-tool',
  templateUrl: './operator-tree-vis-tool.component.html',
  styleUrls: ['./operator-tree-vis-tool.component.scss'],
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
    BerkovichMultiTreeVisComponent,
    BerkovichHeaderComponent
  ]
})
export class OperatorTreeVisToolComponent {
  readonly prime = signal<number>(5);
  readonly operator = signal<BerkovichBinaryOperator>('addition');

  readonly centerX1Digits = signal<string>('00.30');
  readonly rhoX1 = signal<number>(0.5);

  readonly centerX2Digits = signal<string>('00.12');
  readonly rhoX2 = signal<number>(0.5);

  readonly targetCenterYDigits = signal<string>('00.42');
  readonly targetRhoY = signal<number>(0.5);

  readonly lr = signal<number>(0.1);
  readonly vertexResolution = signal<VertexResolutionMethod>('exact-per-coord');

  readonly digitsLeft = signal<number>(3);
  readonly digitsRight = signal<number>(3);

  readonly trackedNodes = computed<TrackedNode[]>(() => [
    { id: 'X1', center: this.parsedCenterX1(), rho: this.rhoX1(), color: '#2563eb', label: 'x₁' },
    { id: 'X2', center: this.parsedCenterX2(), rho: this.rhoX2(), color: '#db2777', label: 'x₂' },
    { id: 'Y', center: this.parsedTargetCenterY(), rho: this.targetRhoY(), color: '#059669', label: 'y' }
  ]);

  readonly stepDetails = computed(() => ({
    nextX1: { center: this.parsedCenterX1(), rho: this.rhoX1() + 0.1 },
    nextX2: { center: this.parsedCenterX2(), rho: this.rhoX2() + 0.1 }
  }));

  constructor() {
    const router = inject(Router);
    const route = inject(ActivatedRoute);

    const initialStateStr = route.snapshot.queryParams['state'];
    if (initialStateStr) {
      const state = parseState(initialStateStr);
      if (state) {
        if (state.prime !== undefined) this.prime.set(state.prime);
        if (state.operator !== undefined) this.operator.set(state.operator as any);
        if (state.centerX1Digits !== undefined) this.centerX1Digits.set(state.centerX1Digits);
        if (state.rhoX1 !== undefined) this.rhoX1.set(state.rhoX1);
        if (state.centerX2Digits !== undefined) this.centerX2Digits.set(state.centerX2Digits);
        if (state.rhoX2 !== undefined) this.rhoX2.set(state.rhoX2);
        if (state.targetCenterYDigits !== undefined) this.targetCenterYDigits.set(state.targetCenterYDigits);
        if (state.targetRhoY !== undefined) this.targetRhoY.set(state.targetRhoY);
      }
    }

    effect(() => {
      const state = {
        prime: this.prime(),
        operator: this.operator(),
        centerX1Digits: this.centerX1Digits(),
        rhoX1: this.rhoX1(),
        centerX2Digits: this.centerX2Digits(),
        rhoX2: this.rhoX2(),
        targetCenterYDigits: this.targetCenterYDigits(),
        targetRhoY: this.targetRhoY()
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

  readonly parsedCenterX1 = computed<Rational>(() => {
    try {
      return parseDigitSequence(this.centerX1Digits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedCenterX2 = computed<Rational>(() => {
    try {
      return parseDigitSequence(this.centerX2Digits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedTargetCenterY = computed<Rational>(() => {
    try {
      return parseDigitSequence(this.targetCenterYDigits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedError = computed<string | null>(() => {
    try {
      parseDigitSequence(this.centerX1Digits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
      parseDigitSequence(this.centerX2Digits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
      parseDigitSequence(this.targetCenterYDigits(), BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
      return null;
    } catch (e: any) {
      return `Invalid digit sequence: ${e.message ?? 'Unknown error'}`;
    }
  });
}
