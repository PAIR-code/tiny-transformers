import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';
import { BerkovichCharLearnerBase } from '../models/berkovich-char-learner';

@Component({
  selector: 'app-berkovich-model-inspector',
  imports: [CommonModule, MatIconModule, BerkovichDigitDisplayComponent],
  template: `
    <div class="introspect-body animate-fade-in" style="display: flex; flex-direction: column; gap: 24px;">
      <!-- Embeddings & Class Targets Matrix Overview -->
      <div class="matrix-overview-wrapper">
        <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px;">
          <mat-icon style="font-size: 16px; height: 16px; width: 16px; color: #0f766e;">grid_on</mat-icon>
          <span>Character Embeddings (E) Overview</span>
        </h4>
        <p class="summary-text" style="font-size: 12px; color: #64748b; margin: 0 0 12px 0;">
          Showing centers and log-radii for each vocabulary character embedding (E) across all active dimensions.
        </p>
        
        <div class="table-container" style="margin-bottom: 24px;">
          <table class="matrix-table">
            <thead>
              <tr>
                <th>Char</th>
                <th *ngFor="let d of dimensions()" [textContent]="'Dim ' + d"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let char of vocab(); let idx = index">
                <td class="char-cell">
                  '{{ formatDisplayString(char) }}'
                </td>
                <td *ngFor="let d of dimensions()" class="matrix-cell">
                  <app-berkovich-digit-display
                    [center]="model().E[idx][d].center"
                    [rho]="model().E[idx][d].rho"
                    [prime]="prime()"
                    [showRho]="true"
                    [digitsLeft]="digitsLeft()"
                    [digitsRight]="digitsRight()"
                    [outerBoxColor]="'#cbd5e1'"
                  ></app-berkovich-digit-display>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px;">
          <mat-icon style="font-size: 16px; height: 16px; width: 16px; color: #0f766e;">grid_on</mat-icon>
          <span>Class Targets / Representations (W) Overview</span>
        </h4>
        <p class="summary-text" style="font-size: 12px; color: #64748b; margin: 0 0 12px 0;">
          Showing centers and log-radii for each class target representation (W) across all active dimensions.
        </p>
        
        <div class="table-container">
          <table class="matrix-table">
            <thead>
              <tr>
                <th>Char</th>
                <th *ngFor="let d of dimensions()" [textContent]="'Dim ' + d"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let char of vocab(); let idx = index">
                <td class="char-cell">
                  '{{ formatDisplayString(char) }}'
                </td>
                <td *ngFor="let d of dimensions()" class="matrix-cell">
                  <app-berkovich-digit-display
                    [center]="model().W[idx][d].center"
                    [rho]="model().W[idx][d].rho"
                    [prime]="prime()"
                    [showRho]="true"
                    [digitsLeft]="digitsLeft()"
                    [digitsRight]="digitsRight()"
                    [outerBoxColor]="'#cbd5e1'"
                  ></app-berkovich-digit-display>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../berkovich-space-explorers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichModelInspectorComponent {
  model = input.required<BerkovichCharLearnerBase>();
  vocab = input.required<string[]>();
  dimensions = input.required<number[]>();
  prime = input.required<number>();
  digitsLeft = input.required<number>();
  digitsRight = input.required<number>();
  
  formatDisplayString(str: string): string {
    return str.replace(/ /g, '␣').replace(/\n/g, '\\n');
  }
}
