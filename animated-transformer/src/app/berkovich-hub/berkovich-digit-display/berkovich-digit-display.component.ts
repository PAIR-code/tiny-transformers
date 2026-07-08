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

import { Component, input, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Rational, getAlignedDigits } from '../../../lib/berkovich/berkovich';

export interface DigitDisplayCell {
  power: number;
  digit: number;
  uncertaintyRatio: number; // Value between 0.0 and 1.0
}

@Component({
  selector: 'app-berkovich-digit-display',
  templateUrl: './berkovich-digit-display.component.html',
  styleUrls: ['./berkovich-digit-display.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  host: {
    '[class.clickable]': 'showRho()',
    '(click)': 'toggleRho($event)'
  }
})
export class BerkovichDigitDisplayComponent {
  private static idCounter = 0;
  readonly clipPathId = `rowClip_${BerkovichDigitDisplayComponent.idCounter++}`;

  readonly isRhoToggled = signal<boolean>(false);

  readonly displayShowRho = computed(() => {
    return this.showRho() && this.isRhoToggled();
  });

  toggleRho(event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
    }
    if (this.showRho()) {
      this.isRhoToggled.set(!this.isRhoToggled());
    }
  }

  // ==========================================================================
  // COLOR & VISUAL CONSTANTS (matching berkovich-dual-digit-display)
  // ==========================================================================
  readonly COLOR_ROW_BG = '#ffffff';
  readonly COLOR_RHO_SHADING = '#7d8288ff'; 
  readonly OPACITY_RHO_SHADING = 0.3;
  readonly DIGIT_BOX_INSET = 1.5;
  readonly DOT_RADIUS = 1.5;
  readonly COLOR_DOT = '#666';

  // Core Inputs
  readonly center = input.required<Rational>();
  readonly rho = input.required<number>();
  readonly prime = input.required<number>();
  readonly showRho = input<boolean>(true);
  readonly digitsLeft = input<number>(2);
  readonly digitsRight = input<number>(2);

  // Configurable size category
  readonly size = input<'small' | 'medium' | 'large'>('small');

  // Flexible layout & margin inputs (default to undefined to fall back to size category defaults)
  readonly cellWidthInput = input<number | undefined>(undefined, { alias: 'cellWidth' });
  readonly cellHeightInput = input<number | undefined>(undefined, { alias: 'cellHeight' });
  readonly cellGapInput = input<number | undefined>(undefined, { alias: 'cellGap' });
  readonly dotWidth = input<number>(0);

  readonly marginTopInput = input<number | undefined>(undefined, { alias: 'marginTop' });
  readonly marginBottomInput = input<number | undefined>(undefined, { alias: 'marginBottom' });
  readonly marginLeftInput = input<number | undefined>(undefined, { alias: 'marginLeft' });
  readonly marginRightInput = input<number | undefined>(undefined, { alias: 'marginRight' });
  readonly fontSizeInput = input<number | undefined>(undefined, { alias: 'fontSize' });

  readonly outerBoxColor = input<string>('#a855f7'); // default: purple

  readonly derivedDimensions = computed(() => {
    const sz = this.size();
    
    // Default dimensions per size
    let cellWidth = 20;
    let cellHeight = 24;
    let cellGap = 4;
    let marginTop = 24;
    let marginBottom = 10;
    let marginLeft = 10;
    let marginRight = 10;
    let fontSize = 11;

    let boxPadding = 3;
    let boxBorderRadius = 4;
    let dotYOffsetFromBottom = 8;

    if (sz === 'small') {
      cellWidth = 14;
      cellHeight = 18;
      cellGap = 2;
      marginTop = 18;
      marginBottom = 6;
      marginLeft = 6;
      marginRight = 6;
      fontSize = 9;
      boxPadding = 1.5;
      boxBorderRadius = 2.5;
      dotYOffsetFromBottom = 5.5;
    } else if (sz === 'large') {
      cellWidth = 28;
      cellHeight = 34;
      cellGap = 6;
      marginTop = 30;
      marginBottom = 15;
      marginLeft = 15;
      marginRight = 15;
      fontSize = 14;
      boxPadding = 4;
      boxBorderRadius = 6;
      dotYOffsetFromBottom = 11;
    }

    return {
      cellWidth: this.cellWidthInput() ?? cellWidth,
      cellHeight: this.cellHeightInput() ?? cellHeight,
      cellGap: this.cellGapInput() ?? cellGap,
      marginTop: this.marginTopInput() ?? marginTop,
      marginBottom: this.marginBottomInput() ?? marginBottom,
      marginLeft: this.marginLeftInput() ?? marginLeft,
      marginRight: this.marginRightInput() ?? marginRight,
      fontSize: this.fontSizeInput() ?? fontSize,
      boxPadding,
      boxBorderRadius,
      dotYOffsetFromBottom
    };
  });

  readonly rowY = computed(() => {
    return this.derivedDimensions().marginTop;
  });

  readonly svgHeight = computed(() => {
    return this.rowY() + this.derivedDimensions().cellHeight + this.derivedDimensions().marginBottom;
  });

  readonly rhoLineY = computed(() => {
    return this.rowY() - this.derivedDimensions().boxPadding - 6;
  });

  readonly rhoTextY = computed(() => {
    return this.rhoLineY() - 5;
  });

  readonly cells = computed<DigitDisplayCell[]>(() => {
    const r = this.center();
    const p = BigInt(this.prime());
    const valRho = this.rho();
    const left = this.digitsLeft();
    const right = this.digitsRight();

    const minPower = -right;
    const maxPower = left - 1;

    const aligned = getAlignedDigits(r, p, minPower, maxPower);
    // Reverse: highest power left, lowest power right
    const reversed = [...aligned].reverse();
    
    const val = -valRho;
    
    return reversed.map(item => {
      let uncertaintyRatio = 0.0;
      
      if (item.power >= val) {
        uncertaintyRatio = 1.0;
      } else if (item.power + 1 <= val) {
        uncertaintyRatio = 0.0;
      } else {
        uncertaintyRatio = item.power + 1 - val;
      }

      return {
        power: item.power,
        digit: item.digit,
        uncertaintyRatio
      };
    });
  });

  readonly hasUncertainty = computed(() => {
    return this.cells().some(c => c.uncertaintyRatio > 0);
  });

  readonly layout = computed(() => {
    const list = this.cells();
    const dims = this.derivedDimensions();
    const leftMargin = dims.marginLeft;
    const gap = dims.cellGap;
    const w = dims.cellWidth;
    const dotW = this.dotWidth();

    let currentX = leftMargin;
    const cellPositions: { left: number; right: number; center: number; power: number }[] = [];
    let dotX: number | null = null;

    for (let i = 0; i < list.length; i++) {
      const cell = list[i];
      if (i > 0 && list[i-1].power >= 0 && cell.power < 0) {
        dotX = currentX + gap + dotW / 2;
        currentX += gap + dotW + gap;
      } else if (i > 0) {
        currentX += gap;
      }

      const left = currentX;
      const right = currentX + w;
      const center = currentX + w / 2;
      cellPositions.push({
        left,
        right,
        center,
        power: cell.power
      });

      currentX += w;
    }

    const rowWidth = currentX - leftMargin;
    const totalWidth = currentX + dims.marginRight;
    const centerX = leftMargin + rowWidth / 2;
    return {
      cellPositions,
      dotX,
      rowWidth,
      totalWidth,
      centerX
    };
  });

  getXForIntegerPower(k: number): number {
    const lay = this.layout();
    const pos = lay.cellPositions;
    const dims = this.derivedDimensions();
    if (pos.length === 0) return dims.marginLeft;

    const maxP = pos[0].power;
    const minP = pos[pos.length - 1].power;

    if (k >= maxP + 1) {
      return dims.marginLeft - dims.boxPadding;
    }
    if (k <= minP - 1) {
      return dims.marginLeft + lay.rowWidth + dims.boxPadding;
    }

    if (k === 0 && lay.dotX !== null) {
      return lay.dotX;
    }

    const cellIdx = pos.findIndex(p => p.power === k);
    if (cellIdx === -1) {
      return dims.marginLeft;
    }

    if (k === minP) {
      return dims.marginLeft + lay.rowWidth + dims.boxPadding;
    }

    const currentRight = pos[cellIdx].right;
    const nextLeft = pos[cellIdx + 1].left;
    return (currentRight + nextLeft) / 2;
  }

  getXForValuation(val: number): number {
    const k = Math.floor(val);
    const t = val - k;
    const xK = this.getXForIntegerPower(k);
    const xKPlus1 = this.getXForIntegerPower(k + 1);
    return xK + t * (xKPlus1 - xK);
  }

  readonly rhoBoundaryX = computed(() => {
    return this.getXForValuation(-this.rho());
  });

  readonly rhoBackgroundWidth = computed(() => {
    const boundaryX = this.rhoBoundaryX();
    return Math.max(0, boundaryX - (this.derivedDimensions().marginLeft - this.derivedDimensions().boxPadding));
  });

  getDigitAtPower(power: number): number {
    const cell = this.cells().find(c => c.power === power);
    return cell ? cell.digit : 0;
  }
}

