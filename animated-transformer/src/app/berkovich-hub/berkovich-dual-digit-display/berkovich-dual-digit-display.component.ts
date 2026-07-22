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

import { Component, input, output, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Rational, getAlignedDigits, parseDigitSequence, subtract, getValuation } from '../../../lib/berkovich/berkovich';

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
const BASE_MARGIN_TOP = 38;
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'style': 'display: inline-block; vertical-align: middle;',
    '[class.editable-center]': 'isAnyEditable()',
    '[attr.tabindex]': 'isAnyEditable() ? 0 : null',
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()',
    '(keydown)': 'onKeyDown($event)',
    '[style.height.px]': 'svgHeight()'
  }
})
export class BerkovichDualDigitDisplayComponent {
  private static idCounter = 0;
  readonly clipPathId1 = `row1Clip_${BerkovichDualDigitDisplayComponent.idCounter++}`;
  readonly clipPathId2 = `row2Clip_${BerkovichDualDigitDisplayComponent.idCounter++}`;

  // Focus & Editable signals
  readonly isFocused = signal<boolean>(false);
  readonly activeDigit = signal<{ row: 'x' | 'y'; power: number } | null>(null);
  readonly cursorSide = signal<'before' | 'after'>('after');
  readonly editingRhoRow = signal<'x' | 'y' | null>(null);
  readonly rhoInputString = signal<string>('');

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

  // Editing Inputs & Outputs
  readonly xEditableCenter = input<boolean>(false);
  readonly xEditableRho = input<boolean>(false);
  readonly yEditableCenter = input<boolean>(false);
  readonly yEditableRho = input<boolean>(false);
  readonly editable = input<boolean>(false);

  readonly isXCenterEditable = computed(() => this.editable() || this.xEditableCenter());
  readonly isXRhoEditable = computed(() => this.editable() || this.xEditableRho());
  readonly isYCenterEditable = computed(() => this.editable() || this.yEditableCenter());
  readonly isYRhoEditable = computed(() => this.editable() || this.yEditableRho());

  readonly isAnyEditable = computed(() =>
    this.isXCenterEditable() || this.isXRhoEditable() || this.isYCenterEditable() || this.isYRhoEditable()
  );

  readonly xCenterChange = output<Rational>();
  readonly xCenterInputChange = output<string>();
  readonly xRhoChange = output<number>();
  readonly xRhoInputChange = output<string>();
  readonly yCenterChange = output<Rational>();
  readonly yCenterInputChange = output<string>();
  readonly yRhoChange = output<number>();
  readonly yRhoInputChange = output<string>();

  // Configurable size scale factor (default 1.0)
  readonly scale = input<number>(1.0);

  // Configurable outline border colors
  readonly xOuterBoxColorInput = input<string | undefined>(undefined, { alias: 'xOuterBoxColor' });
  readonly yOuterBoxColorInput = input<string | undefined>(undefined, { alias: 'yOuterBoxColor' });

  readonly xOuterBoxColor = computed(() => {
    const custom = this.xOuterBoxColorInput();
    if (custom !== undefined) {
      return custom;
    }
    if (!this.isXCenterEditable() && !this.isXRhoEditable()) {
      return '#64748b';
    }
    return '#a855f7';
  });

  readonly yOuterBoxColor = computed(() => {
    const custom = this.yOuterBoxColorInput();
    if (custom !== undefined) {
      return custom;
    }
    if (!this.isYCenterEditable() && !this.isYRhoEditable()) {
      return '#64748b';
    }
    return '#eab308';
  });
  readonly rhoLabelPosition = input<'above-below' | 'left' | 'none'>('above-below');

  // Gradient / Updated Location Inputs
  readonly xUpdatedCenter = input<Rational | undefined>(undefined);
  readonly xUpdatedRho = input<number | undefined>(undefined);
  readonly showUpdatedLocation = input<boolean>(false);
  readonly updatedLineColor = input<string>('#64748b');
  readonly updatedLineStyle = input<'dotted' | 'dashed' | 'solid'>('dotted');

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

  readonly xUpdatedCells = computed(() => {
    const uc = this.xUpdatedCenter();
    if (!uc) return [];
    const p = BigInt(this.prime());
    const left = this.digitsLeft();
    const right = this.digitsRight();

    const minPower = -right;
    const maxPower = left - 1;

    const aligned = getAlignedDigits(uc, p, minPower, maxPower);
    return [...aligned].reverse();
  });

  getXUpdatedDigitAtPower(power: number): number | null {
    const uc = this.xUpdatedCenter();
    if (!uc) return null;
    const cell = this.xUpdatedCells().find(c => c.power === power);
    return cell ? cell.digit : 0;
  }

  readonly isXRhoUnchanged = computed(() => {
    const ur = this.xUpdatedRho();
    if (ur === undefined) return true;
    return Math.abs(ur - this.xRho()) < 1e-6;
  });

  readonly xDigitBubbles = computed(() => {
    if (!this.xUpdatedCenter() && !this.showUpdatedLocation()) return [];
    if (!this.isXRhoUnchanged()) return [];

    const lay = this.layout();
    const result: { power: number; cx: number; newDigit: number; oldDigit: number }[] = [];

    for (const col of lay.cellPositions) {
      const oldD = this.getXDigitAtPower(col.power);
      const newD = this.getXUpdatedDigitAtPower(col.power);
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

  readonly xUpdatedRhoBoundaryX = computed(() => {
    const r = this.xUpdatedRho();
    if (r === undefined) return null;
    return this.getXForValuation(-r);
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

  readonly firstMismatchColumn = computed(() => {
    const list = this.cells();
    const layoutPositions = this.layout().cellPositions;

    let lowestMismatchPower: number | null = null;
    for (const cell of list) {
      if (cell.xDigit !== cell.yDigit) {
        if (lowestMismatchPower === null || cell.power < lowestMismatchPower) {
          lowestMismatchPower = cell.power;
        }
      }
    }

    if (lowestMismatchPower === null) return null;
    return layoutPositions.find(p => p.power === lowestMismatchPower) ?? null;
  });

  readonly squigglyPathD = computed(() => {
    const col = this.firstMismatchColumn();
    if (!col) return '';
    const dims = this.derivedDimensions();
    const S = this.scale();
    // Position halfway between bottom of digit text and bottom outline border
    const digitBottom = this.row1Y() + dims.cellHeight / 2 + dims.digitFontSize * 0.4;
    const borderBottom = this.row1Y() + dims.cellHeight + dims.boxPadding;
    const y = (digitBottom + borderBottom) / 2;

    const x1 = col.left + 2 * S;
    const x2 = col.right - 2 * S;
    const w = x2 - x1;
    const mid = (x1 + x2) / 2;
    const q1 = x1 + w * 0.25;
    const amp = 1.8 * S;
    return `M ${x1} ${y} Q ${q1} ${y - amp}, ${mid} ${y} T ${x2} ${y}`;
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

  // ==========================================================================
  // EDITING INTERACTION HANDLERS
  // ==========================================================================

  onFocus() {
    this.isFocused.set(true);
  }

  onBlur() {
    if (this.editingRhoRow() === null) {
      this.isFocused.set(false);
    }
  }

  onRhoLabelClick(event: MouseEvent, row: 'x' | 'y') {
    const isEditable = row === 'x' ? this.isXRhoEditable() : this.isYRhoEditable();
    if (!isEditable) {
      return;
    }
    event.stopPropagation();
    this.isFocused.set(true);
    this.activeDigit.set(null);
    const currentRho = row === 'x' ? this.xRho() : (this.yRho() ?? 0);
    this.rhoInputString.set(currentRho.toFixed(2));
    this.editingRhoRow.set(row);

    const targetEl = event.currentTarget as HTMLElement | null;
    setTimeout(() => {
      const hostEl = targetEl?.closest('app-berkovich-dual-digit-display');
      const inputEl = hostEl?.querySelector('.rho-inline-editor') as HTMLInputElement;
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    }, 0);
  }

  commitRhoEdit() {
    const row = this.editingRhoRow();
    if (!row) return;
    const val = parseFloat(this.rhoInputString());
    if (!isNaN(val)) {
      const clamped = Math.max(-2, Math.min(2, val));
      if (row === 'x') {
        this.xRhoChange.emit(clamped);
        this.xRhoInputChange.emit(clamped.toString());
      } else {
        this.yRhoChange.emit(clamped);
        this.yRhoInputChange.emit(clamped.toString());
      }
    }
    this.editingRhoRow.set(null);
    this.isFocused.set(false);
  }

  cancelRhoEdit() {
    this.editingRhoRow.set(null);
    this.isFocused.set(false);
  }

  findClosestDigitCursor(clickSvgX: number, cellPositions: { power: number; center: number }[]): { power: number; side: 'before' | 'after' } {
    if (cellPositions.length === 0) {
      return { power: 0, side: 'after' };
    }

    let closestCol = cellPositions[0];
    let minDistance = Math.abs(clickSvgX - closestCol.center);

    for (let i = 1; i < cellPositions.length; i++) {
      const dist = Math.abs(clickSvgX - cellPositions[i].center);
      if (dist < minDistance) {
        minDistance = dist;
        closestCol = cellPositions[i];
      }
    }

    const side: 'before' | 'after' = clickSvgX < closestCol.center ? 'before' : 'after';
    return { power: closestCol.power, side };
  }

  onRowClick(event: MouseEvent, row: 'x' | 'y', targetCol?: { power: number; center: number }) {
    const isEditable = row === 'x' ? this.isXCenterEditable() : this.isYCenterEditable();
    if (!isEditable) {
      return;
    }
    event.stopPropagation();
    this.isFocused.set(true);
    this.editingRhoRow.set(null);

    const targetEl = event.currentTarget as HTMLElement | SVGElement | null;
    const svgTarget = targetEl && typeof targetEl.closest === 'function' ? targetEl.closest('svg') : null;
    const measureEl = svgTarget || (targetEl && typeof targetEl.getBoundingClientRect === 'function' ? targetEl : null);

    if (measureEl && typeof measureEl.getBoundingClientRect === 'function') {
      const rect = measureEl.getBoundingClientRect();
      const totalW = this.layout().totalWidth;
      let svgX: number;

      if (svgTarget && rect.width > 0 && totalW > 0) {
        const svgScale = rect.width / totalW;
        svgX = (event.clientX - rect.left) / svgScale;
      } else {
        const clickX = event.clientX - rect.left;
        const colCenter = targetCol ? targetCol.center : (this.layout().cellPositions[0]?.center ?? 0);
        svgX = clickX < rect.width / 2 ? colCenter - 1 : colCenter + 1;
      }
      const result = this.findClosestDigitCursor(svgX, this.layout().cellPositions);
      this.activeDigit.set({ row, power: result.power });
      this.cursorSide.set(result.side);
    } else {
      const fallbackPower = targetCol?.power ?? this.layout().cellPositions[0]?.power ?? 0;
      this.activeDigit.set({ row, power: fallbackPower });
      this.cursorSide.set('after');
    }
  }

  onDigitClick(event: MouseEvent, row: 'x' | 'y', col: { left: number; right: number; center: number; power: number }) {
    this.onRowClick(event, row, col);
  }

  onKeyDown(event: KeyboardEvent) {
    if (!this.isFocused()) return;

    const active = this.activeDigit();
    if (active !== null) {
      const isEditable = active.row === 'x' ? this.isXCenterEditable() : this.isYCenterEditable();
      if (isEditable) {
        const positions = this.layout().cellPositions;
        const powers = positions.map(c => c.power);
        const currentIndex = powers.indexOf(active.power);
        const currentSide = this.cursorSide();

        if (event.key === 'Tab') {
          event.preventDefault();
          if (currentIndex !== -1) {
            if (!event.shiftKey) {
              if (currentIndex < powers.length - 1) {
                this.activeDigit.set({ row: active.row, power: powers[currentIndex + 1] });
              } else if (active.row === 'x' && this.isYCenterEditable()) {
                this.activeDigit.set({ row: 'y', power: powers[0] });
              } else {
                this.activeDigit.set({ row: active.row, power: powers[0] });
              }
            } else {
              if (currentIndex > 0) {
                this.activeDigit.set({ row: active.row, power: powers[currentIndex - 1] });
              } else if (active.row === 'y' && this.isXCenterEditable()) {
                this.activeDigit.set({ row: 'x', power: powers[powers.length - 1] });
              } else {
                this.activeDigit.set({ row: active.row, power: powers[powers.length - 1] });
              }
            }
            this.cursorSide.set('after');
          }
          return;
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          if (currentSide === 'before') {
            this.cursorSide.set('after');
          } else if (currentIndex < powers.length - 1) {
            this.activeDigit.set({ row: active.row, power: powers[currentIndex + 1] });
            this.cursorSide.set('after');
          } else if (active.row === 'x' && this.isYCenterEditable()) {
            this.activeDigit.set({ row: 'y', power: powers[0] });
            this.cursorSide.set('after');
          }
          return;
        }

        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          if (currentSide === 'after') {
            this.cursorSide.set('before');
          } else if (currentIndex > 0) {
            this.activeDigit.set({ row: active.row, power: powers[currentIndex - 1] });
            this.cursorSide.set('before');
          } else if (active.row === 'y' && this.isXCenterEditable()) {
            this.activeDigit.set({ row: 'x', power: powers[powers.length - 1] });
            this.cursorSide.set('before');
          }
          return;
        }

        if (event.key === 'Backspace') {
          event.preventDefault();
          if (currentSide === 'after') {
            this.replaceDigitAtPower(active.row, active.power, 0);
            this.cursorSide.set('before');
          } else {
            // Cursor is at start of digit ('before'): jump to previous digit
            if (currentIndex > 0) {
              this.activeDigit.set({ row: active.row, power: powers[currentIndex - 1] });
              this.cursorSide.set('after');
            } else if (active.row === 'y' && this.isXCenterEditable()) {
              this.activeDigit.set({ row: 'x', power: powers[powers.length - 1] });
              this.cursorSide.set('after');
            }
          }
          return;
        }

        if (event.key === 'Delete') {
          event.preventDefault();
          if (currentSide === 'before') {
            this.replaceDigitAtPower(active.row, active.power, 0);
          } else if (currentIndex < powers.length - 1) {
            const nextPower = powers[currentIndex + 1];
            this.replaceDigitAtPower(active.row, nextPower, 0);
            this.activeDigit.set({ row: active.row, power: nextPower });
            this.cursorSide.set('before');
          }
          return;
        }

        if (event.key === 'ArrowDown' && active.row === 'x' && this.isYCenterEditable()) {
          event.preventDefault();
          this.activeDigit.set({ row: 'y', power: active.power });
          return;
        }

        if (event.key === 'ArrowUp' && active.row === 'y' && this.isXCenterEditable()) {
          event.preventDefault();
          this.activeDigit.set({ row: 'x', power: active.power });
          return;
        }

        if (event.key === 'Escape') {
          this.activeDigit.set(null);
          this.isFocused.set(false);
          return;
        }

        if (/^\d$/.test(event.key)) {
          const digitVal = parseInt(event.key, 10);
          const p = this.prime();
          if (digitVal < p) {
            this.replaceDigitAtPower(active.row, active.power, digitVal);
            if (currentSide === 'before') {
              this.cursorSide.set('after');
            } else if (currentIndex < powers.length - 1) {
              this.activeDigit.set({ row: active.row, power: powers[currentIndex + 1] });
              this.cursorSide.set('after');
            } else if (active.row === 'x' && this.isYCenterEditable()) {
              this.activeDigit.set({ row: 'y', power: powers[0] });
              this.cursorSide.set('after');
            }
          }
          return;
        }
      }
    }

    if (this.editingRhoRow() !== null) {
      if (event.key === 'Enter') {
        this.commitRhoEdit();
      } else if (event.key === 'Escape') {
        this.cancelRhoEdit();
      }
    }
  }

  replaceDigitAtPower(row: 'x' | 'y', targetPower: number, newDigit: number) {
    const p = BigInt(this.prime());
    const left = this.digitsLeft();
    const right = this.digitsRight();
    const centerVal = row === 'x' ? this.xCenter() : this.yCenter();
    const aligned = getAlignedDigits(centerVal, p, -right, left - 1);

    let leftStr = '';
    for (let pow = left - 1; pow >= 0; pow--) {
      const d = pow === targetPower ? newDigit : (aligned.find(item => item.power === pow)?.digit ?? 0);
      leftStr += d.toString();
    }

    let rightStr = '';
    for (let pow = -1; pow >= -right; pow--) {
      const d = pow === targetPower ? newDigit : (aligned.find(item => item.power === pow)?.digit ?? 0);
      rightStr += d.toString();
    }

    const formattedStr = rightStr.length > 0 ? `${leftStr}.${rightStr}` : leftStr;
    try {
      const newCenter = parseDigitSequence(formattedStr, p, { minPower: -right, maxPower: left - 1 });
      if (row === 'x') {
        this.xCenterChange.emit(newCenter);
        this.xCenterInputChange.emit(formattedStr);
      } else {
        this.yCenterChange.emit(newCenter);
        this.yCenterInputChange.emit(formattedStr);
      }
    } catch (e) {
      console.error('Failed to parse updated digit sequence:', e);
    }
  }
}


