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

// ==========================================================================
// LAYOUT CONSTANTS
// ==========================================================================

/** Base cell width for medium sized digits display. */
const BASE_CELL_WIDTH = 20;
/** Base cell height for medium sized digits display. */
const BASE_CELL_HEIGHT = 24;
/** Base gap spacing between adjacent digit cells. */
const BASE_CELL_GAP = 4;

/** Base top margin for label guide lines above first row. */
const BASE_MARGIN_TOP = 24;
/** Base bottom margin for label guide lines below second row. */
const BASE_MARGIN_BOTTOM = 10;
/** Base left margin when labels are not left-aligned. */
const BASE_MARGIN_LEFT = 10;
/** Base left margin when labels are left-aligned (requires extra spacing). */
const BASE_MARGIN_LEFT_WITH_LEFT_LABELS = 45;
/** Base right margin spacing inside SVG box. */
const BASE_MARGIN_RIGHT = 10;
/** Base vertical gap spacing between the two digit rows. */
const BASE_ROW_GAP = 16;
/** Base font size for the digit characters. */
const BASE_DIGIT_FONT_SIZE = 12;
/** Base font size for the rho label text. */
const BASE_RHO_FONT_SIZE = 11;

/** Base padding of the outer border box from the digits sequence. */
const BASE_BOX_PADDING = 3;
/** Base border corner radius of the outer border box. */
const BASE_BOX_BORDER_RADIUS = 4;
/** Base vertical offset for decimal dot separator positioning. */
const BASE_DOT_Y_OFFSET = 8;

/** Base vertical distance from the outer border to the text label. */
const BASE_LABEL_OFFSET = 18;
/** Base spacing between text labels and their horizontal guide lines. */
const BASE_LABEL_TO_LINE_SPACING = 8;

@Component({
  selector: 'app-berkovich-dual-digit-display',
  templateUrl: './berkovich-dual-digit-display.component.html',
  styleUrls: ['./berkovich-dual-digit-display.component.scss'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BerkovichDualDigitDisplayComponent {
  private static idCounter = 0;
  readonly clipPathId1 = `row1Clip_${BerkovichDualDigitDisplayComponent.idCounter++}`;
  readonly clipPathId2 = `row2Clip_${BerkovichDualDigitDisplayComponent.idCounter++}`;

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

  // Configurable size scale factor (default 1.0)
  readonly scale = input<number>(1.0);

  // Configurable outline border colors
  readonly xOuterBoxColor = input<string>('#a855f7');
  readonly yOuterBoxColor = input<string>('#eab308');
  readonly rhoLabelPosition = input<'above-below' | 'left' | 'none'>('above-below');

  // Flexible layout & margin inputs (default to undefined to fall back to size category defaults)
  readonly cellWidthInput = input<number | undefined>(undefined, { alias: 'cellWidth' });
  readonly cellHeightInput = input<number | undefined>(undefined, { alias: 'cellHeight' });
  readonly cellGapInput = input<number | undefined>(undefined, { alias: 'cellGap' });
  readonly dotWidthInput = input<number | undefined>(undefined, { alias: 'dotWidth' });
  readonly marginTopInput = input<number | undefined>(undefined, { alias: 'marginTop' });
  readonly marginBottomInput = input<number | undefined>(undefined, { alias: 'marginBottom' });
  readonly marginLeftInput = input<number | undefined>(undefined, { alias: 'marginLeft' });
  readonly marginRightInput = input<number | undefined>(undefined, { alias: 'marginRight' });
  readonly rowGapInput = input<number | undefined>(undefined, { alias: 'rowGap' });
  readonly fontSizeInput = input<number | undefined>(undefined, { alias: 'fontSize' });

  readonly derivedDimensions = computed(() => {
    const isLeft = this.rhoLabelPosition() === 'left';
    const S = this.scale();

    const cellWidth = Math.round(BASE_CELL_WIDTH * S);
    const cellHeight = Math.round(BASE_CELL_HEIGHT * S);
    const cellGap = Math.round(BASE_CELL_GAP * S);
    const dotWidth = 0;
    const marginTop = Math.round(BASE_MARGIN_TOP * S);
    const marginBottom = Math.round(BASE_MARGIN_BOTTOM * S);
    const marginLeft = isLeft
      ? Math.round(BASE_MARGIN_LEFT_WITH_LEFT_LABELS * S)
      : Math.round(BASE_MARGIN_LEFT * S);
    const marginRight = Math.round(BASE_MARGIN_RIGHT * S);
    const rowGap = Math.round(BASE_ROW_GAP * S);
    const digitFontSize = Math.round(BASE_DIGIT_FONT_SIZE * S);
    const rhoFontSize = Math.round(BASE_RHO_FONT_SIZE * S);

    const boxPadding = Number((BASE_BOX_PADDING * S).toFixed(1));
    const boxBorderRadius = Number((BASE_BOX_BORDER_RADIUS * S).toFixed(1));
    const dotYOffsetFromBottom = Number((BASE_DOT_Y_OFFSET * S).toFixed(1));

    const labelOffset = Math.round(BASE_LABEL_OFFSET * S);
    const labelToLineSpacing = Math.round(BASE_LABEL_TO_LINE_SPACING * S);
    const guideLineOffset = labelOffset - labelToLineSpacing;

    return {
      cellWidth: this.cellWidthInput() ?? cellWidth,
      cellHeight: this.cellHeightInput() ?? cellHeight,
      cellGap: this.cellGapInput() ?? cellGap,
      dotWidth: this.dotWidthInput() ?? dotWidth,
      marginTop: this.marginTopInput() ?? marginTop,
      marginBottom: this.marginBottomInput() ?? marginBottom,
      marginLeft: this.marginLeftInput() ?? marginLeft,
      marginRight: this.marginRightInput() ?? marginRight,
      rowGap: this.rowGapInput() ?? rowGap,
      digitFontSize: this.fontSizeInput() ?? digitFontSize,
      rhoFontSize,
      boxPadding,
      boxBorderRadius,
      dotYOffsetFromBottom,
      guideLineOffset,
      labelOffset
    };
  });

  readonly row1Y = computed(() => {
    return this.derivedDimensions().marginTop;
  });

  readonly row2Y = computed(() => {
    return this.row1Y() + this.derivedDimensions().cellHeight + this.derivedDimensions().rowGap;
  });

  readonly svgHeight = computed(() => {
    const baseHeight = this.row2Y() + this.derivedDimensions().cellHeight + this.derivedDimensions().marginBottom;
    return this.yRho() !== undefined && this.yRho() !== null ? baseHeight + this.derivedDimensions().labelOffset : baseHeight;
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
    const dims = this.derivedDimensions();
    const leftMargin = dims.marginLeft;
    const gap = dims.cellGap;
    const w = dims.cellWidth;
    const dotW = dims.dotWidth;

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
    const dims = this.derivedDimensions();
    return Math.max(0, boundaryX - (dims.marginLeft - dims.boxPadding));
  });

  readonly yRhoBackgroundWidth = computed(() => {
    const boundaryX = this.yRhoBoundaryX();
    if (boundaryX === null) return 0;
    const dims = this.derivedDimensions();
    return Math.max(0, boundaryX - (dims.marginLeft - dims.boxPadding));
  });

  readonly commonShadingRange = computed(() => {
    const list = this.layout().cellPositions;
    const dims = this.derivedDimensions();
    const commonCells = list.filter(pos => this.isCommonPower(pos.power));
    if (commonCells.length === 0) return null;

    let leftX = Math.min(...commonCells.map(c => c.left)) - dims.cellGap / 2;
    // Snap to the beveled outer border edge if the left-most cell (index 0) is common
    if (list.length > 0 && this.isCommonPower(list[0].power)) {
      leftX = dims.marginLeft - dims.boxPadding;
    }

    const rightX = dims.marginLeft + this.layout().rowWidth + dims.boxPadding;
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
