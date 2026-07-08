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
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { BerkovichModelInspectorComponent } from '../berkovich-space-explorers/inspector-components/berkovich-model-inspector.component';
import { Rational, parseToRational, formatRational } from '../../../lib/berkovich/berkovich';
import { BerkovichCharLearnerBase, BerkovichDisk } from '../berkovich-space-explorers/models/berkovich-char-learner';

@Component({
  selector: 'app-model-inspector-tool',
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
    BerkovichModelInspectorComponent
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
            <h1>Character Parameters Grid Sandbox</h1>
            <p class="subtitle">
              Inspect and configure learned character embeddings (E) and target representations (W).
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
            <app-berkovich-model-inspector
              [model]="castedModel()"
              [vocab]="vocab()"
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
            <!-- Vocabulary -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Vocabulary Tokens (comma separated)</mat-label>
              <input matInput [ngModel]="vocabRaw()" (ngModelChange)="onVocabChange($event)">
            </mat-form-field>

            <!-- Dimensions -->
            <mat-form-field appearance="outline" style="width: 100%;">
              <mat-label>Embedding Dimensions Count</mat-label>
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
                <mat-option value="both">Both E and W</mat-option>
                <mat-option value="E">Character Embeddings (E) only</mat-option>
                <mat-option value="W">Class Targets (W) only</mat-option>
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
                Edit Parameter Values
              </summary>
              <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px; max-height: 250px; overflow-y: auto; padding-right: 4px;">
                @for (vIdx of vocabIndices(); track vIdx) {
                  <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 8px;">
                    <div style="font-weight: 700; font-size: 11px; color: #1e3a8a; margin-bottom: 6px;">Token: '{{ vocab()[vIdx] }}'</div>
                    @for (d of dimensions(); track d) {
                      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px; font-size: 11px;">
                        <span style="font-weight: 600; min-width: 40px;">Dim {{ d }}:</span>
                        <span style="color: #64748b;">E:</span>
                        <input type="text" [ngModel]="getDiskCenterStr('E', vIdx, d)" (ngModelChange)="updateDiskCenter('E', vIdx, d, $event)" style="width: 50px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 4px;">
                        
                        <span style="color: #64748b;">W:</span>
                        <input type="text" [ngModel]="getDiskCenterStr('W', vIdx, d)" (ngModelChange)="updateDiskCenter('W', vIdx, d, $event)" style="width: 50px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 4px;">
                      </div>
                    }
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
export class ModelInspectorToolComponent {
  readonly prime = signal<number>(5);
  readonly vocabRaw = signal<string>('a, b, c,  d');
  readonly dimCount = signal<number>(2);
  readonly mode = signal<'both' | 'E' | 'W'>('both');
  readonly digitsLeft = signal<number>(2);
  readonly digitsRight = signal<number>(2);

  readonly vocab = computed<string[]>(() => {
    return this.vocabRaw().split(',').map(s => s.trim()).filter(s => s.length > 0);
  });

  readonly vocabIndices = computed<number[]>(() => {
    return this.vocab().map((_, i) => i);
  });

  readonly dimensions = computed<number[]>(() => {
    const arr: number[] = [];
    for (let i = 0; i < this.dimCount(); i++) {
      arr.push(i);
    }
    return arr;
  });

  // Storage for our interactive parameters
  // E parameters: [vocabIdx][dimIdx]
  private readonly EStore = signal<{ [key: string]: Rational }>({
    '0-0': { num: 1n, den: 5n },
    '0-1': { num: 2n, den: 5n },
    '1-0': { num: 3n, den: 5n },
    '1-1': { num: 4n, den: 5n },
    '2-0': { num: 6n, den: 5n },
    '2-1': { num: 1n, den: 1n },
    '3-0': { num: 2n, den: 1n },
    '3-1': { num: 7n, den: 5n }
  });

  // W parameters: [vocabIdx][dimIdx]
  private readonly WStore = signal<{ [key: string]: Rational }>({
    '0-0': { num: 2n, den: 5n },
    '0-1': { num: 1n, den: 5n },
    '1-0': { num: 4n, den: 5n },
    '1-1': { num: 3n, den: 5n },
    '2-0': { num: 1n, den: 1n },
    '2-1': { num: 6n, den: 5n },
    '3-0': { num: 7n, den: 5n },
    '3-1': { num: 2n, den: 1n }
  });

  readonly castedModel = computed<BerkovichCharLearnerBase>(() => {
    const vocabLen = this.vocab().length;
    const dimLen = this.dimensions().length;

    const E: BerkovichDisk[][] = [];
    const W: BerkovichDisk[][] = [];

    const eMap = this.EStore();
    const wMap = this.WStore();

    for (let v = 0; v < vocabLen; v++) {
      const eRow: BerkovichDisk[] = [];
      const wRow: BerkovichDisk[] = [];
      for (let d = 0; d < dimLen; d++) {
        const key = `${v}-${d}`;
        eRow.push({
          center: eMap[key] ?? { num: 0n, den: 1n },
          rho: -1.0
        });
        wRow.push({
          center: wMap[key] ?? { num: 0n, den: 1n },
          rho: -1.0
        });
      }
      E.push(eRow);
      W.push(wRow);
    }

    return { E, W } as any as BerkovichCharLearnerBase;
  });

  getDiskCenterStr(type: 'E' | 'W', vIdx: number, dIdx: number): string {
    const key = `${vIdx}-${dIdx}`;
    const map = type === 'E' ? this.EStore() : this.WStore();
    const r = map[key];
    if (!r) return '0';
    return formatRational(r);
  }

  updateDiskCenter(type: 'E' | 'W', vIdx: number, dIdx: number, valStr: string) {
    try {
      const r = parseToRational(valStr);
      const key = `${vIdx}-${dIdx}`;
      if (type === 'E') {
        this.EStore.update(m => ({ ...m, [key]: r }));
      } else {
        this.WStore.update(m => ({ ...m, [key]: r }));
      }
    } catch {}
  }

  onVocabChange(newVocab: string) {
    this.vocabRaw.set(newVocab);
  }

  onDimCountChange(newCount: number) {
    this.dimCount.set(newCount);
  }
}
