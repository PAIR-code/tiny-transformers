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

import { Component, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { BerkovichDualDigitDisplayComponent } from '../berkovich-dual-digit-display/berkovich-dual-digit-display.component';
import { Rational, parseToRational, formatRational } from '../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-dual-digit-display-tool',
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
    BerkovichDualDigitDisplayComponent
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
            <h1>Dual Digit Display Sandbox</h1>
            <p class="subtitle">
              Compare and align two $p$-adic rational expansions to see LCA branching and matching digit regions.
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
          <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; min-height: 250px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px;">
            @if (parsedXError() || parsedYError()) {
              <div style="color: #ef4444; font-size: 14px; text-align: center;">
                <mat-icon style="font-size: 48px; width: 48px; height: 48px; margin-bottom: 8px;">error_outline</mat-icon>
                @if (parsedXError()) {
                  <div><strong>X Error:</strong> {{ parsedXError() }}</div>
                }
                @if (parsedYError()) {
                  <div><strong>Y Error:</strong> {{ parsedYError() }}</div>
                }
              </div>
            } @else {
              <app-berkovich-dual-digit-display
                [prime]="prime()"
                [xCenter]="parsedXCenter()"
                [xRho]="xRho()"
                [yCenter]="parsedYCenter()"
                [yRho]="hasYRho() ? yRho() : undefined"
                [digitsLeft]="digitsLeft()"
                [digitsRight]="digitsRight()"
                [size]="size()"
              />
            }
          </div>

          <div style="background: #f1f5f9; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 13px; color: #334155;">
            <div><strong>Component Tag:</strong></div>
            <pre style="margin: 4px 0 0 0; white-space: pre-wrap; font-size: 12px; color: #0f766e;">&lt;app-berkovich-dual-digit-display
  [prime]="{{ prime() }}"
  [xCenter]="&#123; num: {{ parsedXCenter().num }}n, den: {{ parsedXCenter().den }}n &#125;"
  [xRho]="{{ xRho() }}"
  [yCenter]="&#123; num: {{ parsedYCenter().num }}n, den: {{ parsedYCenter().den }}n &#125;"
  [yRho]="{{ hasYRho() ? yRho() : 'undefined' }}"
  [digitsLeft]="{{ digitsLeft() }}"
  [digitsRight]="{{ digitsRight() }}"
  [size]="'{{ size() }}'"
/&gt;</pre>
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
                  <button mat-stroked-button (click)="applyPreset(preset)" style="font-size: 12px; height: 32px; padding: 0 10px;">
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
                <mat-option [value]="11">11</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- X Configuration Group -->
            <fieldset style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
              <legend style="font-size: 12px; font-weight: 700; color: #1e3a8a; padding: 0 4px;">X Parameter (Top Row)</legend>
              <mat-form-field appearance="outline" style="width: 100%; margin-bottom: 0;">
                <mat-label>X Center Rational (e.g. 5/3)</mat-label>
                <input matInput [ngModel]="rawXCenter()" (ngModelChange)="rawXCenter.set($event)">
              </mat-form-field>
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; margin-bottom: 2px;">
                  <span>X Log-Radius (rho)</span>
                  <span style="font-weight: 700; color: #3b82f6;">{{ xRho().toFixed(1) }}</span>
                </div>
                <mat-slider min="-2" max="2" step="0.1" style="width: 100%;">
                  <input matSliderThumb [ngModel]="xRho()" (ngModelChange)="xRho.set($event)">
                </mat-slider>
              </div>
            </fieldset>

            <!-- Y Configuration Group -->
            <fieldset style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
              <legend style="font-size: 12px; font-weight: 700; color: #b91c1c; padding: 0 4px;">Y Parameter (Bottom Row)</legend>
              <mat-form-field appearance="outline" style="width: 100%; margin-bottom: 0;">
                <mat-label>Y Center Rational (e.g. 1/9)</mat-label>
                <input matInput [ngModel]="rawYCenter()" (ngModelChange)="rawYCenter.set($event)">
              </mat-form-field>
              <mat-checkbox [checked]="hasYRho()" (change)="hasYRho.set($event.checked)" style="font-size: 13px;">
                Specify Y Log-Radius (yRho)
              </mat-checkbox>
              @if (hasYRho()) {
                <div>
                  <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; margin-bottom: 2px;">
                    <span>Y Log-Radius (rho)</span>
                    <span style="font-weight: 700; color: #ef4444;">{{ yRho().toFixed(1) }}</span>
                  </div>
                  <mat-slider min="-2" max="2" step="0.1" style="width: 100%;">
                    <input matSliderThumb [ngModel]="yRho()" (ngModelChange)="yRho.set($event)">
                  </mat-slider>
                </div>
              }
            </fieldset>

            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 4px 0;">

            <!-- Formatting -->
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

            <!-- Size Category -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Size Category</mat-label>
              <mat-select [value]="size()" (selectionChange)="size.set($event.value)">
                <mat-option value="small">Small</mat-option>
                <mat-option value="medium">Medium</mat-option>
                <mat-option value="large">Large</mat-option>
              </mat-select>
            </mat-form-field>
          </div>
        </aside>
      </div>
    </div>
  `,
  styleUrls: ['../berkovich-point-vis/berkovich-point-vis.component.scss']
})
export class DualDigitDisplayToolComponent {
  readonly prime = signal<number>(3);
  readonly rawXCenter = signal<string>('5/3');
  readonly xRho = signal<number>(0.0);
  readonly rawYCenter = signal<string>('1/9');
  readonly yRho = signal<number>(-1.0);
  readonly hasYRho = signal<boolean>(true);

  readonly digitsLeft = signal<number>(3);
  readonly digitsRight = signal<number>(3);
  readonly size = signal<'small' | 'medium' | 'large'>('medium');

  readonly parsedXCenter = computed<Rational>(() => {
    try {
      return parseToRational(this.rawXCenter());
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedYCenter = computed<Rational>(() => {
    try {
      return parseToRational(this.rawYCenter());
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedXError = computed<string | null>(() => {
    try {
      parseToRational(this.rawXCenter());
      return null;
    } catch (e: any) {
      return e.message ?? 'Invalid format';
    }
  });

  readonly parsedYError = computed<string | null>(() => {
    try {
      parseToRational(this.rawYCenter());
      return null;
    } catch (e: any) {
      return e.message ?? 'Invalid format';
    }
  });

  readonly presets = [
    { name: '5/3 vs 1/9 (p=3)', prime: 3, xCenter: '5/3', xRho: 0.0, yCenter: '1/9', yRho: -1.0, hasYRho: true },
    { name: '12 vs 10 (p=5)', prime: 5, xCenter: '12', xRho: -1.0, yCenter: '10', yRho: -2.0, hasYRho: true },
    { name: '-1 vs 1 (p=2)', prime: 2, xCenter: '-1', xRho: 0.5, yCenter: '1', yRho: 0.5, hasYRho: false },
  ];

  applyPreset(preset: typeof this.presets[0]) {
    this.prime.set(preset.prime);
    this.rawXCenter.set(preset.xCenter);
    this.xRho.set(preset.xRho);
    this.rawYCenter.set(preset.yCenter);
    this.yRho.set(preset.yRho);
    this.hasYRho.set(preset.hasYRho);
  }
}
