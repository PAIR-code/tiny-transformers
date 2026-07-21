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

import { Component, input, signal, computed, effect, untracked, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Rational, getAlignedDigits } from '../../../lib/berkovich/berkovich';

// ==========================================================================
// LAYOUT CONSTANTS
// ==========================================================================

/** Base cell width for medium sized digits display. */
const BASE_CELL_WIDTH = 20;
/** Base cell height for medium sized digits display. */
const BASE_CELL_HEIGHT = 24;
/** Base gap spacing between adjacent digit cells. */
const BASE_CELL_GAP = 4;

/** Base top margin for label guide lines. */
const BASE_MARGIN_TOP = 32;

/** Base bottom margin spacing inside SVG box. */
const BASE_MARGIN_BOTTOM = 10;
/** Base left margin spacing inside SVG box. */
const BASE_MARGIN_LEFT = 10;
/** Base left margin when labels are left-aligned (requires extra spacing). */
const BASE_MARGIN_LEFT_WITH_LEFT_LABELS = 45;
/** Base right margin spacing inside SVG box. */
const BASE_MARGIN_RIGHT = 10;
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
const BASE_LABEL_TO_LINE_SPACING = 6;

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
    '[class.clickable]': 'isClickable()',
    '(click)': 'toggleRho($event)',
    '[style.height.px]': 'svgHeight()'
  }
})
export class BerkovichDigitDisplayComponent {
  private static idCounter = 0;
  readonly clipPathId = `rowClip_${BerkovichDigitDisplayComponent.idCounter++}`;

  readonly activePosition = signal<'above' | 'below' | 'left' | 'none' | null>(null);

  readonly displayPosition = computed(() => {
    const active = this.activePosition();
    if (active !== null) {
      return active;
    }
    return this.rhoLabelPosition();
  });

  readonly isClickable = computed(() => {
    return this.clickRhoLabelPosition() !== 'none';
  });

  toggleRho(event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
    }
    if (!this.isClickable()) {
      return;
    }
    const current = this.displayPosition();
    const initial = this.rhoLabelPosition();
    const toggle = this.clickRhoLabelPosition();

    if (current === toggle) {
      this.activePosition.set(initial);
    } else {
      this.activePosition.set(toggle);
    }
  }

  constructor() {
    effect(() => {
      this.rhoLabelPosition();
      this.clickRhoLabelPosition();
      untracked(() => {
        this.activePosition.set(null);
      });
    });
  }

  // ==========================================================================
  // COLOR & VISUAL CONSTANTS
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
  readonly rhoLabelPosition = input<'above' | 'below' | 'left' | 'none'>('none');
  readonly clickRhoLabelPosition = input<'above' | 'below' | 'left' | 'none'>('none');
  readonly digitsLeft = input<number>(2);
  readonly digitsRight = input<number>(2);

  // Configurable size scale factor (default 1.0)
  readonly scale = input<number>(1.0);

  // Flexible layout & margin inputs
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

  // Gradient / Updated Location Inputs
  readonly updatedCenter = input<Rational | undefined>(undefined);
  readonly updatedRho = input<number | undefined>(undefined);
  readonly showUpdatedLocation = input<boolean>(false);
  readonly updatedLineColor = input<string>('#64748b'); // default: grey
  readonly updatedLineStyle = input<'dotted' | 'dashed' | 'solid'>('dotted');
  readonly updatedLineExtension = input<number | undefined>(undefined);
  readonly updatedLineExtensionSide = input<'above' | 'below' | undefined>(undefined);
  readonly showGradientArrow = input<boolean>(true);

  readonly derivedDimensions = computed(() => {
    const S = this.scale();

    const isLeft = this.displayPosition() === 'left';
    const cellWidth = Math.round(BASE_CELL_WIDTH * S);
    const cellHeight = Math.round(BASE_CELL_HEIGHT * S);
    const cellGap = Math.round(BASE_CELL_GAP * S);
    const marginTop = Math.round(BASE_MARGIN_TOP * S);
    const marginBottom = Math.round(BASE_MARGIN_BOTTOM * S);
    const marginLeft = isLeft
      ? Math.round(BASE_MARGIN_LEFT_WITH_LEFT_LABELS * S)
      : Math.round(BASE_MARGIN_LEFT * S);
    const marginRight = Math.round(BASE_MARGIN_RIGHT * S);
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
      marginTop: this.marginTopInput() ?? marginTop,
      marginBottom: this.marginBottomInput() ?? marginBottom,
      marginLeft: this.marginLeftInput() ?? marginLeft,
      marginRight: this.marginRightInput() ?? marginRight,
      digitFontSize: this.fontSizeInput() ?? digitFontSize,
      rhoFontSize,
      boxPadding,
      boxBorderRadius,
      dotYOffsetFromBottom,
      guideLineOffset,
      labelOffset
    };
  });

  readonly effectiveExtensionSide = computed<'above' | 'below'>(() => {
    const side = this.updatedLineExtensionSide();
    if (side === 'above' || side === 'below') {
      return side;
    }
    if (this.displayPosition() === 'below') {
      return 'below';
    }
    return 'above';
  });

  readonly effectiveExtension = computed<number>(() => {
    const ext = this.updatedLineExtension();
    if (ext !== undefined) {
      return ext;
    }
    return this.derivedDimensions().guideLineOffset;
  });

  readonly updatedCells = computed(() => {
    const uc = this.updatedCenter();
    if (!uc) return [];
    const p = BigInt(this.prime());
    const left = this.digitsLeft();
    const right = this.digitsRight();

    const minPower = -right;
    const maxPower = left - 1;

    const aligned = getAlignedDigits(uc, p, minPower, maxPower);
    return [...aligned].reverse();
  });

  getUpdatedDigitAtPower(power: number): number | null {
    const uc = this.updatedCenter();
    if (!uc) return null;
    const cell = this.updatedCells().find(c => c.power === power);
    return cell ? cell.digit : 0;
  }

  readonly isRhoUnchanged = computed(() => {
    const ur = this.updatedRho();
    if (ur === undefined) return true;
    return Math.abs(ur - this.rho()) < 1e-6;
  });

  readonly digitBubbles = computed(() => {
    if (!this.updatedCenter() && !this.showUpdatedLocation()) return [];
    if (!this.isRhoUnchanged()) return [];

    const lay = this.layout();
    const result: { power: number; cx: number; newDigit: number; oldDigit: number }[] = [];

    for (const col of lay.cellPositions) {
      const oldD = this.getDigitAtPower(col.power);
      const newD = this.getUpdatedDigitAtPower(col.power);
      if (newD !== null && newD !== oldD) {
        result.push({
          power: col.power,
          cx: col.center,
          newDigit: newD,
          oldDigit: oldD
        });
      }
    }
    return result;
  });

  readonly bubbleCy = computed(() => {
    const dims = this.derivedDimensions();
    const side = this.effectiveExtensionSide();
    if (side === 'below') {
      return this.rowY() + dims.cellHeight + dims.boxPadding;
    } else {
      return this.rowY() - dims.boxPadding;
    }
  });

  readonly rowY = computed(() => {
    const pos = this.displayPosition();
    const dims = this.derivedDimensions();
    let top = pos === 'above' ? dims.marginTop : dims.boxPadding;
    if ((this.updatedRho() !== undefined || this.showUpdatedLocation()) && this.effectiveExtensionSide() === 'above') {
      const ext = this.effectiveExtension();
      top = Math.max(top, dims.boxPadding + ext + 4);
    }
    if (this.digitBubbles().length > 0 && this.effectiveExtensionSide() === 'above') {
      top = Math.max(top, dims.boxPadding + 10);
    }
    return top;
  });

  readonly svgHeight = computed(() => {
    const dims = this.derivedDimensions();
    const pos = this.displayPosition();
    let baseHeight = this.rowY() + dims.cellHeight + dims.marginBottom;

    if (pos === 'below') {
      baseHeight = this.rowY() + dims.cellHeight + dims.boxPadding + dims.labelOffset + dims.marginBottom;
    }
    if ((this.updatedRho() !== undefined || this.showUpdatedLocation()) && this.effectiveExtensionSide() === 'below') {
      const ext = this.effectiveExtension();
      baseHeight = Math.max(baseHeight, this.rowY() + dims.cellHeight + dims.boxPadding + ext + dims.marginBottom + 4);
    }
    if (this.digitBubbles().length > 0 && this.effectiveExtensionSide() === 'below') {
      baseHeight = Math.max(baseHeight, this.rowY() + dims.cellHeight + dims.boxPadding + 10 + dims.marginBottom);
    }
    return baseHeight;
  });

  readonly rhoLineY = computed(() => {
    const pos = this.displayPosition();
    const dims = this.derivedDimensions();
    if (pos === 'above') {
      return this.rowY() - dims.boxPadding - dims.guideLineOffset;
    } else {
      return this.rowY() + dims.cellHeight + dims.boxPadding + dims.guideLineOffset;
    }
  });

  readonly rhoTextY = computed(() => {
    const pos = this.displayPosition();
    const dims = this.derivedDimensions();
    if (pos === 'above') {
      return this.rowY() - dims.boxPadding - dims.labelOffset;
    } else {
      return this.rowY() + dims.cellHeight + dims.boxPadding + dims.labelOffset;
    }
  });

  readonly rhoVerticalLineStartY = computed(() => {
    const pos = this.displayPosition();
    const dims = this.derivedDimensions();
    if (pos === 'above') {
      return this.rowY() - dims.boxPadding;
    } else {
      return this.rowY() + dims.cellHeight + dims.boxPadding;
    }
  });

  readonly updatedRhoBoundaryX = computed(() => {
    const r = this.updatedRho();
    if (r === undefined) return null;
    return this.getXForValuation(-r);
  });

  readonly updatedRhoLineY1 = computed(() => {
    const dims = this.derivedDimensions();
    const side = this.effectiveExtensionSide();
    const ext = this.effectiveExtension();
    if (side === 'above') {
      return this.rowY() - dims.boxPadding - ext;
    } else {
      return this.rowY() - dims.boxPadding;
    }
  });

  readonly updatedRhoLineY2 = computed(() => {
    const dims = this.derivedDimensions();
    const side = this.effectiveExtensionSide();
    const ext = this.effectiveExtension();
    if (side === 'below') {
      return this.rowY() + dims.cellHeight + dims.boxPadding + ext;
    } else {
      return this.rowY() + dims.cellHeight + dims.boxPadding;
    }
  });

  readonly gradientArrowY = computed(() => {
    const side = this.effectiveExtensionSide();
    if (side === 'below') {
      return this.updatedRhoLineY2();
    } else {
      return this.updatedRhoLineY1();
    }
  });

  getArrowPolygonPoints(y: number): string {
    const currX = this.rhoBoundaryX();
    const nextX = this.updatedRhoBoundaryX();
    if (currX === null || nextX === null) return '';
    const size = 4;

    if (nextX >= currX) {
      return `${nextX},${y} ${nextX - size},${y - size} ${nextX - size},${y + size}`;
    } else {
      return `${nextX},${y} ${nextX + size},${y - size} ${nextX + size},${y + size}`;
    }
  }

  readonly cells = computed<DigitDisplayCell[]>(() => {
    const r = this.center();
    const p = BigInt(this.prime());
    const valRho = this.rho();
    const left = this.digitsLeft();
    const right = this.digitsRight();

    const minPower = -right;
    const maxPower = left - 1;

    const aligned = getAlignedDigits(r, p, minPower, maxPower);
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
