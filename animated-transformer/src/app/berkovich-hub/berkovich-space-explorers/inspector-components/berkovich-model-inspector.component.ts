import { Component, input, output, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BerkovichTreeVisComponent } from '../../berkovich-point-vis/tree-vis/berkovich-tree-vis.component';
import { BerkovichDigitDisplayComponent } from '../../berkovich-digit-display/berkovich-digit-display.component';
import { BerkovichCharLearnerBase, BerkovichDisk } from '../models/berkovich-char-learner';
import { formatDigitSequence } from '../../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-berkovich-model-inspector',
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
            <option value="embedding">Char Embeddings (E)</option>
            <option value="constraint">Class Targets (W)</option>
          </select>

          <select [value]="selectedChar()" (change)="selectedChar.set($any($event.target).value)">
            <option *ngFor="let char of vocab()" [value]="char">
              Character: '{{ formatDisplayString(char) }}'
            </option>
          </select>

          <select [value]="selectedDimension()" (change)="selectedDimension.set(+$any($event.target).value)">
            <option *ngFor="let d of dimensions()" [value]="d">Dimension {{ d }}</option>
          </select>
        </div>
      </div>

      <!-- Render the selected parameter details -->
      <div class="param-summary" *ngIf="selectedParameterTreeProps() as props">
        <div class="param-badge">
          <span class="param-name">
            {{ selectedIntrospectType() === 'embedding' ? 'E' : 'W' }}[{{ selectedChar() === '\n' ? '\\n' : selectedChar() }}][{{ selectedDimension() }}]
          </span>
          <span class="param-val">
            Center: <strong>{{ props.centerDigitsInput }}</strong>, Log-radius: <strong>{{ props.currentLogRadius.toFixed(4) }}</strong>
          </span>
        </div>
        
        <div class="param-target-badge">
          Last Step Target: Center <strong>{{ props.targetDigitsInput }}</strong>, Log-radius <strong>{{ props.targetLogRadius.toFixed(2) }}</strong>
          <span class="loss-pill" [class.loss-low]="props.gradientBreakdown.loss < 0.1">
            Path Loss: {{ props.gradientBreakdown.loss.toFixed(4) }}
          </span>
        </div>
      </div>

      <!-- The embedded Berkovich Tree visualization component -->
      <div class="tree-vis-wrapper" *ngIf="selectedParameterTreeProps() as props">
        <app-berkovich-tree-vis
          [prime]="props.prime"
          [targetRational]="props.targetRational"
          [targetLogRadius]="props.targetLogRadius"
          [targetDigitsInput]="props.targetDigitsInput"
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

      <!-- Embeddings Matrix Overview -->
      <div class="matrix-overview-wrapper" style="margin-top: 16px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
        <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px;">
          <mat-icon style="font-size: 16px; height: 16px; width: 16px; color: #0f766e;">grid_on</mat-icon>
          <span>Learned Parameters Matrix Overview</span>
        </h4>
        <p class="summary-text" style="font-size: 12px; color: #64748b; margin: 0 0 12px 0;">
          Showing centers and log-radii for each vocabulary character across all active dimensions. Select any cell to load it in the Introspector tree above.
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
                <td class="char-cell" [class.selected-row]="selectedChar() === char">
                  '{{ formatDisplayString(char) }}'
                </td>
                <td *ngFor="let d of dimensions()" 
                    class="matrix-cell" 
                    [class.selected-cell]="selectedChar() === char && selectedDimension() === d"
                    (click)="selectParameter(char, d)">
                  <app-berkovich-digit-display
                    [center]="model().E[idx][d].center"
                    [rho]="model().E[idx][d].rho"
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
export class BerkovichModelInspectorComponent {
  model = input.required<BerkovichCharLearnerBase>();
  vocab = input.required<string[]>();
  dimensions = input.required<number[]>();
  prime = input.required<number>();
  digitsLeft = input.required<number>();
  digitsRight = input.required<number>();
  lastStepTargets = input.required<{
    embedding: Record<number, Record<number, BerkovichDisk>>;
    constraint: Record<number, Record<number, BerkovichDisk>>;
  }>();
  
  logRadiusChange = output<{newRho: number, type: 'embedding' | 'constraint', charIdx: number, dim: number}>();

  selectedIntrospectType = signal<'embedding' | 'constraint'>('embedding');
  selectedChar = signal<string>('e');
  selectedDimension = signal<number>(0);

  formatDisplayString(str: string): string {
    return str.replace(/ /g, '␣').replace(/\n/g, '\\n');
  }

  selectParameter(char: string, dim: number) {
    this.selectedChar.set(char);
    this.selectedDimension.set(dim);
  }

  readonly selectedParameterTreeProps = computed(() => {
    const m = this.model();
    const char = this.selectedChar();
    const d = this.selectedDimension();
    const type = this.selectedIntrospectType();
    const p = BigInt(this.prime());

    const v = this.vocab();
    const charIdx = v.indexOf(char);
    if (charIdx === -1) return null;

    let disk: BerkovichDisk;
    if (type === 'embedding') {
      disk = m.E[charIdx][d];
    } else {
      disk = m.W[charIdx][d];
    }

    const currentCenterStr = formatDigitSequence(disk.center, p);

    // Check if we have a target tracked from the last step
    let target = type === 'embedding' 
      ? this.lastStepTargets().embedding?.[charIdx]?.[d]
      : this.lastStepTargets().constraint?.[charIdx]?.[d];

    if (!target) {
      target = { center: { num: 0n, den: 1n }, rho: -3.0 }; // mock default for no tracked target
    }
    const targetStr = formatDigitSequence(target.center, p);

    return {
      prime: this.prime(),
      targetRational: target.center,
      targetLogRadius: target.rho,
      targetDigitsInput: targetStr,
      currentCenter: disk.center,
      centerDigitsInput: currentCenterStr,
      currentLogRadius: disk.rho,
      currentDistanceValuation: 0 as any,
      isDraggingRho: false,
      gradientBreakdown: { loss: 0, pathLossVal: 0, centerDistVal: 0 } as any // Mocked gradient details since we aren't displaying the full path
    };
  });

  onTreeLogRadiusChange(newRho: number) {
    const char = this.selectedChar();
    const v = this.vocab();
    const charIdx = v.indexOf(char);
    if (charIdx !== -1) {
      this.logRadiusChange.emit({
        newRho,
        type: this.selectedIntrospectType(),
        charIdx,
        dim: this.selectedDimension()
      });
    }
  }
}
