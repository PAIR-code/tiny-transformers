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

import { Component, signal, computed, ChangeDetectionStrategy, effect, untracked, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, Router, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { BerkovichTreeVisComponent } from '../berkovich-point-vis/tree-vis/berkovich-tree-vis.component';
import {
  Rational,
  parseToRational,
  formatRational,
  getValuation,
  subtract,
  extNegate,
  formatDigitSequence,
  parseDigitSequence
} from '../../../lib/berkovich/berkovich';
import { computeGradientDetails, GradientDetails } from '../../../lib/berkovich/berkovich_gradients';
import { stringifyState, parseState } from './url-serializer';

@Component({
  selector: 'app-tree-vis-tool',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatSliderModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    BerkovichTreeVisComponent
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
            <h1>Berkovich Tree Vis Sandbox</h1>
            <p class="subtitle">
              Configure and test the tree visualizer, illustrating branches, paths, and gradient flows.
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
          <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; min-height: 480px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; overflow: auto; padding: 16px;">
            @if (parsedCenterError() || parsedTargetError()) {
              <div style="color: #ef4444; font-size: 14px; text-align: center;">
                <mat-icon style="font-size: 48px; width: 48px; height: 48px; margin-bottom: 8px;">error_outline</mat-icon>
                @if (parsedCenterError()) {
                  <div><strong>Center Error:</strong> {{ parsedCenterError() }}</div>
                }
                @if (parsedTargetError()) {
                  <div><strong>Target Error:</strong> {{ parsedTargetError() }}</div>
                }
              </div>
            } @else {
              <app-berkovich-tree-vis
                [prime]="prime()"
                [targetRational]="parsedTarget()"
                [targetLogRadius]="hasTargetLogRadius() ? targetLogRadius() : undefined"
                [targetDigitsInput]="targetDigitsInput()"
                [currentCenter]="parsedCenter()"
                [centerDigitsInput]="centerDigitsInput()"
                [currentLogRadius]="rho()"
                [isDraggingRho]="isDragging()"
                [gradientBreakdown]="gradientBreakdown()"
                [currentDistanceValuation]="currentDistanceValuation()"
                [showNodeComputations]="showNodeComputations()"
                
                (logRadiusChange)="onLogRadiusChange($event)"
                (draggingChange)="isDragging.set($event)"
                (targetDigitsInputChange)="onTargetDigitsChange($event)"
                (centerDigitsInputChange)="onCenterDigitsChange($event)"
                (targetDigitsBlur)="onTargetDigitsBlur()"
                (centerDigitsBlur)="onCenterDigitsBlur()"
                (showNodeComputationsChange)="showNodeComputations.set($event)"
              />
            }
          </div>
        </section>

        <!-- Controls Sidepanel -->
        <aside class="control-panel" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0; color: #0f172a; display: flex; align-items: center; gap: 8px;">
            <mat-icon style="color: #6366f1;">settings</mat-icon>
            Configuration
          </h2>

          <div style="display: flex; flex-direction: column; gap: 16px;">
            <!-- Presets -->
            <div>
              <label style="font-weight: 600; font-size: 12px; color: #475569; display: block; margin-bottom: 6px;">Presets</label>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                @for (preset of presets; track preset.name) {
                  <button mat-stroked-button (click)="applyPreset(preset)" style="font-size: 11px; height: 32px; padding: 0 10px;">
                    {{ preset.name }}
                  </button>
                }
              </div>
            </div>

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

            <!-- Target Center -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Target Center Digit String (rational: {{ formatRational(parsedTarget()) }})</mat-label>
              <input matInput [ngModel]="targetDigitsInput()" (ngModelChange)="targetDigitsInput.set($event)">
              @if (parsedTargetError()) {
                <mat-error>{{ parsedTargetError() }}</mat-error>
              }
            </mat-form-field>

            <!-- Target Log Radius -->
            <fieldset style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
              <legend style="font-size: 11px; font-weight: 700; color: #475569; padding: 0 4px;">Target Disk Radius</legend>
              <mat-checkbox [checked]="hasTargetLogRadius()" (change)="hasTargetLogRadius.set($event.checked)" style="font-size: 13px;">
                Specify Target Log-Radius (y_rho)
              </mat-checkbox>
              @if (hasTargetLogRadius()) {
                <div>
                  <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; margin-bottom: 2px;">
                    <span>Target Log-Radius</span>
                    <span style="font-weight: 700; color: #ef4444;">{{ targetLogRadius().toFixed(1) }}</span>
                  </div>
                  <mat-slider min="-2" max="1" step="0.1" style="width: 100%;">
                    <input matSliderThumb [ngModel]="targetLogRadius()" (ngModelChange)="targetLogRadius.set($event)">
                  </mat-slider>
                </div>
              }
            </fieldset>

            <!-- Current Center -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Current Center Digit String (rational: {{ formatRational(parsedCenter()) }})</mat-label>
              <input matInput [ngModel]="centerDigitsInput()" (ngModelChange)="centerDigitsInput.set($event)">
              @if (parsedCenterError()) {
                <mat-error>{{ parsedCenterError() }}</mat-error>
              }
            </mat-form-field>

            <!-- Current Rho -->
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; margin-bottom: 4px;">
                <span>Current Log-Radius (x_rho)</span>
                <span style="font-weight: 700; color: #3b82f6;">{{ rho().toFixed(2) }}</span>
              </div>
              <mat-slider min="-2" max="2" step="0.1" style="width: 100%;">
                <input matSliderThumb [ngModel]="rho()" (ngModelChange)="rho.set($event)">
              </mat-slider>
            </div>

            <!-- Interactivity options -->
            <mat-checkbox [checked]="showNodeComputations()" (change)="showNodeComputations.set($event.checked)">
              Show Node Computation Labels
            </mat-checkbox>

            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 4px 0;">

            <!-- Manual Step Button -->
            <button mat-flat-button color="primary" (click)="stepSGD()" [disabled]="parsedCenterError() !== null || parsedTargetError() !== null" style="width: 100%; height: 40px; font-weight: 600;">
              <mat-icon>play_arrow</mat-icon>
              Simulate 1 SGD Step
            </button>
          </div>
        </aside>
      </div>
    </div>
  `,
  styleUrls: ['../berkovich-point-vis/berkovich-point-vis.component.scss']
})
export class TreeVisToolComponent {
  readonly formatRational = formatRational;
  readonly prime = signal<number>(3);
  readonly hasTargetLogRadius = signal<boolean>(false);
  readonly targetLogRadius = signal<number>(-1.0);
  readonly rho = signal<number>(0.5);
  readonly isDragging = signal<boolean>(false);
  readonly showNodeComputations = signal<boolean>(true);
  readonly learningRate = signal<number>(0.2);

  // Derived digits display inputs (now directly bound to form)
  readonly targetDigitsInput = signal<string>('01.20');
  readonly centerDigitsInput = signal<string>('00.12');

  constructor() {
    const router = inject(Router);
    const route = inject(ActivatedRoute);

    // Load initial state if present
    const initialStateStr = route.snapshot.queryParams['state'];
    if (initialStateStr) {
      const state = parseState(initialStateStr);
      if (state) {
        if (state.prime !== undefined) this.prime.set(state.prime);
        if (state.targetDigitsInput !== undefined) this.targetDigitsInput.set(state.targetDigitsInput);
        if (state.hasTargetLogRadius !== undefined) this.hasTargetLogRadius.set(state.hasTargetLogRadius);
        if (state.targetLogRadius !== undefined) this.targetLogRadius.set(state.targetLogRadius);
        if (state.centerDigitsInput !== undefined) this.centerDigitsInput.set(state.centerDigitsInput);
        if (state.rho !== undefined) this.rho.set(state.rho);
        if (state.showNodeComputations !== undefined) this.showNodeComputations.set(state.showNodeComputations);
        if (state.learningRate !== undefined) this.learningRate.set(state.learningRate);
      }
    }

    // Update URL on changes
    effect(() => {
      const state = {
        prime: this.prime(),
        targetDigitsInput: this.targetDigitsInput(),
        hasTargetLogRadius: this.hasTargetLogRadius(),
        targetLogRadius: this.targetLogRadius(),
        centerDigitsInput: this.centerDigitsInput(),
        rho: this.rho(),
        showNodeComputations: this.showNodeComputations(),
        learningRate: this.learningRate()
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

  readonly parsedTarget = computed<Rational>(() => {
    try {
      return parseDigitSequence(this.targetDigitsInput(), BigInt(this.prime()), { minPower: -2, maxPower: 1 });
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedCenter = computed<Rational>(() => {
    try {
      return parseDigitSequence(this.centerDigitsInput(), BigInt(this.prime()), { minPower: -2, maxPower: 1 });
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedTargetError = computed<string | null>(() => {
    try {
      parseDigitSequence(this.targetDigitsInput(), BigInt(this.prime()), { minPower: -2, maxPower: 1 });
      return null;
    } catch (e: any) {
      return `Invalid target sequence: ${e.message ?? 'Unknown error'}`;
    }
  });

  readonly parsedCenterError = computed<string | null>(() => {
    try {
      parseDigitSequence(this.centerDigitsInput(), BigInt(this.prime()), { minPower: -2, maxPower: 1 });
      return null;
    } catch (e: any) {
      return `Invalid center sequence: ${e.message ?? 'Unknown error'}`;
    }
  });

  readonly currentDistanceValuation = computed(() => {
    const p = BigInt(this.prime());
    const c = this.parsedCenter();
    const y = this.parsedTarget();
    const diff = subtract(c, y);
    return getValuation(diff, p);
  });

  readonly gradientBreakdown = computed<GradientDetails>(() => {
    const p = BigInt(this.prime());
    const c = this.parsedCenter();
    const rho = this.rho();
    const y = this.parsedTarget();
    const y_rho = this.hasTargetLogRadius() ? this.targetLogRadius() : -2.0;
    const eta = this.learningRate();

    return computeGradientDetails(c, rho, y, y_rho, p, eta);
  });

  onLogRadiusChange(newRho: number) {
    this.rho.set(Math.round(newRho * 100) / 100);
  }

  onTargetDigitsChange(val: string) {
    this.targetDigitsInput.set(val);
  }

  onCenterDigitsChange(val: string) {
    this.centerDigitsInput.set(val);
  }

  onTargetDigitsBlur() {
    const p = BigInt(this.prime());
    try {
      const parsed = parseDigitSequence(this.targetDigitsInput(), p, { minPower: -2, maxPower: 1 });
      this.targetDigitsInput.set(formatDigitSequence(parsed, p, { minPower: -2, maxPower: 1 }));
    } catch {
      this.targetDigitsInput.set('00.00');
    }
  }

  onCenterDigitsBlur() {
    const p = BigInt(this.prime());
    try {
      const parsed = parseDigitSequence(this.centerDigitsInput(), p, { minPower: -2, maxPower: 1 });
      this.centerDigitsInput.set(formatDigitSequence(parsed, p, { minPower: -2, maxPower: 1 }));
    } catch {
      this.centerDigitsInput.set('00.00');
    }
  }

  stepSGD() {
    const details = this.gradientBreakdown();
    const p = BigInt(this.prime());
    const seq = formatDigitSequence(details.nextCenter, p, { minPower: -2, maxPower: 1 });
    this.centerDigitsInput.set(seq);
    this.rho.set(details.nextLogRadius);
  }

  readonly presets = [
    { name: 'Branch Point (p=3)', prime: 3, target: '5/3', center: '3/5', rho: 0.5, hasRadius: false, radius: -1.0 },
    { name: 'Target Disk (p=5)', prime: 5, target: '12', center: '10', rho: -0.5, hasRadius: true, radius: -1.5 },
    { name: 'Far Center (p=2)', prime: 2, target: '-1.25', center: '1.25', rho: 1.0, hasRadius: false, radius: -1.0 }
  ];

  applyPreset(preset: typeof this.presets[0]) {
    this.prime.set(preset.prime);
    const p = BigInt(preset.prime);
    try {
      const ratTgt = parseToRational(preset.target);
      this.targetDigitsInput.set(formatDigitSequence(ratTgt, p, { minPower: -2, maxPower: 1 }));
    } catch {
      this.targetDigitsInput.set('00.00');
    }
    try {
      const ratCtr = parseToRational(preset.center);
      this.centerDigitsInput.set(formatDigitSequence(ratCtr, p, { minPower: -2, maxPower: 1 }));
    } catch {
      this.centerDigitsInput.set('00.00');
    }
    this.rho.set(preset.rho);
    this.hasTargetLogRadius.set(preset.hasRadius);
    this.targetLogRadius.set(preset.radius);
  }
}
