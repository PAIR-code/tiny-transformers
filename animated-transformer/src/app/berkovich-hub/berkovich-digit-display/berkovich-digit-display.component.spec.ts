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

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { BerkovichDigitDisplayComponent } from './berkovich-digit-display.component';

describe('BerkovichDigitDisplayComponent', () => {
  let component: BerkovichDigitDisplayComponent;
  let fixture: ComponentFixture<BerkovichDigitDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichDigitDisplayComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BerkovichDigitDisplayComponent);
    component = fixture.componentInstance;
  });

  it('should create and calculate cells with uncertainty based on rho', () => {
    fixture.componentRef.setInput('center', { num: 1n, den: 3n });
    fixture.componentRef.setInput('rho', 0.0);
    fixture.componentRef.setInput('prime', 3);

    fixture.detectChanges();

    const cells = component.cells();
    expect(cells.length).toBe(4);

    expect(cells[0].power).toBe(1);
    expect(cells[1].power).toBe(0);
    expect(cells[2].power).toBe(-1);
    expect(cells[3].power).toBe(-2);

    expect(cells[0].uncertaintyRatio).toBe(1.0);
    expect(cells[1].uncertaintyRatio).toBe(1.0);
    expect(cells[2].uncertaintyRatio).toBe(0.0);
    expect(cells[3].uncertaintyRatio).toBe(0.0);
  });

  it('should compute fractional uncertainty ratios correctly', () => {
    fixture.componentRef.setInput('center', { num: 1n, den: 3n });
    fixture.componentRef.setInput('rho', -0.3); // val = -rho = 0.3
    fixture.componentRef.setInput('prime', 3);

    fixture.detectChanges();

    const cells = component.cells();
    expect(cells[0].uncertaintyRatio).toBe(1.0); // k = 1 >= 0.3
    expect(cells[1].uncertaintyRatio).toBeCloseTo(0.7, 5); // k = 0 (transition: 0 + 1 - 0.3 = 0.7)
    expect(cells[2].uncertaintyRatio).toBe(0.0); // k = -1 (k+1 = 0 <= 0.3)
    expect(cells[3].uncertaintyRatio).toBe(0.0);
  });

  it('should enable digit selection and cursor marker positioning when editableCenter is true', () => {
    fixture.componentRef.setInput('center', { num: 1n, den: 1n });
    fixture.componentRef.setInput('rho', 0.0);
    fixture.componentRef.setInput('prime', 3);
    fixture.componentRef.setInput('editableCenter', true);

    fixture.detectChanges();

    const col = component.layout().cellPositions[0]; // power 1
    const mockEvent = {
      stopPropagation: () => {},
      currentTarget: {
        getBoundingClientRect: () => ({ left: 100, width: 20 })
      },
      clientX: 105 // left half
    } as any;

    component.onDigitClick(mockEvent, col);
    expect(component.activeDigitPower()).toBe(1);
    expect(component.cursorSide()).toBe('before');
  });

  it('should replace digit, emit centerChange, and advance to next digit on digit key press', () => {
    fixture.componentRef.setInput('center', { num: 0n, den: 1n });
    fixture.componentRef.setInput('rho', 0.0);
    fixture.componentRef.setInput('prime', 3);
    fixture.componentRef.setInput('editableCenter', true);

    let emittedCenter: any = null;
    component.centerChange.subscribe(c => emittedCenter = c);

    fixture.detectChanges();

    component.isFocused.set(true);
    // Select digit at power 0
    component.activeDigitPower.set(0);
    component.cursorSide.set('after');

    // Type digit '2'
    const keyEvent = new KeyboardEvent('keydown', { key: '2' });
    component.onKeyDown(keyEvent);

    expect(emittedCenter).toEqual({ num: 2n, den: 1n });
    // Should advance to next digit (power -1)
    expect(component.activeDigitPower()).toBe(-1);
  });

  it('should handle Backspace deletion and jumping to previous digit', () => {
    fixture.componentRef.setInput('center', { num: 2n, den: 1n }); // 02.00
    fixture.componentRef.setInput('rho', 0.0);
    fixture.componentRef.setInput('prime', 3);
    fixture.componentRef.setInput('editableCenter', true);

    let emittedCenter: any = null;
    component.centerChange.subscribe(c => emittedCenter = c);

    fixture.detectChanges();

    component.isFocused.set(true);
    // Position cursor to the right of digit at power 0 (digit '2')
    component.activeDigitPower.set(0);
    component.cursorSide.set('after');

    // Press Backspace: resets digit 2 to 0 and moves cursor before digit 0
    const bsEvent = new KeyboardEvent('keydown', { key: 'Backspace' });
    component.onKeyDown(bsEvent);

    expect(emittedCenter).toEqual({ num: 0n, den: 1n });
    expect(component.cursorSide()).toBe('before');

    // Press Backspace again when cursor is 'before' power 0: jumps to previous digit (power 1, 'after')
    component.onKeyDown(bsEvent);
    expect(component.activeDigitPower()).toBe(1);
    expect(component.cursorSide()).toBe('after');
  });

  it('should handle Tab and Shift-Tab digit navigation', () => {
    fixture.componentRef.setInput('center', { num: 0n, den: 1n });
    fixture.componentRef.setInput('rho', 0.0);
    fixture.componentRef.setInput('prime', 3);
    fixture.componentRef.setInput('editableCenter', true);

    fixture.detectChanges();

    component.isFocused.set(true);
    // Select digit at power 1
    component.activeDigitPower.set(1);

    // Tab key
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
    component.onKeyDown(tabEvent);
    expect(component.activeDigitPower()).toBe(0);

    // Shift + Tab key
    const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    component.onKeyDown(shiftTabEvent);
    expect(component.activeDigitPower()).toBe(1);
  });

  it('should enable rho label editing with 2 decimal precision and hide input on blur', () => {
    fixture.componentRef.setInput('center', { num: 0n, den: 1n });
    fixture.componentRef.setInput('rho', 0.5);
    fixture.componentRef.setInput('prime', 3);
    fixture.componentRef.setInput('editableRho', true);

    let emittedRho: number | null = null;
    component.rhoChange.subscribe(r => emittedRho = r);

    fixture.detectChanges();

    const clickEvent = { stopPropagation: () => {} } as any;
    component.onRhoLabelClick(clickEvent);
    expect(component.isEditingRho()).toBe(true);
    expect(component.rhoInputString()).toBe('0.50');

    component.rhoInputString.set('-1.25');
    component.commitRhoEdit();

    expect(emittedRho).toBe(-1.25);
    expect(component.isEditingRho()).toBe(false);
  });
});



