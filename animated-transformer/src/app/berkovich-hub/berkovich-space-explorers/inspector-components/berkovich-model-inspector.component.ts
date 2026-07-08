import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';
import { BerkovichCharLearnerBase } from '../models/berkovich-char-learner';

@Component({
  selector: 'app-berkovich-model-inspector',
  imports: [CommonModule, MatIconModule, BerkovichDigitDisplayComponent],
  template: `
    <div class="introspect-body animate-fade-in" style="display: flex; flex-direction: column; gap: 12px; height: fit-content;">
      <!-- Embeddings & Class Targets Matrix Overview -->
      <div class="matrix-overview-wrapper" style="height: fit-content;">
        @if (mode() === 'both' || mode() === 'E') {
          <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px;">
            <mat-icon style="font-size: 16px; height: 16px; width: 16px; color: #0f766e;">grid_on</mat-icon>
            <span>Character Embeddings (E) Overview</span>
          </h4>
          <p class="summary-text" style="font-size: 11px; color: #64748b; margin: 0 0 10px 0;">
            Showing digit sequences for each character embedding across dimensions.
          </p>
          
          <div class="parameters-grid" style="display: flex; flex-wrap: wrap; gap: 6px;">
            @for (char of vocab(); track char; let idx = $index) {
              <div class="parameter-grid-item" style="display: flex; flex-direction: column; align-items: center; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; background: #f8fafc; min-width: 80px; box-sizing: border-box; height: fit-content;">
                <span style="font-family: monospace; font-weight: 700; font-size: 11.5px; color: #334155; margin-bottom: 4px;">
                  '{{ formatDisplayString(char) }}'
                </span>
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: center; width: 100%;">
                  @for (d of dimensions(); track d) {
                    <div style="display: flex; align-items: center; justify-content: center; width: 100%;">
                      <app-berkovich-digit-display
                        [center]="model().E[idx][d].center"
                        [rho]="model().E[idx][d].rho"
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
        }

        @if (mode() === 'both' || mode() === 'W') {
          <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px;">
            <mat-icon style="font-size: 16px; height: 16px; width: 16px; color: #0f766e;">grid_on</mat-icon>
            <span>Class Targets / Representations (W) Overview</span>
          </h4>
          <p class="summary-text" style="font-size: 11px; color: #64748b; margin: 0 0 10px 0;">
            Showing centers and log-radii for each class target representation (W) across dimensions.
          </p>
          
          <div class="parameters-grid" style="display: flex; flex-wrap: wrap; gap: 6px;">
            @for (char of vocab(); track char; let idx = $index) {
              <div class="parameter-grid-item" style="display: flex; flex-direction: column; align-items: center; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; background: #f8fafc; min-width: 80px; box-sizing: border-box; height: fit-content;">
                <span style="font-family: monospace; font-weight: 700; font-size: 11.5px; color: #334155; margin-bottom: 4px;">
                  '{{ formatDisplayString(char) }}'
                </span>
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: center; width: 100%;">
                  @for (d of dimensions(); track d) {
                    <div style="display: flex; align-items: center; justify-content: center; width: 100%;">
                      <app-berkovich-digit-display
                        [center]="model().W[idx][d].center"
                        [rho]="model().W[idx][d].rho"
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
        }
      </div>
    </div>
  `,
  styleUrl: '../berkovich-space-explorers.component.scss',
  host: {
    'style': 'display: block; height: fit-content; min-height: 0;'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichModelInspectorComponent {
  model = input.required<BerkovichCharLearnerBase>();
  vocab = input.required<string[]>();
  dimensions = input.required<number[]>();
  prime = input.required<number>();
  digitsLeft = input.required<number>();
  digitsRight = input.required<number>();
  mode = input<'both' | 'E' | 'W'>('both');
  
  formatDisplayString(str: string): string {
    return str.replace(/ /g, '␣').replace(/\n/g, '\\n');
  }
}
