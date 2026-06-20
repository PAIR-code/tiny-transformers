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

import { Component, ChangeDetectionStrategy, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import {
  Rational,
  parseDigitSequence,
  truncateToTreeRange,
  formatDigitSequence,
  add,
  getAlignedDigits
} from '../../lib/berkovich/berkovich';

import { BerkovichAdditionConfigComponent } from './config-card/berkovich-addition-config.component';
import { BerkovichAdditionDigitsComponent, AdditionDigitRow } from './digits-card/berkovich-addition-digits.component';
import { BerkovichMultiTreeVisComponent, TrackedNode } from './tree-vis/berkovich-multi-tree-vis.component';

@Component({
  selector: 'app-berkovich-addition-vis',
  templateUrl: './berkovich-addition-vis.component.html',
  styleUrls: ['./berkovich-addition-vis.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    RouterModule,
    BerkovichAdditionConfigComponent,
    BerkovichAdditionDigitsComponent,
    BerkovichMultiTreeVisComponent
  ]
})
export class BerkovichAdditionVisComponent {
  readonly prime = signal<number>(3);

  
  // Inputs
  readonly centerAInput = signal<string>('12.20');
  readonly rhoAInput = signal<string>('-1.0');
  
  readonly centerBInput = signal<string>('02.20');
  readonly rhoBInput = signal<string>('-2.0');

  // Parsed State
  readonly centerA = computed<Rational>(() => {
    try {
      return truncateToTreeRange(parseDigitSequence(this.centerAInput(), BigInt(this.prime())), BigInt(this.prime()), -2, 1);
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly rhoA = computed<number>(() => {
    const v = parseFloat(this.rhoAInput());
    return isNaN(v) ? 0.0 : Math.max(-2, Math.min(2, v));
  });

  readonly centerB = computed<Rational>(() => {
    try {
      return truncateToTreeRange(parseDigitSequence(this.centerBInput(), BigInt(this.prime())), BigInt(this.prime()), -2, 1);
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly rhoB = computed<number>(() => {
    const v = parseFloat(this.rhoBInput());
    return isNaN(v) ? 0.0 : Math.max(-2, Math.min(2, v));
  });

  // Output State
  readonly centerC = computed<Rational>(() => {
    return add(this.centerA(), this.centerB());
  });

  readonly rhoC = computed<number>(() => {
    return Math.max(this.rhoA(), this.rhoB());
  });

  // Multi-tree Nodes
  readonly trackedNodes = computed<TrackedNode[]>(() => {
    return [
      { id: 'X', center: this.centerA(), rho: this.rhoA(), color: '#60a5fa', label: 'x_ρ' },
      { id: 'Y', center: this.centerB(), rho: this.rhoB(), color: '#f472b6', label: 'y_ρ' },
      { id: 'X+Y', center: this.centerC(), rho: this.rhoC(), color: '#a78bfa', label: '(x+y)_ρ = max(x_ρ, y_ρ)' }
    ];
  });

  // Digits Logic
  readonly digitRows = computed<AdditionDigitRow[]>(() => {
    const p = BigInt(this.prime());
    const cA = this.centerA();
    const cB = this.centerB();
    const cC = this.centerC();
    
    const rA = this.rhoA();
    const rB = this.rhoB();
    const rC = this.rhoC();
    
    const minP = -2;
    const maxP = 2;
    
    const digitsA = getAlignedDigits(cA, p, minP, maxP);
    const digitsB = getAlignedDigits(cB, p, minP, maxP);
    const digitsC = getAlignedDigits(cC, p, minP, maxP);
    
    const rows: AdditionDigitRow[] = [];
    
    // We compute carries from minPower upwards
    let incomingCarry = 0;
    
    // To handle carries coming from below minP, we just check if A_minP + B_minP != C_minP.
    // A better way is to see if cA + cB has lower digits, but since we truncate inputs to minP=-2,
    // incoming carry at minP should be 0.
    
    for (let i = 0; i < digitsA.length; i++) {
      const k = digitsA[i].power;
      const dA = digitsA[i].digit;
      const dB = digitsB[i].digit;
      const dC = digitsC[i].digit;
      
      const isResolvedA = k < -rA;
      const isResolvedB = k < -rB;
      const isResolvedC = k < -rC;
      
      // Calculate carry out
      // (dA + dB + incomingCarry) = dC + p * carryOut
      const sum = dA + dB + incomingCarry;
      const carryOut = Math.floor(sum / Number(p));
      
      let powerLabel = `p^${k}`;
      if (k === 0) powerLabel = '1';
      else if (k === 1) powerLabel = 'p';
      else if (k === -1) powerLabel = '1/p';

      rows.push({
        power: k,
        powerLabel,
        digitA: dA,
        digitB: dB,
        digitC: dC,
        isResolvedA,
        isResolvedB,
        isResolvedC,
        isCarryOut: carryOut > 0
      });
      
      incomingCarry = carryOut;
    }
    
    // Reverse so highest power is at the top
    return rows.reverse();
  });

  // Handlers
  onPrimeChange(p: number) { this.prime.set(p); }
  
  onCenterABlur() { this.centerAInput.set(formatDigitSequence(this.centerA(), BigInt(this.prime()))); }
  onCenterBBlur() { this.centerBInput.set(formatDigitSequence(this.centerB(), BigInt(this.prime()))); }
  
  onRhoABlur() { this.rhoAInput.set(this.rhoA().toFixed(2)); }
  onRhoBBlur() { this.rhoBInput.set(this.rhoB().toFixed(2)); }
  
  onRandomize() {
    const p = this.prime();
    const randomDigits = () => {
      const d1 = Math.floor(Math.random() * p).toString();
      const d0 = Math.floor(Math.random() * p).toString();
      const dm1 = Math.floor(Math.random() * p).toString();
      const dm2 = Math.floor(Math.random() * p).toString();
      return `${d1}${d0}.${dm1}${dm2}`;
    };
    const randomRho = () => (Math.random() * 3 - 1.5).toFixed(1);

    this.centerAInput.set(randomDigits());
    this.centerBInput.set(randomDigits());
    this.rhoAInput.set(randomRho());
    this.rhoBInput.set(randomRho());
  }
}
