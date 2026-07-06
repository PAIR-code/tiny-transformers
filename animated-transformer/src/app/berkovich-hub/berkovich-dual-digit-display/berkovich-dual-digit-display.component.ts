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

import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Rational, getAlignedDigits, subtract, getValuation } from '../../../lib/berkovich/berkovich';

@Component({
  selector: 'app-berkovich-dual-digit-display',
  templateUrl: './berkovich-dual-digit-display.component.html',
  styleUrls: ['./berkovich-dual-digit-display.component.scss'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichDualDigitDisplayComponent {
  // ==========================================================================
  // VISUAL LAYOUT & STYLING CONSTANTS
  // Modify these values to adjust sizes, margins, gaps, and borders.
  // ==========================================================================
  /** Width of an individual digit cell box. */
  readonly CELL_WIDTH = 20;
  /** Height of an individual digit cell box. */
  readonly CELL_HEIGHT = 24;
  /** Horizontal gap between adjacent digit cell boxes. */
  readonly CELL_GAP = 4;
  /** Width allocated for the decimal dot separator. */
  readonly DOT_WIDTH = 0;

  /** Top margin of the SVG viewport (space above the first row). */
  readonly MARGIN_TOP = 30;
  /** Bottom margin of the SVG viewport (space below the second row). */
  readonly MARGIN_BOTTOM = 30;
  /** Left margin of the SVG viewport (leaves room for the editor overlay on the left). */
  readonly MARGIN_LEFT = 140;
  /** Right margin of the SVG viewport (leaves room for the rho value labels on the right). */
  readonly MARGIN_RIGHT = 110;

  /** Vertical gap between the first row (x) and the second row (y). */
  readonly ROW_GAP = 20;

  /** Padding around the digit sequence row to the outer beveled border. */
  readonly BOX_PADDING = 4;
  /** Bevel radius for the outer border corners. */
  readonly BOX_BORDER_RADIUS = 6;

  // ==========================================================================
  // COLOR, OPACITY, & INSET CONSTANTS
  // ==========================================================================
  /** Base background color of the digit sequence row container (white). */
  readonly COLOR_ROW_BG = '#ffffff';

  /** Color of the rho-value uncertainty shading (grey). */
  readonly COLOR_RHO_SHADING = '#7d8288ff'; 
  /** Opacity of the rho-value uncertainty shading. */
  readonly OPACITY_RHO_SHADING = 0.3;

  /** Color of the common matching digits background (vibrant green). */
  readonly COLOR_COMMON_SHADING = '#16a34a';
  /** Opacity of the common matching digits background. */
  readonly OPACITY_COMMON_SHADING = 0.3;

  /** Inset padding of the inner white digit box within its cell slot. */
  readonly DIGIT_BOX_INSET = 1.5;

  /** Distance of the decimal dot separator from the bottom of the digit row. */
  readonly DOT_Y_OFFSET_FROM_BOTTOM = 10;

  /** Radius size of the decimal dot separator. */
  readonly DOT_RADIUS = 1.5;
  /** Color of the decimal dot separator (soft slate-400 grey). */
  readonly COLOR_DOT = '#666';

  // Inputs
  readonly prime = input.required<number>();
  readonly xCenter = input.required<Rational>();
  readonly xRho = input.required<number>();
  readonly yCenter = input.required<Rational>();
  readonly yRho = input<number | null | undefined>();

  readonly digitsLeft = input<number>(2);
  readonly digitsRight = input<number>(2);

  readonly row1Y = this.MARGIN_TOP;
  readonly row2Y = this.MARGIN_TOP + this.CELL_HEIGHT + this.ROW_GAP;

  readonly svgHeight = computed(() => {
    const baseHeight = this.row2Y + this.CELL_HEIGHT + this.MARGIN_BOTTOM;
    return this.yRho() !== undefined && this.yRho() !== null ? baseHeight + 15 : baseHeight;
  });

  // Calculate digit cells for alignment
  readonly cells = computed(() => {
    const px = BigInt(this.prime());
    const xc = this.xCenter();
    const yc = this.yCenter();
    const left = this.digitsLeft();
    const right = this.digitsRight();

    const minPower = -right;
    const maxPower = left - 1;

    const xDigits = getAlignedDigits(xc, px, minPower, maxPower);
    const yDigits = getAlignedDigits(yc, px, minPower, maxPower);

    // We reverse so highest power is on the left
    const reversedX = [...xDigits].reverse();
    const reversedY = [...yDigits].reverse();

    // Calculate branching valuation d of xc and yc
    const diff = subtract(xc, yc);
    const val = getValuation(diff, px);

    const cellsList: {
      power: number;
      xDigit: number;
      yDigit: number;
      isCommon: boolean;
    }[] = [];

    for (let i = 0; i < reversedX.length; i++) {
      const power = reversedX[i].power;
      const xDigit = reversedX[i].digit;
      const yDigit = reversedY[i].digit;

      const isCommon = val.type === 'pos-infinity' || (val.type === 'finite' && power < val.value);

      cellsList.push({
        power,
        xDigit,
        yDigit,
        isCommon
      });
    }

    return cellsList;
  });

  // Layout positions of cells
  readonly layout = computed(() => {
    const list = this.cells();
    const leftMargin = this.MARGIN_LEFT;
    const gap = this.CELL_GAP;
    const w = this.CELL_WIDTH;
    const dotW = this.DOT_WIDTH;

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
    const totalWidth = currentX + this.MARGIN_RIGHT;
    return {
      cellPositions,
      dotX,
      rowWidth,
      totalWidth
    };
  });

  getXForIntegerPower(k: number): number {
    const lay = this.layout();
    const pos = lay.cellPositions;
    if (pos.length === 0) return this.MARGIN_LEFT;

    const maxP = pos[0].power;
    const minP = pos[pos.length - 1].power;

    if (k >= maxP + 1) {
      return this.MARGIN_LEFT - this.BOX_PADDING;
    }
    if (k <= minP - 1) {
      return this.MARGIN_LEFT + lay.rowWidth + this.BOX_PADDING;
    }

    if (k === 0 && lay.dotX !== null) {
      return lay.dotX;
    }

    const cellIdx = pos.findIndex(p => p.power === k);
    if (cellIdx === -1) {
      return this.MARGIN_LEFT;
    }

    if (k === minP) {
      return this.MARGIN_LEFT + lay.rowWidth + this.BOX_PADDING;
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

  readonly xRhoBoundaryX = computed(() => {
    return this.getXForValuation(-this.xRho());
  });

  readonly yRhoBoundaryX = computed(() => {
    const yrho = this.yRho();
    if (yrho === undefined || yrho === null) return null;
    return this.getXForValuation(-yrho);
  });

  readonly xRhoBackgroundWidth = computed(() => {
    const boundaryX = this.xRhoBoundaryX();
    return Math.max(0, boundaryX - (this.MARGIN_LEFT - this.BOX_PADDING));
  });

  readonly yRhoBackgroundWidth = computed(() => {
    const boundaryX = this.yRhoBoundaryX();
    if (boundaryX === null) return 0;
    return Math.max(0, boundaryX - (this.MARGIN_LEFT - this.BOX_PADDING));
  });

  readonly commonShadingRange = computed(() => {
    const list = this.layout().cellPositions;
    const commonCells = list.filter(pos => this.isCommonPower(pos.power));
    if (commonCells.length === 0) return null;

    let leftX = Math.min(...commonCells.map(c => c.left)) - this.CELL_GAP / 2;
    // Snap to the beveled outer border edge if the left-most cell (index 0) is common
    if (list.length > 0 && this.isCommonPower(list[0].power)) {
      leftX = this.MARGIN_LEFT - this.BOX_PADDING;
    }

    const rightX = this.MARGIN_LEFT + this.layout().rowWidth + this.BOX_PADDING;
    return {
      left: leftX,
      width: rightX - leftX
    };
  });

  isCommonPower(power: number): boolean {
    const cell = this.cells().find(c => c.power === power);
    return cell ? cell.isCommon : false;
  }

  getXDigitAtPower(power: number): number {
    const cell = this.cells().find(c => c.power === power);
    return cell ? cell.xDigit : 0;
  }

  getYDigitAtPower(power: number): number {
    const cell = this.cells().find(c => c.power === power);
    return cell ? cell.yDigit : 0;
  }
}
