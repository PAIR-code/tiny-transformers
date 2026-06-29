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
});
