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
import { WalkthroughDetails } from './shared/walkthrough-types';
import { WalkthroughContextComponent } from './shared/walkthrough-context.component';
import { SoftmaxWalkthroughTableComponent } from './shared/softmax-walkthrough-table.component';

@Component({
  selector: 'app-euclidean-walkthrough',
  imports: [
    CommonModule,
    MatIconModule,
    MarkdownComponent,
    WalkthroughContextComponent,
    SoftmaxWalkthroughTableComponent
  ],
  template: `
    <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #0f172a;">
      Euclidean N-Gram Predictor (Baseline)
    </h4>
    <p style="margin: 0 0 12px 0; font-size: 12.5px; color: #475569; line-height: 1.5;">
      This baseline uses standard vector spaces. Characters are mapped to Euclidean vectors <markdown [katex]="true" [data]="'$e_c \\in \\mathbb{R}^d$'" style="display:inline;"></markdown>.
    </p>

    @if (details(); as walkthrough) {
      <app-walkthrough-context
        [inputId]="'walkthrough-input-field-euclidean'"
        [contextLength]="contextLength()"
        [preText]="walkthrough.preText"
        [contextText]="walkthrough.contextText"
        [walkthroughInput]="walkthroughInput()"
        [walkthroughInputError]="walkthroughInputError()"
        (inputChanged)="walkthroughInputChange.emit($event)">
      </app-walkthrough-context>

      <div style="display: flex; flex-direction: column; gap: 16px; font-size: 13px; line-height: 1.5; color: #334155;">
        <!-- Step 1 -->
        <div>
          <markdown [katex]="true" [data]="stepData().step1"></markdown>
          
          <details style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 8px;">
            <summary style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #3b82f6; cursor: pointer; background: #f8fafc; user-select: none;"
                     [textContent]="'Show Step 1 lookup details for ' + walkthrough.contextText">
            </summary>
            <div style="padding: 12px; font-size: 11.5px; line-height: 1.5; color: #334155; display: flex; flex-direction: column; gap: 8px;">
              @for (charItem of walkthrough.embeddings; track charItem.charIdx; let last = $last) {
                <div [style.border-bottom]="last ? 'none' : '1px dashed #e2e8f0'"
                     [style.padding-bottom]="last ? '0' : '12px'"
                     [style.margin-bottom]="last ? '0' : '12px'">
                  <div style="margin-bottom: 6px; font-size: 11.5px; font-weight: 600;">
                    Character {{ charItem.charIdx + 1 }}: <span style="font-family: monospace; font-size: 13px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">{{ wrapInQuotes(formatDisplayString(charItem.char)) }}</span>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 4px; padding-left: 8px; border-left: 2px solid #e2e8f0;">
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; line-height: 1.3;">
                      <strong style="color: #475569;">Embedding vector:</strong>
                      <span style="font-family: monospace; color: #0f172a;">
                        [{{ charItem.embeds[0].val?.toFixed(4) }}
                        @for (val of charItem.embeds.slice(1); track val.dim) {
                          , {{ val.val?.toFixed(4) }}
                        }
                        ]
                      </span>
                    </div>
                  </div>
                </div>
              }
            </div>
          </details>
        </div>

        <!-- Step 2 -->
        <div>
          <markdown [katex]="true" [data]="stepData().step2"></markdown>
          
          <details style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 8px;">
            <summary style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #3b82f6; cursor: pointer; background: #f8fafc; user-select: none;">
              Show Step 2 Hidden aggregated vector values (H)
            </summary>
            <div style="padding: 12px; font-size: 11.5px; line-height: 1.5; color: #334155; display: flex; flex-direction: column; gap: 8px;">
              <div style="font-size: 11.5px; font-weight: 600; color: #475569;">
                Aggregated State Vector (H):
              </div>
              <div style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; font-family: monospace; font-size: 12px; color: #0f172a; width: fit-content;">
                [ {{ walkthrough.aggregated[0].val?.toFixed(4) }}
                @for (val of walkthrough.aggregated.slice(1); track val.dim) {
                  , {{ val.val?.toFixed(4) }}
                }
                ]
              </div>
            </div>
          </details>
        </div>

        <!-- Step 3 -->
        <div>
          <markdown [katex]="true" [data]="stepData().step3"></markdown>
          
          <details style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 8px;">
            <summary style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #3b82f6; cursor: pointer; background: #f8fafc; user-select: none;">
              Show Step 3 logit calculations & dot products
            </summary>
            <div style="padding: 12px; font-size: 11.5px; line-height: 1.5; color: #334155;">
              <div style="max-height: 350px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                  <thead>
                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 10;">
                      <th style="padding: 8px 12px; font-size: 11px; font-weight: 600; color: #475569;">Class Character (k)</th>
                      <th style="padding: 8px 12px; font-size: 11px; font-weight: 600; color: #475569;">Dot Product & Bias Details</th>
                      <th style="padding: 8px 12px; font-size: 11px; font-weight: 600; color: #475569; text-align: right;">Final Logit Score (S)</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of walkthrough.scores; track s.classIdx) {
                      <tr style="border-bottom: 1px solid #f1f5f9; vertical-align: top;">
                        <td style="padding: 8px 12px;">
                          <div style="font-weight: 700; font-family: monospace; font-size: 13px; color: #0f172a;">
                            {{ wrapInQuotes(formatDisplayString(s.char)) }}
                          </div>
                          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Idx: {{ s.classIdx }}</div>
                        </td>
                        <td style="padding: 8px 12px;">
                          <div style="display: flex; flex-direction: column; gap: 4px; font-family: monospace; font-size: 11px; color: #475569;">
                            <div>H &middot; W<sub>k</sub> = {{ (s.finalScore - (s.bias ?? 0)).toFixed(4) }}</div>
                            <div>Bias b<sub>k</sub> = {{ s.bias?.toFixed(4) ?? '0.0000' }}</div>
                          </div>
                        </td>
                        <td style="padding: 8px 12px; text-align: right; font-weight: 700; font-family: monospace; font-size: 12.5px; color: #2563eb; vertical-align: middle;">
                          {{ s.finalScore.toFixed(3) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </div>

        <!-- Step 4 -->
        <app-softmax-walkthrough-table
          [stepTitle]="'Show Step 4 output probabilities'"
          [predictions]="walkthrough.predictions"
          [denominatorSum]="walkthrough.sumExp"
          [beta]="beta()"
          [guideData]="softmaxGuide">
        </app-softmax-walkthrough-table>

        <!-- Explanatory note -->
        <div style="margin-top: 16px; font-size: 12.5px; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 12px;">
          <markdown [katex]="true" [data]="explanationMarkdown"></markdown>
        </div>
      </div>
    } @else {
      <div style="padding: 24px; text-align: center; color: #94a3b8; font-size: 12.5px;">
        Type a valid context string above to activate the live walkthrough.
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EuclideanWalkthroughComponent {
  readonly explanationMarkdown = `- **Values vs. Parameters**: Values are exact Type I leaf points ($c \\in \\mathbb{Q}_p$) with a fixed log-radius of $-2.0$. Parameters (Embeddings & Constraints) are dynamic Berkovich disks ($E_c, W_{k,\\rho}$).
- **Why two Radius Regularizations?**: Same as the Bigram model, regularizing constraint and embedding radii ensures tight class boundaries and clean tree coordinates.`;

  readonly softmaxGuide = `- **Logit Score (S)**: The standard linear score $S_k = b_k + H \\cdot W_k$ from Step 3.
- **$e^{\\beta \\cdot S}$ (Numerator)**: Exponentiates the score scaled by temperature $\\beta$.
- **Denominator Sum**: Sum of $e^{\\beta \\cdot S}$ across all vocabulary characters.
- **Probability (Ratio)**: Final probability $\\frac{\\text{Numerator}}{\\text{Denominator Sum}}.$`;

  details = input.required<WalkthroughDetails | null>();
  walkthroughInput = input.required<string>();
  walkthroughInputError = input.required<string | null>();
  beta = input.required<number>();
  vocab = input.required<string[]>();
  contextLength = input.required<number>();

  stepData = input.required<{
    step1: string;
    step2: string;
    step3: string;
    step4: string;
  }>();

  walkthroughInputChange = output<string>();

  formatDisplayString(str: string): string {
    return str.replace(/ /g, '␣').replace(/\n/g, '\\n');
  }

  wrapInQuotes(str: string): string {
    return `'${str}'`;
  }
}
