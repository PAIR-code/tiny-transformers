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
import { RouterLink, RouterLinkActive, Router, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { PadicLinearModelInspectorComponent } from '../berkovich-space-explorers/inspector-components/padic-linear-model-inspector.component';
import { Rational, parseToRational, formatRational, formatDigitSequence, parseDigitSequence } from '../../../lib/berkovich/berkovich';
import { PadicLinearCharLearner } from '../berkovich-space-explorers/models/padic-linear-char-learner';
import { BerkovichDisk } from '../berkovich-space-explorers/models/berkovich-char-learner';
import { stringifyState, parseState } from './url-serializer';

@Component({
  selector: 'app-padic-linear-model-inspector-tool',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    PadicLinearModelInspectorComponent
  ],
  template: `
    <div class="berkovich-explorer">
      <!-- Header Banner -->
      <header class="explorer-header">
        <div class="header-content">
          <button mat-icon-button routerLink="/berkovich/vis-tools" class="back-btn" aria-label="Go back to vis tools">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div>
            <h1>Matrix &amp; Addition Parameter Grid Sandbox</h1>
            <p class="subtitle">
              Inspect and configure weight matrix (M) and bias vector (B) parameters for p-adic linear transformations.
            </p>
          </div>
        </div>
        <nav class="header-nav">
          <a routerLink="/berkovich/point" routerLinkActive="active-nav">Point SGD</a>
          <a routerLink="/berkovich/disk" routerLinkActive="active-nav">Disk SGD</a>
          <a routerLink="/berkovich/unary-gradients" routerLinkActive="active-nav">Unary Op Gradients</a>
          <a routerLink="/berkovich/operator-gradients" routerLinkActive="active-nav">Binary Op Gradients</a>
          <a routerLink="/berkovich/space-explorers" routerLinkActive="active-nav">Shakespeare Predictor</a>
          <a routerLink="/berkovich/glossary" routerLinkActive="active-nav">Glossary</a>
          <a routerLink="/berkovich/vis-tools" routerLinkActive="active-nav">Vis Tools</a>
        </nav>
      </header>

      <div class="dashboard-grid">
        <!-- Preview Panel -->
        <section class="visualizer-card-container" style="display: flex; flex-direction: column; gap: 16px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0; color: #0f172a; display: flex; align-items: center; gap: 8px;">
            <mat-icon style="color: #3b82f6;">visibility</mat-icon>
            Component Live Preview
          </h2>
          
          <div style="flex-grow: 1; min-height: 300px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; overflow: auto;">
            <app-padic-linear-model-inspector
              [model]="castedModel()"
              [dimensions]="dimensions()"
              [prime]="prime()"
              [digitsLeft]="digitsLeft()"
              [digitsRight]="digitsRight()"
              [mode]="mode()"
            />
          </div>
        </section>

        <!-- Controls Sidepanel -->
        <aside class="control-panel" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0; color: #0f172a; display: flex; align-items: center; gap: 8px;">
            <mat-icon style="color: #6366f1;">settings</mat-icon>
            Configuration
          </h2>

          <div style="display: flex; flex-direction: column; gap: 16px;">
            <!-- Dimensions -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Dimensions Count</mat-label>
              <mat-select [value]="dimCount()" (selectionChange)="onDimCountChange($event.value)">
                <mat-option [value]="1">1D</mat-option>
                <mat-option [value]="2">2D</mat-option>
                <mat-option [value]="3">3D</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- Prime -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Base Prime (p)</mat-label>
              <mat-select [value]="prime()" (selectionChange)="prime.set($event.value)">
                <mat-option [value]="2">2</mat-option>
                <mat-option [value]="3">3</mat-option>
                <mat-option [value]="5">5</mat-option>
                <mat-option [value]="7">7</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- Mode Selector -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Display Mode</mat-label>
              <mat-select [value]="mode()" (selectionChange)="mode.set($event.value)">
                <mat-option value="both">Both M and B</mat-option>
                <mat-option value="M">Weight Matrix (M) only</mat-option>
                <mat-option value="B">Bias Vector (B) only</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- Precision bounds -->
            <div style="display: flex; gap: 12px;">
              <mat-form-field appearance="outline" style="flex: 1;">
                <mat-label>Digits Left</mat-label>
                <input matInput type="number" [ngModel]="digitsLeft()" (ngModelChange)="digitsLeft.set($event)">
              </mat-form-field>

              <mat-form-field appearance="outline" style="flex: 1;">
                <mat-label>Digits Right</mat-label>
                <input matInput type="number" [ngModel]="digitsRight()" (ngModelChange)="digitsRight.set($event)">
              </mat-form-field>
            </div>

            <!-- Parameters Editor Table -->
            <details style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;">
              <summary style="font-size: 13px; font-weight: 600; cursor: pointer; color: #475569; user-select: none;">
                Edit Weight Matrix (M) &amp; Bias (B) Values
              </summary>
              <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px; max-height: 250px; overflow-y: auto; padding-right: 4px;">
                 <!-- Matrix M values -->
                 <div style="font-weight: 700; font-size: 11px; color: #1e3a8a;">Matrix M elements:</div>
                 @for (r of dimensions(); track r) {
                   @for (c of dimensions(); track c) {
                     <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px; font-size: 11px; flex-wrap: wrap;">
                       <span style="min-width: 80px; font-weight: 600;">M[{{ r }}][{{ c }}]:</span>
                       <input type="text" [ngModel]="getMStr(r, c)" (ngModelChange)="updateM(r, c, $event)" style="width: 55px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 4px;">
                       <span style="color: #94a3b8; font-size: 10px;">({{ formatRational(getMRaw(r, c)) }})</span>
                     </div>
                   }
                 }
 
                 <!-- Bias B values -->
                 <div style="font-weight: 700; font-size: 11px; color: #1e3a8a; margin-top: 8px;">Bias Vector B elements:</div>
                 @for (r of dimensions(); track r) {
                   <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px; font-size: 11px; flex-wrap: wrap;">
                     <span style="min-width: 80px; font-weight: 600;">B[{{ r }}]:</span>
                     <input type="text" [ngModel]="getBStr(r)" (ngModelChange)="updateB(r, $event)" style="width: 55px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 4px;">
                     <span style="color: #94a3b8; font-size: 10px;">({{ formatRational(getBRaw(r)) }})</span>
                   </div>
                 }
              </div>
            </details>
          </div>
        </aside>
      </div>
    </div>
  `,
  styleUrls: ['../berkovich-point-vis/berkovich-point-vis.component.scss']
})
export class PadicLinearModelInspectorToolComponent {
  readonly formatRational = formatRational;
  readonly prime = signal<number>(3);
  readonly dimCount = signal<number>(2);

  constructor() {
    const router = inject(Router);
    const route = inject(ActivatedRoute);

    // Load initial state if present
    const initialStateStr = route.snapshot.queryParams['state'];
    if (initialStateStr) {
      const state = parseState(initialStateStr);
      if (state) {
        if (state.prime !== undefined) this.prime.set(state.prime);
        if (state.dimCount !== undefined) this.dimCount.set(state.dimCount);
        if (state.mode !== undefined) this.mode.set(state.mode);
        if (state.digitsLeft !== undefined) this.digitsLeft.set(state.digitsLeft);
        if (state.digitsRight !== undefined) this.digitsRight.set(state.digitsRight);
        if (state.MStore !== undefined) this.MStore.set(state.MStore);
        if (state.BStore !== undefined) this.BStore.set(state.BStore);
      }
    }

    // Update URL on changes
    effect(() => {
      const state = {
        prime: this.prime(),
        dimCount: this.dimCount(),
        mode: this.mode(),
        digitsLeft: this.digitsLeft(),
        digitsRight: this.digitsRight(),
        MStore: this.MStore(),
        BStore: this.BStore()
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
  readonly mode = signal<'both' | 'M' | 'B'>('both');
  readonly digitsLeft = signal<number>(2);
  readonly digitsRight = signal<number>(2);

  readonly dimensions = computed<number[]>(() => {
    const arr: number[] = [];
    for (let i = 0; i < this.dimCount(); i++) {
      arr.push(i);
    }
    return arr;
  });

  // Storage for Weight Matrix M
  private readonly MStore = signal<{ [key: string]: Rational }>({
    '0-0': { num: 1n, den: 3n },
    '0-1': { num: 2n, den: 3n },
    '1-0': { num: 5n, den: 3n },
    '1-1': { num: 4n, den: 3n }
  });

  // Storage for Bias Vector B
  private readonly BStore = signal<{ [key: string]: Rational }>({
    '0': { num: 1n, den: 1n },
    '1': { num: 2n, den: 3n }
  });

  readonly castedModel = computed<PadicLinearCharLearner>(() => {
    const dimLen = this.dimensions().length;

    const M: BerkovichDisk[][] = [];
    const B: BerkovichDisk[] = [];

    const mStore = this.MStore();
    const bStore = this.BStore();

    for (let i = 0; i < dimLen; i++) {
      const mRow: BerkovichDisk[] = [];
      for (let j = 0; j < dimLen; j++) {
        const key = `${i}-${j}`;
        mRow.push({
          center: mStore[key] ?? { num: 0n, den: 1n },
          rho: -1.0
        });
      }
      M.push(mRow);

      const bKey = `${i}`;
      B.push({
        center: bStore[bKey] ?? { num: 0n, den: 1n },
        rho: -1.0
      });
    }

    return { M, B } as any as PadicLinearCharLearner;
  });

  getMRaw(r: number, c: number): Rational {
    const key = `${r}-${c}`;
    return this.MStore()[key] ?? { num: 0n, den: 1n };
  }

  getBRaw(r: number): Rational {
    const key = `${r}`;
    return this.BStore()[key] ?? { num: 0n, den: 1n };
  }

  getMStr(r: number, c: number): string {
    const key = `${r}-${c}`;
    const rational = this.MStore()[key];
    if (!rational) return formatDigitSequence({ num: 0n, den: 1n }, BigInt(this.prime()), { minPower: -this.digitsRight(), maxPower: this.digitsLeft() - 1 });
    return formatDigitSequence(rational, BigInt(this.prime()), { minPower: -this.digitsRight(), maxPower: this.digitsLeft() - 1 });
  }

  updateM(r: number, c: number, valStr: string) {
    try {
      const val = parseDigitSequence(valStr, BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
      const key = `${r}-${c}`;
      this.MStore.update(m => ({ ...m, [key]: val }));
    } catch {}
  }

  getBStr(r: number): string {
    const key = `${r}`;
    const rational = this.BStore()[key];
    if (!rational) return formatDigitSequence({ num: 0n, den: 1n }, BigInt(this.prime()), { minPower: -this.digitsRight(), maxPower: this.digitsLeft() - 1 });
    return formatDigitSequence(rational, BigInt(this.prime()), { minPower: -this.digitsRight(), maxPower: this.digitsLeft() - 1 });
  }

  updateB(r: number, valStr: string) {
    try {
      const val = parseDigitSequence(valStr, BigInt(this.prime()), {
        minPower: -this.digitsRight(),
        maxPower: this.digitsLeft() - 1
      });
      const key = `${r}`;
      this.BStore.update(m => ({ ...m, [key]: val }));
    } catch {}
  }

  onDimCountChange(newCount: number) {
    this.dimCount.set(newCount);
  }
}
