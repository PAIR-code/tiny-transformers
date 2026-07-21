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
  TrackedNode,
  EditableNodeInputs
} from '../berkovich-operator-gradients-vis/tree-vis/berkovich-multi-tree-vis.component';

import {
  Rational,
  parseToRational,
  formatRational,
  parseDigitSequence,
  truncateToTreeRange,
  formatDigitSequence,
  subtract,
  getValuation
} from '../../../lib/berkovich/berkovich';
import {
  BerkovichPoint,
  AdditionOperator,
  MultiplicationOperator,
  VertexResolutionMethod
} from '../../../lib/berkovich/berkovich_gradients';
import { stringifyState, parseState } from './url-serializer';
import { MatOptionModule } from '@angular/material/core';
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
    MatOptionModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    BerkovichMultiTreeVisComponent,
    BerkovichHeaderComponent
  ]
})
export class OperatorTreeVisToolComponent {
  readonly prime = signal<number>(3);
  readonly operator = signal<BerkovichBinaryOperator>('addition');

  readonly centerX1Digits = signal<string>('12.20');
  readonly rhoX1 = signal<number>(0.0);

  readonly centerX2Digits = signal<string>('02.20');
  readonly rhoX2 = signal<number>(-1.0);

  readonly targetCenterYDigits = signal<string>('00.00');
  readonly targetRhoY = signal<number>(-2.0);

  readonly lr = signal<number>(0.2);
  readonly vertexResolution = signal<VertexResolutionMethod>('exact-per-coord');

  readonly digitsLeft = signal<number>(3);
  readonly digitsRight = signal<number>(3);

  readonly isPlaying = signal<boolean>(false);
  readonly canUndo = signal<boolean>(false);

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

  readonly parsedCenterX1 = computed<Rational>(() => this.parseParam(this.centerX1Digits()));
  readonly parsedCenterX2 = computed<Rational>(() => this.parseParam(this.centerX2Digits()));
  readonly parsedTargetCenterY = computed<Rational>(() => this.parseParam(this.targetCenterYDigits()));

  private parseParam(s: string): Rational {
    try {
      return truncateToTreeRange(
        parseDigitSequence(s, BigInt(this.prime())),
        BigInt(this.prime()), -2, 1
      );
    } catch {
      return { num: 0n, den: 1n };
    }
  }

  readonly parsedError = computed<string | null>(() => {
    try {
      parseDigitSequence(this.centerX1Digits(), BigInt(this.prime()));
      parseDigitSequence(this.centerX2Digits(), BigInt(this.prime()));
      parseDigitSequence(this.targetCenterYDigits(), BigInt(this.prime()));
      return null;
    } catch (e: any) {
      return `Invalid digit sequence: ${e.message ?? 'Unknown error'}`;
    }
  });

  readonly stepDetails = computed(() => {
    const op = this.operator();
    const p = BigInt(this.prime());
    const x1 = new BerkovichPoint(this.parsedCenterX1(), this.rhoX1());
    const x2 = new BerkovichPoint(this.parsedCenterX2(), this.rhoX2());
    const targetY = this.parsedTargetCenterY();

    if (op === 'multiplication') {
      const res = new MultiplicationOperator().step(
        x1,
        x2,
        targetY,
        p,
        this.lr(),
        this.vertexResolution()
      );
      const diff = subtract(res.prod.center, targetY);
      const valDiff = getValuation(diff, p);
      const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
      return {
        nextX1: res.nextX1,
        nextX2: res.nextX2,
        outCenter: truncateToTreeRange(res.prod.center, p, -2, 1),
        outRho: res.prod.rho,
        loss: res.loss,
        drhoX1: res.drhoProd_drhoX1,
        drhoX2: res.drhoProd_drhoX2,
        drOut: res.drProd,
        dY1: d,
        dY2: d
      };
    } else {
      const res = new AdditionOperator().step(
        x1,
        x2,
        targetY,
        p,
        this.lr(),
        this.vertexResolution()
      );
      const diff = subtract(res.sum.center, targetY);
      const valDiff = getValuation(diff, p);
      const d = valDiff.type === 'finite' ? -valDiff.value : -Infinity;
      return {
        nextX1: res.nextX1,
        nextX2: res.nextX2,
        outCenter: truncateToTreeRange(res.sum.center, p, -2, 1),
        outRho: res.sum.rho,
        loss: res.loss,
        drhoX1: res.drhoSum_drhoX1,
        drhoX2: res.drhoSum_drhoX2,
        drOut: res.drSum,
        dY1: d,
        dY2: d
      };
    }
  });

  readonly trackedNodes = computed<TrackedNode[]>(() => {
    const op = this.operator();
    const details = this.stepDetails();

    const labelOut = op === 'multiplication' ? '(x1*x2)_ρ' : '(x1+x2)_ρ';
    const idOut = op === 'multiplication' ? 'X1*X2' : 'X1+X2';
    return [
      { id: 'X1', center: this.parsedCenterX1(), rho: this.rhoX1(), color: '#60a5fa', label: 'x1_ρ' },
      { id: 'X2', center: this.parsedCenterX2(), rho: this.rhoX2(), color: '#f472b6', label: 'x2_ρ' },
      { id: idOut, center: details.outCenter, rho: details.outRho, color: '#a78bfa', label: labelOut },
      { id: 'Y', center: this.parsedTargetCenterY(), rho: -2, color: '#eab308', label: 'y_c (Target)' }
    ];
  });

  readonly editableInputs = computed<EditableNodeInputs[]>(() => {
    const op = this.operator();
    const details = this.stepDetails();
    const idOut = op === 'multiplication' ? 'X1*X2' : 'X1+X2';
    const labelOut = op === 'multiplication' ? 'x₁·x₂' : 'x₁+x₂';

    return [
      {
        nodeId: 'X1',
        trackedNodeId: 'X1',
        centerInput: this.centerX1Digits(),
        rhoInput: this.rhoX1().toFixed(1),
        color: '#2563eb',
        labelPrefix: 'x₁'
      },
      {
        nodeId: 'X2',
        trackedNodeId: 'X2',
        centerInput: this.centerX2Digits(),
        rhoInput: this.rhoX2().toFixed(1),
        color: '#db2777',
        labelPrefix: 'x₂'
      },
      {
        nodeId: idOut,
        trackedNodeId: idOut,
        centerInput: formatDigitSequence(details.outCenter, BigInt(this.prime())),
        rhoInput: details.outRho.toFixed(1),
        color: '#7c3aed',
        labelPrefix: labelOut,
        readonly: true
      },
      {
        nodeId: 'Y',
        trackedNodeId: 'Y',
        centerInput: this.targetCenterYDigits(),
        color: '#d97706',
        labelPrefix: 'y'
      }
    ];
  });

  onInputChange(event: { nodeId: string; field: 'center' | 'rho'; value: string }) {
    const { nodeId, field, value } = event;
    if (nodeId === 'X1') {
      if (field === 'center') this.centerX1Digits.set(value);
      else if (field === 'rho') this.rhoX1.set(parseFloat(value) || 0);
    } else if (nodeId === 'X2') {
      if (field === 'center') this.centerX2Digits.set(value);
      else if (field === 'rho') this.rhoX2.set(parseFloat(value) || 0);
    } else if (nodeId === 'Y') {
      if (field === 'center') this.targetCenterYDigits.set(value);
    }
  }

  onStep() {
    const details = this.stepDetails();
    const p = BigInt(this.prime());
    this.centerX1Digits.set(formatDigitSequence(details.nextX1.center, p));
    this.rhoX1.set(details.nextX1.rho);
    this.centerX2Digits.set(formatDigitSequence(details.nextX2.center, p));
    this.rhoX2.set(details.nextX2.rho);
  }

  onRandomize() {
    const p = BigInt(this.prime());
    const r1 = { num: BigInt(Math.floor(Math.random() * 5)), den: 1n };
    const r2 = { num: BigInt(Math.floor(Math.random() * 5)), den: 1n };
    const ry = { num: BigInt(Math.floor(Math.random() * 5)), den: 1n };
    this.centerX1Digits.set(formatDigitSequence(r1, p));
    this.centerX2Digits.set(formatDigitSequence(r2, p));
    this.targetCenterYDigits.set(formatDigitSequence(ry, p));
    this.rhoX1.set(parseFloat((Math.random() * 2 - 1).toFixed(1)));
    this.rhoX2.set(parseFloat((Math.random() * 2 - 1).toFixed(1)));
  }
}
