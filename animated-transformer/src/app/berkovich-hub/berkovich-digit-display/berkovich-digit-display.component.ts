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

import { Component, input, output, signal, computed, effect, untracked, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Rational, getAlignedDigits, parseDigitSequence } from '../../../lib/berkovich/berkovich';

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
const BASE_MARGIN_TOP = 38;

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
    '[class.editable-center]': 'isCenterEditable()',
    '[class.clickable]': 'isClickable() || isRhoEditable()',
    '[attr.tabindex]': '(isCenterEditable() || isRhoEditable()) ? 0 : null',
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()',
    '(click)': 'onHostClick($event)',
    '(keydown)': 'onKeyDown($event)',
    '[style.height.px]': 'svgHeight()'
  }
})
export class BerkovichDigitDisplayComponent {
  private static idCounter = 0;
  readonly clipPathId = `rowClip_${BerkovichDigitDisplayComponent.idCounter++}`;

  readonly activePosition = signal<'above' | 'below' | 'left' | 'none' | null>(null);

  // Focus & Editable signals
  readonly isFocused = signal<boolean>(false);
  readonly activeDigitPower = signal<number | null>(null);
  readonly cursorSide = signal<'before' | 'after'>('after');
  readonly isEditingRho = signal<boolean>(false);
  readonly rhoInputString = signal<string>('');

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

  // Editing Inputs & Outputs
  readonly editable = input<boolean>(false);
  readonly editableCenter = input<boolean>(false);
  readonly editableRho = input<boolean>(false);

  readonly isCenterEditable = computed(() => this.editable() || this.editableCenter());
  readonly isRhoEditable = computed(() => this.editable() || this.editableRho());

  readonly centerChange = output<Rational>();
  readonly centerInputChange = output<string>();
  readonly rhoChange = output<number>();
  readonly rhoInputChange = output<string>();

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

  // ==========================================================================
  // EDITING INTERACTION HANDLERS
  // ==========================================================================

  onFocus() {
    this.isFocused.set(true);
  }

  onBlur() {
    if (!this.isEditingRho()) {
      this.isFocused.set(false);
    }
  }

  onHostClick(event: MouseEvent) {
    if (!this.isCenterEditable() && !this.isRhoEditable()) {
      this.toggleRho(event);
    }
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

  onRowClick(event: MouseEvent, targetCol?: { power: number; center: number }) {
    if (!this.isCenterEditable()) {
      return;
    }
    event.stopPropagation();
    this.isFocused.set(true);
    this.isEditingRho.set(false);

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
      this.activeDigitPower.set(result.power);
      this.cursorSide.set(result.side);
    } else {
      const fallbackPower = targetCol?.power ?? this.layout().cellPositions[0]?.power ?? 0;
      this.activeDigitPower.set(fallbackPower);
      this.cursorSide.set('after');
    }
  }

  onDigitClick(event: MouseEvent, col: { left: number; right: number; center: number; power: number }) {
    this.onRowClick(event, col);
  }

  onRhoLabelClick(event: MouseEvent) {
    if (!this.isRhoEditable()) {
      this.toggleRho(event);
      return;
    }
    event.stopPropagation();
    this.isFocused.set(true);
    this.activeDigitPower.set(null);
    this.rhoInputString.set(this.rho().toFixed(2));
    this.isEditingRho.set(true);

    const targetEl = event.currentTarget as HTMLElement | null;
    setTimeout(() => {
      const hostEl = targetEl?.closest('app-berkovich-digit-display');
      const inputEl = hostEl?.querySelector('.rho-inline-editor') as HTMLInputElement;
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    }, 0);
  }

  commitRhoEdit() {
    if (!this.isEditingRho()) return;
    const val = parseFloat(this.rhoInputString());
    if (!isNaN(val)) {
      const clamped = Math.max(-2, Math.min(2, val));
      this.rhoChange.emit(clamped);
      this.rhoInputChange.emit(clamped.toString());
    }
    this.isEditingRho.set(false);
    this.isFocused.set(false);
  }

  cancelRhoEdit() {
    this.isEditingRho.set(false);
    this.isFocused.set(false);
  }

  onKeyDown(event: KeyboardEvent) {
    if (!this.isFocused()) return;

    const activePower = this.activeDigitPower();
    if (activePower !== null && this.isCenterEditable()) {
      const positions = this.layout().cellPositions;
      const powers = positions.map(c => c.power);
      const currentIndex = powers.indexOf(activePower);
      const currentSide = this.cursorSide();

      if (event.key === 'Tab') {
        event.preventDefault();
        if (currentIndex !== -1) {
          let nextIndex: number;
          if (event.shiftKey) {
            nextIndex = (currentIndex - 1 + powers.length) % powers.length;
          } else {
            nextIndex = (currentIndex + 1) % powers.length;
          }
          this.activeDigitPower.set(powers[nextIndex]);
          this.cursorSide.set('after');
        }
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (currentSide === 'before') {
          this.cursorSide.set('after');
        } else if (currentIndex < powers.length - 1) {
          this.activeDigitPower.set(powers[currentIndex + 1]);
          this.cursorSide.set('after');
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (currentSide === 'after') {
          this.cursorSide.set('before');
        } else if (currentIndex > 0) {
          this.activeDigitPower.set(powers[currentIndex - 1]);
          this.cursorSide.set('before');
        }
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        if (currentSide === 'after') {
          this.replaceDigitAtPower(activePower, 0);
          this.cursorSide.set('before');
        } else {
          // Cursor is at start of digit ('before'): jump to previous digit
          if (currentIndex > 0) {
            this.activeDigitPower.set(powers[currentIndex - 1]);
            this.cursorSide.set('after');
          }
        }
        return;
      }

      if (event.key === 'Delete') {
        event.preventDefault();
        if (currentSide === 'before') {
          this.replaceDigitAtPower(activePower, 0);
        } else if (currentIndex < powers.length - 1) {
          const nextPower = powers[currentIndex + 1];
          this.replaceDigitAtPower(nextPower, 0);
          this.activeDigitPower.set(nextPower);
          this.cursorSide.set('before');
        }
        return;
      }

      if (event.key === 'Escape') {
        this.activeDigitPower.set(null);
        this.isFocused.set(false);
        return;
      }

      if (/^\d$/.test(event.key)) {
        const digitVal = parseInt(event.key, 10);
        const p = this.prime();
        if (digitVal < p) {
          this.replaceDigitAtPower(activePower, digitVal);
          if (currentSide === 'before') {
            this.cursorSide.set('after');
          } else if (currentIndex < powers.length - 1) {
            this.activeDigitPower.set(powers[currentIndex + 1]);
            this.cursorSide.set('after');
          }
        }
        return;
      }
    }

    if (this.isEditingRho()) {
      if (event.key === 'Enter') {
        this.commitRhoEdit();
      } else if (event.key === 'Escape') {
        this.cancelRhoEdit();
      }
    }
  }

  replaceDigitAtPower(targetPower: number, newDigit: number) {
    const p = BigInt(this.prime());
    const left = this.digitsLeft();
    const right = this.digitsRight();
    const aligned = getAlignedDigits(this.center(), p, -right, left - 1);

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
      this.centerChange.emit(newCenter);
      this.centerInputChange.emit(formattedStr);
    } catch (e) {
      console.error('Failed to parse updated digit sequence:', e);
    }
  }
}


