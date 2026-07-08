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

import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownComponent } from 'ngx-markdown';

export interface WalkthroughPrediction {
  char: string;
  score: number;
  expScore: number;
  prob: number;
}

@Component({
  selector: 'app-softmax-walkthrough-table',
  imports: [CommonModule, MatIconModule, MarkdownComponent],
  template: `
    <details #detEl [open]="open()" (toggle)="openChange.emit(detEl.open)" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 8px;">
      <summary style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #3b82f6; cursor: pointer; background: #f8fafc; user-select: none;"
               [textContent]="stepTitle()">
      </summary>
      <div style="padding: 12px; font-size: 11.5px; line-height: 1.5; color: #334155;">
        <!-- Legend defining terms -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 11.5px; line-height: 1.4; color: #475569;">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
            <mat-icon style="font-size: 14px; height: 14px; width: 14px; color: #3b82f6;">help_outline</mat-icon>
            <span>Softmax Calculation Guide</span>
          </div>
          <markdown [katex]="true" [data]="guideData()"></markdown>
        </div>

        <!-- Common Softmax parameters -->
        <div style="display: flex; gap: 16px; margin-bottom: 10px; font-size: 11px; color: #475569; font-family: monospace; background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; width: fit-content;">
          <div>Temperature <span style="font-weight: 700;">β</span> = {{ beta().toFixed(2) }}</div>
          <div style="color: #cbd5e1;">|</div>
          <div>Denominator Sum <span style="font-weight: 700;">Σ e^(β·Score)</span> = {{ denominatorSum().toFixed(3) }}</div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          @for (p of predictions(); track p.char; let rank = $index) {
            <div style="display: flex; align-items: center; gap: 12px; background: #f8fafc; padding: 6px 10px; border-radius: 4px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: #64748b; width: 55px;" [textContent]="'Rank ' + (rank + 1) + ':'"></span>
              <span style="font-family: monospace; font-weight: 700; font-size: 13px; color: #0f172a; width: 32px;" [textContent]="wrapInQuotes(formatDisplayString(p.char))"></span>
              
              <!-- Math breakdown values -->
              <div style="display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: #475569; font-family: monospace; background: #ffffff; border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 4px;">
                <div>Score <span style="font-weight: 700; color: #3b82f6;">S</span> = {{ p.score.toFixed(3) }}</div>
                <div style="color: #cbd5e1;">|</div>
                <div>e^(β·S) = {{ p.expScore.toFixed(4) }}</div>
              </div>

              <div style="flex: 1; background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden; max-width: 100px;">
                <div style="background: #3b82f6; height: 100%;" [style.width.%]="p.prob * 100"></div>
              </div>
              <span style="color: #2563eb; width: 170px; text-align: right; font-weight: bold; font-family: monospace; font-size: 11px;">
                {{ p.expScore.toFixed(4) }} / {{ denominatorSum().toFixed(3) }} = {{ (p.prob * 100).toFixed(1) }}%
              </span>
            </div>
          }
        </div>
      </div>
    </details>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SoftmaxWalkthroughTableComponent {
  stepTitle = input<string>('Show output probabilities');
  predictions = input.required<WalkthroughPrediction[]>();
  denominatorSum = input.required<number>();
  beta = input.required<number>();
  open = input<boolean>(true);
  openChange = output<boolean>();
  
  guideData = input<string>(
    '- **Score (S)**: The raw classification linear score (logit) from the previous step. Higher is better.\n- **$e^{\\beta \\cdot S}$ (Numerator)**: Exponentiates the score scaled by temperature $\\beta$ to ensure positive weights.\n- **Denominator Sum**: The sum of $e^{\\beta \\cdot \\text{Score}}$ across all characters in the alphabet.\n- **Probability (Ratio)**: The final character probability, calculated as $\\frac{\\text{Numerator}}{\\text{Denominator Sum}}.$'
  );

  formatDisplayString(str: string): string {
    return str.replace(/ /g, '␣').replace(/\n/g, '\\n');
  }

  wrapInQuotes(str: string): string {
    return `'${str}'`;
  }
}
