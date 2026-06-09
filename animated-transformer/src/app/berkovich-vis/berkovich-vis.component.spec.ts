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

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { BerkovichVisComponent } from './berkovich-vis.component';
import { 
  parseToRational, 
  getValuation, 
  getPadicDigits,
  getAlignedDigits,
  subtract,
  formatRational
} from 'src/lib/berkovich/berkovich';

describe('P-adic Arithmetic Helpers', () => {
  it('should parse integer and rational inputs correctly', () => {
    expect(formatRational(parseToRational('5'))).toBe('5');
    expect(formatRational(parseToRational('5/3'))).toBe('5/3');
    expect(formatRational(parseToRational('-1/3'))).toBe('-1/3');
    expect(formatRational(parseToRational('1.25'))).toBe('5/4');
    expect(formatRational(parseToRational('-0.5'))).toBe('-1/2');
  });

  it('should calculate p-adic valuations correctly', () => {
    const p3 = 3n;
    const p2 = 2n;

    // Valuation of 9 is 2 in base 3, 0 in base 2
    expect(getValuation(parseToRational('9'), p3)).toBe(2);
    expect(getValuation(parseToRational('9'), p2)).toBe(0);

    // Valuation of 5/3 in base 3 is -1
    expect(getValuation(parseToRational('5/3'), p3)).toBe(-1);

    // Valuation of 1.25 (5/4) in base 2 is -2
    expect(getValuation(parseToRational('1.25'), p2)).toBe(-2);
    expect(getValuation(parseToRational('1.25'), 5n)).toBe(1); // 5/4 valuation in base 5 is 1

    // Valuation of 0 should return a high representation for infinity (30)
    expect(getValuation(parseToRational('0'), p3)).toBe(30);
  });

  it('should compute p-adic digits correctly', () => {
    const p3 = 3n;
    
    // 5 = 2*3^0 + 1*3^1. Valuation = 0. Digits = [2, 1, 0, 0]
    const res5 = getPadicDigits(parseToRational('5'), p3, 4);
    expect(res5.startPower).toBe(0);
    expect(res5.digits).toEqual([2, 1, 0, 0]);

    // 5/3 = 2*3^-1 + 1*3^0. Valuation = -1. Digits = [2, 1, 0, 0]
    const res53 = getPadicDigits(parseToRational('5/3'), p3, 4);
    expect(res53.startPower).toBe(-1);
    expect(res53.digits).toEqual([2, 1, 0, 0]);

    // -1 in base 3 is 2*3^0 + 2*3^1 + 2*3^2 + ...
    const resNeg1 = getPadicDigits(parseToRational('-1'), p3, 4);
    expect(resNeg1.startPower).toBe(0);
    expect(resNeg1.digits).toEqual([2, 2, 2, 2]);
  });

  it('should align digits across a fixed range of powers', () => {
    const p3 = 3n;
    const val = parseToRational('5/3'); // 2*3^-1 + 1*3^0
    
    const aligned = getAlignedDigits(val, p3, -2, 2);
    // Expected aligned:
    // power -2: 0
    // power -1: 2
    // power  0: 1
    // power  1: 0
    // power  2: 0
    expect(aligned).toEqual([
      { power: -2, digit: 0 },
      { power: -1, digit: 2 },
      { power:  0, digit: 1 },
      { power:  1, digit: 0 },
      { power:  2, digit: 0 }
    ]);
  });
});

describe('BerkovichVisComponent', () => {
  let component: BerkovichVisComponent;
  let fixture: ComponentFixture<BerkovichVisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichVisComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(BerkovichVisComponent);
    component = fixture.componentInstance;
    
    // Set default test values
    component.prime.set(3);
    component.targetInput.set('5/3');
    component.centerInput.set('0');
    component.logRadiusInput.set('2.0');
    component.learningRateInput.set('0.5');

    fixture.detectChanges();
  });

  it('should create and initialize correctly', () => {
    expect(component).toBeTruthy();
    expect(component.stepCount()).toBe(0);
    expect(component.currentLogRadius()).toBe(2.0);
    expect(formatRational(component.currentCenter())).toBe('0');
  });

  it('should perform continuous gradient steps and snapping', () => {
    // Set starting log-radius to 1.8 (on a Type III edge)
    component.currentLogRadius.set(1.8);
    component.stepCount.set(0);

    // Target is y = 5/3.
    // Distance from c=0 is valuation of 5/3, which is 3^-1, so absolute value 3, log-distance d = 1.
    // At step 0, rho = 1.8. Since rho = 1.8 >= d = 1.0, dL/drho = +1.
    // LR = 0.5. Proposed update is rho = 1.8 - 0.5 * 1 = 1.3.
    // Since 1.3 does not cross an integer (floor is still 1), we update to 1.3.
    component.step();
    expect(component.stepCount()).toBe(1);
    expect(component.currentLogRadius()).toBe(1.3);
    expect(formatRational(component.currentCenter())).toBe('0');

    // Next step: rho = 1.3 >= d = 1.0, dL/drho = +1.
    // Proposed update is rho = 1.3 - 0.5 * 1 = 0.8.
    // Since this crosses 1.0 (an integer boundary), it snaps to 1.0.
    component.step();
    expect(component.stepCount()).toBe(2);
    expect(component.currentLogRadius()).toBe(1.0);
    expect(formatRational(component.currentCenter())).toBe('0');
  });

  it('should perform vertex transitions at integer boundaries', () => {
    // Set state exactly at vertex rho = 1.0
    component.currentCenter.set(parseToRational('0'));
    component.currentLogRadius.set(1.0);
    component.stepCount.set(2);
    
    // Target is y = 5/3.
    // Since rho = 1.0 (vertex), we do branch transition.
    // Candidates at rho = 1.0:
    // - Parent: (0, 2.0) -> distance log(3) = 1. Loss = |2 - 1| + 1 = 2
    // - Child 0: (0, 0) -> distance log(3) = 1. Loss = |0 - 1| + 1 = 2
    // - Child 1: (1/3, 0) -> distance y-1/3 = 5/3-1/3 = 4/3, log-distance = 1. Loss = |0 - 1| + 1 = 2
    // - Child 2: (2/3, 0) -> distance y-2/3 = 5/3-2/3 = 3/3 = 1, log-distance = 0. Loss = |0 - 0| + 0 = 0
    // Child 2 has the minimum loss (0).
    // So the branch transition will select Child 2: center = 2/3, rho = 0.0.
    component.step();
    
    expect(component.stepCount()).toBe(3);
    expect(component.currentLogRadius()).toBe(0.0);
    expect(formatRational(component.currentCenter())).toBe('2/3');
  });

  it('should support undoing the last step and restoring previous state', () => {
    // Initialize starting state
    component.currentLogRadius.set(1.8);
    component.stepCount.set(0);
    component.history.set([{
      step: 0,
      center: parseToRational('0'),
      logRadius: 1.8,
      loss: 2.0,
      type: 'Initialization'
    }]);

    // Step 1: rho -> 1.3
    component.step();
    expect(component.stepCount()).toBe(1);
    expect(component.currentLogRadius()).toBe(1.3);

    // Step 2: rho -> 1.0 (snapped)
    component.step();
    expect(component.stepCount()).toBe(2);
    expect(component.currentLogRadius()).toBe(1.0);

    // Undo Step 2 -> restores Step 1 (rho = 1.3)
    component.undo();
    expect(component.stepCount()).toBe(1);
    expect(component.currentLogRadius()).toBe(1.3);
    expect(component.history().length).toBe(2);

    // Undo Step 1 -> restores Step 0 (rho = 1.8)
    component.undo();
    expect(component.stepCount()).toBe(0);
    expect(component.currentLogRadius()).toBe(1.8);
    expect(component.history().length).toBe(1);

    // Undo at initialization level should be a no-op
    component.undo();
    expect(component.stepCount()).toBe(0);
    expect(component.currentLogRadius()).toBe(1.8);
    expect(component.history().length).toBe(1);
  });
});
