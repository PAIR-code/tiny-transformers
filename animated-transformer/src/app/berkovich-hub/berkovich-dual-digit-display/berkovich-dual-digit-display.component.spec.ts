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
=============================================================================*/

import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { BerkovichDualDigitDisplayComponent } from './berkovich-dual-digit-display.component';

declare module 'vitest' {
  interface Assertion<T = any> {
    toMatchScreenshot(): Promise<void>;
  }
}

describe('BerkovichDualDigitDisplayComponent', () => {
  let component: BerkovichDualDigitDisplayComponent;
  let fixture: ComponentFixture<BerkovichDualDigitDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichDualDigitDisplayComponent],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();

    fixture = TestBed.createComponent(BerkovichDualDigitDisplayComponent);
    component = fixture.componentInstance;
  });

  it('should initialize and compute aligned digits layout for Point SGD target', async () => {
    fixture.componentRef.setInput('prime', 3);
    fixture.componentRef.setInput('xCenter', { num: 0n, den: 1n });
    fixture.componentRef.setInput('xRho', 0.0);
    fixture.componentRef.setInput('yCenter', { num: 5n, den: 3n }); // 1.20 in base 3
    fixture.componentRef.setInput('yRho', null);
    fixture.componentRef.setInput('xEditableCenter', true);
    fixture.componentRef.setInput('xEditableRho', true);
    fixture.componentRef.setInput('yEditableCenter', true);

    fixture.detectChanges();

    // Check cells values
    const computedCells = component.cells();
    expect(computedCells.length).toBeGreaterThan(0);

    // Verify SVG layout calculations
    const svgHeight = component.svgHeight();
    expect(svgHeight).toBe(112); // 112 for null yRho

    const totalWidth = component.layout().totalWidth;
    expect(totalWidth).toBeGreaterThan(100);

    await expect(fixture.nativeElement).toMatchScreenshot();
  });

  it('should render and compute layout correctly for Disk SGD target', async () => {
    fixture.componentRef.setInput('prime', 3);
    fixture.componentRef.setInput('xCenter', { num: 0n, den: 1n });
    fixture.componentRef.setInput('xRho', 0.5);
    fixture.componentRef.setInput('yCenter', { num: 5n, den: 3n });
    fixture.componentRef.setInput('yRho', -1.0);
    fixture.componentRef.setInput('xEditableCenter', true);
    fixture.componentRef.setInput('xEditableRho', true);
    fixture.componentRef.setInput('yEditableCenter', true);
    fixture.componentRef.setInput('yEditableRho', true);

    fixture.detectChanges();

    const svgHeight = component.svgHeight();
    expect(svgHeight).toBe(130); // 130 for non-null yRho with medium size dynamic labelOffset

    await expect(fixture.nativeElement).toMatchScreenshot();
  });

  it('should allow editing row y digits when yEditableCenter is true, preserving x non-editable', () => {
    fixture.componentRef.setInput('prime', 3);
    fixture.componentRef.setInput('xCenter', { num: 0n, den: 1n });
    fixture.componentRef.setInput('xRho', 0.0);
    fixture.componentRef.setInput('yCenter', { num: 0n, den: 1n });
    fixture.componentRef.setInput('yRho', -2.0);
    fixture.componentRef.setInput('xEditableCenter', false);
    fixture.componentRef.setInput('yEditableCenter', true);

    let emittedYCenter: any = null;
    component.yCenterChange.subscribe(c => emittedYCenter = c);

    fixture.detectChanges();

    const col = component.layout().cellPositions[0]; // power 1

    // Clicking row x should NOT activate digit
    component.onDigitClick({ stopPropagation: () => {} } as any, 'x', col);
    expect(component.activeDigit()).toBeNull();

    // Clicking row y SHOULD activate digit
    component.onDigitClick({ stopPropagation: () => {} } as any, 'y', col);
    expect(component.activeDigit()).toEqual({ row: 'y', power: 1 });

    component.isFocused.set(true);
    // Press digit '2'
    const keyEvent = new KeyboardEvent('keydown', { key: '2' });
    component.onKeyDown(keyEvent);

    expect(emittedYCenter).toEqual({ num: 6n, den: 1n }); // 2 * 3^1
  });

  it('should navigate digits with Tab across row x and row y when both are editable', () => {
    fixture.componentRef.setInput('prime', 3);
    fixture.componentRef.setInput('xCenter', { num: 0n, den: 1n });
    fixture.componentRef.setInput('xRho', 0.0);
    fixture.componentRef.setInput('yCenter', { num: 0n, den: 1n });
    fixture.componentRef.setInput('yRho', 0.0);
    fixture.componentRef.setInput('xEditableCenter', true);
    fixture.componentRef.setInput('yEditableCenter', true);

    fixture.detectChanges();

    component.isFocused.set(true);
    const powers = component.layout().cellPositions.map(c => c.power); // [1, 0, -1, -2]
    const lastPower = powers[powers.length - 1]; // -2

    // Set active digit to last power of row x
    component.activeDigit.set({ row: 'x', power: lastPower });

    // Tab key should transition to first power of row y!
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
    component.onKeyDown(tabEvent);

    expect(component.activeDigit()).toEqual({ row: 'y', power: powers[0] });
  });
});


