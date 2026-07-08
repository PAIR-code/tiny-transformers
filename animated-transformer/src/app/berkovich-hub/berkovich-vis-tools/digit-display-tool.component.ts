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

import { BerkovichDigitDisplayComponent } from '../berkovich-digit-display/berkovich-digit-display.component';
import { Rational, parseToRational, formatRational } from '../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-digit-display-tool',
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
    BerkovichDigitDisplayComponent
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
            <h1>Single Digit Display Sandbox</h1>
            <p class="subtitle">
              Configure and test the single-digit $p$-adic expansion visualizer component.
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
            @if (parsedCenterError()) {
              <div style="color: #ef4444; font-size: 14px; text-align: center;">
                <mat-icon style="font-size: 48px; width: 48px; height: 48px; margin-bottom: 8px;">error_outline</mat-icon>
                <div>{{ parsedCenterError() }}</div>
              </div>
            } @else {
              <app-berkovich-digit-display
                [center]="parsedCenter()"
                [rho]="rho()"
                [prime]="prime()"
                [showRho]="showRho()"
                [digitsLeft]="digitsLeft()"
                [digitsRight]="digitsRight()"
                [size]="size()"
                [cellWidth]="customCellWidth() ? cellWidth() : undefined"
                [cellHeight]="customCellHeight() ? cellHeight() : undefined"
                [cellGap]="customCellGap() ? cellGap() : undefined"
                [outerBoxColor]="outerBoxColor()"
              />
            }
          </div>

          <div style="background: #f1f5f9; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 13px; color: #334155;">
            <div><strong>Component Tag:</strong></div>
            <pre style="margin: 4px 0 0 0; white-space: pre-wrap; font-size: 12px; color: #0f766e;">&lt;app-berkovich-digit-display
  [center]="&#123; num: {{ parsedCenter().num }}n, den: {{ parsedCenter().den }}n &#125;"
  [rho]="{{ rho() }}"
  [prime]="{{ prime() }}"
  [showRho]="{{ showRho() }}"
  [digitsLeft]="{{ digitsLeft() }}"
  [digitsRight]="{{ digitsRight() }}"
  [size]="'{{ size() }}'"
  [outerBoxColor]="'{{ outerBoxColor() }}'"
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
                <mat-option [value]="13">13</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- Center -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Center Rational value (e.g. 5/3, -1.25)</mat-label>
              <input matInput [ngModel]="rawCenter()" (ngModelChange)="rawCenter.set($event)">
              @if (parsedCenterError()) {
                <mat-error>{{ parsedCenterError() }}</mat-error>
              }
            </mat-form-field>

            <!-- Rho -->
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; margin-bottom: 4px;">
                <span>Log-Radius (rho)</span>
                <span style="font-weight: 700; color: #3b82f6;">{{ rho().toFixed(2) }}</span>
              </div>
              <mat-slider min="-3" max="3" step="0.1" style="width: 100%;">
                <input matSliderThumb [ngModel]="rho()" (ngModelChange)="rho.set($event)">
              </mat-slider>
            </div>

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

            <!-- Color picker -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Outer Box Border Color</mat-label>
              <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
                <input matInput [ngModel]="outerBoxColor()" (ngModelChange)="outerBoxColor.set($event)" style="flex-grow: 1;">
                <input type="color" [ngModel]="outerBoxColor()" (ngModelChange)="outerBoxColor.set($event)" style="width: 36px; height: 36px; border: 1px solid #ccc; border-radius: 4px; padding: 0; cursor: pointer;">
              </div>
            </mat-form-field>

            <!-- Show Rho checkbox -->
            <mat-checkbox [checked]="showRho()" (change)="showRho.set($event.checked)">
              Show Rho (Interactive Uncertainty Overlay)
            </mat-checkbox>

            <!-- Custom Sizing Expander -->
            <details style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;">
              <summary style="font-size: 13px; font-weight: 600; cursor: pointer; color: #475569; user-select: none;">
                Advanced Layout & Margins overrides
              </summary>
              <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
                <div style="display: flex; gap: 8px; align-items: center;">
                  <mat-checkbox [checked]="customCellWidth()" (change)="customCellWidth.set($event.checked)"></mat-checkbox>
                  <mat-form-field appearance="outline" style="flex-grow: 1; margin-bottom: 0;">
                    <mat-label>Cell Width (px)</mat-label>
                    <input matInput type="number" [disabled]="!customCellWidth()" [ngModel]="cellWidth()" (ngModelChange)="cellWidth.set($event)">
                  </mat-form-field>
                </div>

                <div style="display: flex; gap: 8px; align-items: center;">
                  <mat-checkbox [checked]="customCellHeight()" (change)="customCellHeight.set($event.checked)"></mat-checkbox>
                  <mat-form-field appearance="outline" style="flex-grow: 1; margin-bottom: 0;">
                    <mat-label>Cell Height (px)</mat-label>
                    <input matInput type="number" [disabled]="!customCellHeight()" [ngModel]="cellHeight()" (ngModelChange)="cellHeight.set($event)">
                  </mat-form-field>
                </div>

                <div style="display: flex; gap: 8px; align-items: center;">
                  <mat-checkbox [checked]="customCellGap()" (change)="customCellGap.set($event.checked)"></mat-checkbox>
                  <mat-form-field appearance="outline" style="flex-grow: 1; margin-bottom: 0;">
                    <mat-label>Cell Gap (px)</mat-label>
                    <input matInput type="number" [disabled]="!customCellGap()" [ngModel]="cellGap()" (ngModelChange)="cellGap.set($event)">
                  </mat-form-field>
                </div>
              </div>
            </details>
          </div>
        </aside>
      </div>
    </div>
  `,
  styleUrls: ['../berkovich-point-vis/berkovich-point-vis.component.scss']
})
export class DigitDisplayToolComponent {
  readonly prime = signal<number>(5);
  readonly rawCenter = signal<string>('3/5');
  readonly rho = signal<number>(0.5);
  readonly showRho = signal<boolean>(true);
  readonly digitsLeft = signal<number>(3);
  readonly digitsRight = signal<number>(3);
  readonly size = signal<'small' | 'medium' | 'large'>('medium');
  readonly outerBoxColor = signal<string>('#3b82f6');

  // Overrides
  readonly customCellWidth = signal<boolean>(false);
  readonly cellWidth = signal<number>(24);
  readonly customCellHeight = signal<boolean>(false);
  readonly cellHeight = signal<number>(32);
  readonly customCellGap = signal<boolean>(false);
  readonly cellGap = signal<number>(6);

  readonly parsedCenter = computed<Rational>(() => {
    try {
      return parseToRational(this.rawCenter());
    } catch {
      return { num: 0n, den: 1n };
    }
  });

  readonly parsedCenterError = computed<string | null>(() => {
    try {
      parseToRational(this.rawCenter());
      return null;
    } catch (e: any) {
      return `Invalid rational number format: ${e.message ?? 'Unknown error'}`;
    }
  });

  readonly presets = [
    { name: '3/5 (p=5)', prime: 5, center: '3/5', rho: 0.5 },
    { name: '12 (p=3)', prime: 3, center: '12', rho: -1.0 },
    { name: '-1.25 (p=2)', prime: 2, center: '-1.25', rho: 0.0 },
    { name: '5/7 (p=7)', prime: 7, center: '5/7', rho: 1.2 },
    { name: '1/9 (p=3)', prime: 3, center: '1/9', rho: 2.0 },
  ];

  applyPreset(preset: typeof this.presets[0]) {
    this.prime.set(preset.prime);
    this.rawCenter.set(preset.center);
    this.rho.set(preset.rho);
  }
}
