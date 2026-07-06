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

    fixture.detectChanges();

    // Check cells values
    const computedCells = component.cells();
    expect(computedCells.length).toBeGreaterThan(0);

    // Verify SVG layout calculations
    const svgHeight = component.svgHeight();
    expect(svgHeight).toBe(128); // 128 for null yRho

    const totalWidth = component.layout().totalWidth;
    expect(totalWidth).toBeGreaterThan(200);

    await expect(fixture.nativeElement).toMatchScreenshot();
  });

  it('should render and compute layout correctly for Disk SGD target', async () => {
    fixture.componentRef.setInput('prime', 3);
    fixture.componentRef.setInput('xCenter', { num: 0n, den: 1n });
    fixture.componentRef.setInput('xRho', 0.5);
    fixture.componentRef.setInput('yCenter', { num: 5n, den: 3n });
    fixture.componentRef.setInput('yRho', -1.0);

    fixture.detectChanges();

    const svgHeight = component.svgHeight();
    expect(svgHeight).toBe(143); // 143 for non-null yRho

    await expect(fixture.nativeElement).toMatchScreenshot();
  });
});
