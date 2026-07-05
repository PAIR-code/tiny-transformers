import { Component, input, output, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BerkovichTreeVisComponent } from '../../berkovich-point-vis/tree-vis/berkovich-tree-vis.component';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';
import { PadicLinearCharLearner } from '../models/padic-linear-char-learner';
import { BerkovichDisk } from '../models/berkovich-char-learner';
import { formatDigitSequence } from '../../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-padic-linear-model-inspector',
  imports: [CommonModule, MatIconModule, BerkovichTreeVisComponent, BerkovichDigitDisplayComponent],
  template: `
    <div class="introspect-body animate-fade-in" style="display: flex; flex-direction: column; gap: 24px;">
      <!-- Parameter Introspector Tree -->
      <div class="viz-header" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px;">
        <h4 style="margin: 0; font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px;">
          <mat-icon style="font-size: 16px; height: 16px; width: 16px; color: #0f766e;">pageview</mat-icon>
          <span>Parameter Tree Visualizer</span>
        </h4>
        
        <div class="selector-row" style="display: flex; gap: 8px; flex-wrap: wrap;">
          <select [value]="selectedIntrospectType()" (change)="selectedIntrospectType.set($any($event.target).value)">
            <option value="M">Weight Matrix (M)</option>
            <option value="B">Bias Vector (B)</option>
          </select>

          <select [value]="selectedRow()" (change)="selectedRow.set(+$any($event.target).value)">
            <option *ngFor="let d of dimensions()" [value]="d">Row {{ d }}</option>
          </select>

          <select *ngIf="selectedIntrospectType() === 'M'" [value]="selectedCol()" (change)="selectedCol.set(+$any($event.target).value)">
            <option *ngFor="let d of dimensions()" [value]="d">Col {{ d }}</option>
          </select>
        </div>
      </div>

      <!-- Render the selected parameter details -->
      <div class="param-summary" *ngIf="selectedParameterTreeProps() as props">
        <div class="param-badge">
          <span class="param-name">
            {{ selectedIntrospectType() }}[{{ selectedRow() }}]<ng-container *ngIf="selectedIntrospectType() === 'M'">[{{ selectedCol() }}]</ng-container>
          </span>
          <span class="param-val">
            Center: <strong>{{ props.centerDigitsInput }}</strong>, Log-radius: <strong>{{ props.currentLogRadius.toFixed(4) }}</strong>
          </span>
        </div>
      </div>

      <!-- The embedded Berkovich Tree visualization component -->
      <div class="tree-vis-wrapper" *ngIf="selectedParameterTreeProps() as props">
        <app-berkovich-tree-vis
          [prime]="props.prime"
          [targetRational]="props.currentCenter" 
          [targetLogRadius]="props.currentLogRadius"
          [targetDigitsInput]="props.centerDigitsInput"
          [currentCenter]="props.currentCenter"
          [centerDigitsInput]="props.centerDigitsInput"
          [currentLogRadius]="props.currentLogRadius"
          [isDraggingRho]="props.isDraggingRho"
          [gradientBreakdown]="props.gradientBreakdown"
          [currentDistanceValuation]="props.currentDistanceValuation"
          [isPlaying]="false"
          [canUndo]="false"
          [canStep]="false"
          (logRadiusChange)="onTreeLogRadiusChange($event)"
        ></app-berkovich-tree-vis>
      </div>

      <!-- Parameters Matrix Overview -->
      <div class="matrix-overview-wrapper" style="margin-top: 16px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
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
                <td class="char-cell" [class.selected-row]="selectedIntrospectType() === 'M' && selectedRow() === r">
                  Row {{ r }}
                </td>
                <td *ngFor="let c of dimensions()" 
                    class="matrix-cell" 
                    [class.selected-cell]="selectedIntrospectType() === 'M' && selectedRow() === r && selectedCol() === c"
                    (click)="selectM(r, c)">
                  <app-berkovich-digit-display
                    [center]="model().M[r][c].center"
                    [rho]="model().M[r][c].rho"
                    [prime]="prime()"
                    [showRho]="true"
                    [digitsLeft]="digitsLeft()"
                    [digitsRight]="digitsRight()"
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
                <td class="char-cell" [class.selected-row]="selectedIntrospectType() === 'B' && selectedRow() === r">
                  Dim {{ r }}
                </td>
                <td class="matrix-cell" 
                    [class.selected-cell]="selectedIntrospectType() === 'B' && selectedRow() === r"
                    (click)="selectB(r)">
                  <app-berkovich-digit-display
                    [center]="model().B[r].center"
                    [rho]="model().B[r].rho"
                    [prime]="prime()"
                    [showRho]="true"
                    [digitsLeft]="digitsLeft()"
                    [digitsRight]="digitsRight()"
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
  
  logRadiusChange = output<{newRho: number, type: 'M' | 'B', row: number, col?: number}>();

  selectedIntrospectType = signal<'M' | 'B'>('M');
  selectedRow = signal<number>(0);
  selectedCol = signal<number>(0);

  selectM(row: number, col: number) {
    this.selectedIntrospectType.set('M');
    this.selectedRow.set(row);
    this.selectedCol.set(col);
  }

  selectB(row: number) {
    this.selectedIntrospectType.set('B');
    this.selectedRow.set(row);
  }

  readonly selectedParameterTreeProps = computed(() => {
    const m = this.model();
    const type = this.selectedIntrospectType();
    const r = this.selectedRow();
    const c = this.selectedCol();
    const p = BigInt(this.prime());

    let disk: BerkovichDisk;
    if (type === 'M') {
      disk = m.M[r]?.[c];
    } else {
      disk = m.B[r];
    }

    if (!disk) return null;

    const currentCenterStr = formatDigitSequence(disk.center, p);

    return {
      prime: this.prime(),
      targetRational: disk.center, // No target tracked for padic linear for now
      targetLogRadius: disk.rho,
      targetDigitsInput: currentCenterStr,
      currentCenter: disk.center,
      centerDigitsInput: currentCenterStr,
      currentLogRadius: disk.rho,
      currentDistanceValuation: 0 as any,
      isDraggingRho: false,
      gradientBreakdown: { loss: 0, pathLossVal: 0, centerDistVal: 0 } as any // Mocked gradient details
    };
  });

  onTreeLogRadiusChange(newRho: number) {
    this.logRadiusChange.emit({
      newRho,
      type: this.selectedIntrospectType(),
      row: this.selectedRow(),
      col: this.selectedIntrospectType() === 'M' ? this.selectedCol() : undefined
    });
  }
}
