import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';
import { PadicLinearCharLearner } from '../models/padic-linear-char-learner';

@Component({
  selector: 'app-padic-linear-model-inspector',
  imports: [CommonModule, MatIconModule, BerkovichDigitDisplayComponent],
  template: `
    <div class="introspect-body animate-fade-in" style="display: flex; flex-direction: column; gap: 16px;">
      <!-- Parameters Matrix Overview -->
      <div class="matrix-overview-wrapper">
        <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px;">
          <mat-icon style="font-size: 16px; height: 16px; width: 16px; color: #0f766e;">grid_on</mat-icon>
          <span>Weight Matrix (M) &amp; Bias (B) Overview</span>
        </h4>
        <p class="summary-text" style="font-size: 11.5px; color: #64748b; margin: 0 0 12px 0;">
          Showing centers and log-radii for Weight Matrix M (Dim x Dim) and Bias Vector B (Dim).
        </p>
        
        <div class="grid-container" style="display: flex; flex-direction: column; gap: 16px;">
          @if (mode() === 'both' || mode() === 'M') {
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="font-weight: 700; font-size: 12px; color: #475569; margin-bottom: 2px;">Weight Matrix (M) Rows:</div>
              @for (r of dimensions(); track r) {
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                  <span style="font-size: 11px; font-weight: bold; color: #94a3b8; min-width: 50px;">Row {{ r }}:</span>
                  @for (c of dimensions(); track c) {
                    <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; background: #f8fafc; display: flex; align-items: center; gap: 6px; box-sizing: border-box;">
                      <span style="font-size: 9px; color: #94a3b8; font-family: monospace; font-weight: bold;">Col {{ c }}</span>
                      <app-berkovich-digit-display
                        [center]="model().M[r][c].center"
                        [rho]="model().M[r][c].rho"
                        [prime]="prime()"
                        [digitsLeft]="digitsLeft()"
                        [digitsRight]="digitsRight()"
                        [outerBoxColor]="'#cbd5e1'"
                        [scale]="0.7"
                      ></app-berkovich-digit-display>
                    </div>
                  }
                </div>
              }
            </div>
          }

          @if (mode() === 'both' || mode() === 'B') {
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="font-weight: 700; font-size: 12px; color: #475569; margin-bottom: 2px;">Bias Vector (B):</div>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                @for (r of dimensions(); track r) {
                  <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; background: #f8fafc; display: flex; align-items: center; gap: 6px; min-width: 100px; box-sizing: border-box;">
                    <span style="font-size: 9px; color: #94a3b8; font-family: monospace; font-weight: bold;">Dim {{ r }}</span>
                    <app-berkovich-digit-display
                      [center]="model().B[r].center"
                      [rho]="model().B[r].rho"
                      [prime]="prime()"
                      [digitsLeft]="digitsLeft()"
                      [digitsRight]="digitsRight()"
                      [outerBoxColor]="'#cbd5e1'"
                      [scale]="0.7"
                    ></app-berkovich-digit-display>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styleUrl: '../berkovich-space-explorers.component.scss',
  host: {
    'style': 'display: block; height: fit-content; min-height: 0;'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PadicLinearModelInspectorComponent {
  model = input.required<PadicLinearCharLearner>();
  dimensions = input.required<number[]>();
  prime = input.required<number>();
  digitsLeft = input.required<number>();
  digitsRight = input.required<number>();
  mode = input<'both' | 'M' | 'B'>('both');
}
