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

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkdownComponent } from 'ngx-markdown';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';
import { BerkovichAffinoidMnistLearner } from '../models/berkovich-mnist-learner';

@Component({
  selector: 'app-berkovich-mnist-inspector',
  imports: [CommonModule, MarkdownComponent, BerkovichDigitDisplayComponent],
  template: `
    @if (model(); as m) {
      <div class="mnist-inspector-container">
        <h3><markdown [data]="titleMarkdown" [inline]="true" [katex]="true"></markdown></h3>
        <div class="inspector-desc">
          <markdown [data]="descMarkdown" [inline]="true" [katex]="true"></markdown>
        </div>

        <div class="digit-classes-grid">
          @for (k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; track k) {
            <div class="class-card">
              <div class="class-title">Digit {{ k }}</div>
              <div class="constraints-list">
                @for (mIdx of getConstraintIndices(m); track mIdx) {
                  <div class="constraint-group">
                    <div class="constraint-label">Constraint {{ mIdx + 1 }}:</div>
                    <div class="dim-disks">
                      @for (d of getDimIndices(m); track d) {
                        <div class="disk-row">
                          <span class="dim-tag">d={{ d }}:</span>
                          <app-berkovich-digit-display
                            [center]="m.W[k][mIdx][d].center"
                            [rho]="m.W[k][mIdx][d].rho"
                            [prime]="prime()"
                            [digitsLeft]="digitsLeft()"
                            [digitsRight]="digitsRight()"
                          ></app-berkovich-digit-display>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .mnist-inspector-container {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    h3 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-weight: 600;
    }

    .inspector-desc {
      color: #475569;
      font-size: 0.88rem;
      margin-bottom: 16px;
    }

    .digit-classes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .class-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
    }

    .class-title {
      font-weight: bold;
      font-size: 1.05rem;
      color: #2563eb;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }

    .constraints-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .constraint-label {
      font-size: 0.8rem;
      color: #475569;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .dim-disks {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .disk-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dim-tag {
      font-size: 0.75rem;
      color: #64748b;
      min-width: 32px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BerkovichMnistInspectorComponent {
  readonly titleMarkdown = 'Learned Affinoid Digit Class Constraints ($W_{k,m}$)';
  readonly descMarkdown = 'Below are the $M$ target constraints per digit class ($0..9$) learned in Berkovich space. Regularization contracts log-radii $\\rho_W$ to maintain disjoint affinoid domains.';

  model = input.required<BerkovichAffinoidMnistLearner | null>();
  prime = input.required<number>();
  digitsLeft = input.required<number>();
  digitsRight = input.required<number>();

  getConstraintIndices(m: BerkovichAffinoidMnistLearner): number[] {
    return Array.from({ length: m.numConstraints }, (_, i) => i);
  }

  getDimIndices(m: BerkovichAffinoidMnistLearner): number[] {
    return Array.from({ length: m.embDim }, (_, i) => i);
  }
}
