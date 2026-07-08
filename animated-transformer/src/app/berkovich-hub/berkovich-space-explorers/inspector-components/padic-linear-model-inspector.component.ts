import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';
import { PadicLinearCharLearner } from '../models/padic-linear-char-learner';

@Component({
  selector: 'app-padic-linear-model-inspector',
  imports: [CommonModule, MatIconModule, BerkovichDigitDisplayComponent],
  template: `
    <div class="introspect-body animate-fade-in" style="display: flex; flex-direction: column; gap: 24px;">
      <!-- Parameters Matrix Overview -->
      <div class="matrix-overview-wrapper">
        <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px;">
          <mat-icon style="font-size: 16px; height: 16px; width: 16px; color: #0f766e;">grid_on</mat-icon>
          <span>Weight Matrix (M) & Bias (B) Overview</span>
        </h4>
        <p class="summary-text" style="font-size: 12px; color: #64748b; margin: 0 0 12px 0;">
          Showing centers and log-radii for matrix M (Dim x Dim) and bias B (Dim).
        </p>
        
        <div class="table-container">
          <table class="matrix-table" style="margin-bottom: 24px;">
            <thead>
              <tr>
                <th>Matrix M</th>
                <th *ngFor="let c of dimensions()">Col {{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of dimensions()">
                <td class="char-cell">
                  Row {{ r }}
                </td>
                <td *ngFor="let c of dimensions()" class="matrix-cell">
                  <app-berkovich-digit-display
                    [center]="model().M[r][c].center"
                    [rho]="model().M[r][c].rho"
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

          <table class="matrix-table">
            <thead>
              <tr>
                <th>Bias B</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of dimensions()">
                <td class="char-cell">
                  Dim {{ r }}
                </td>
                <td class="matrix-cell">
                  <app-berkovich-digit-display
                    [center]="model().B[r].center"
                    [rho]="model().B[r].rho"
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
export class PadicLinearModelInspectorComponent {
  model = input.required<PadicLinearCharLearner>();
  dimensions = input.required<number[]>();
  prime = input.required<number>();
  digitsLeft = input.required<number>();
  digitsRight = input.required<number>();
}
