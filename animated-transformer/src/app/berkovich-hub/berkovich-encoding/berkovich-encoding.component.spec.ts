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
import { provideRouter } from '@angular/router';
import { provideMarkdown } from 'ngx-markdown';
import { BerkovichEncodingComponent } from './berkovich-encoding.component';

describe('BerkovichEncodingComponent', () => {
  let component: BerkovichEncodingComponent;
  let fixture: ComponentFixture<BerkovichEncodingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichEncodingComponent],
      providers: [provideRouter([]), provideMarkdown()]
    }).compileComponents();

    fixture = TestBed.createComponent(BerkovichEncodingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should default depth to K=2 bits and compute 4 binary search steps for 0.6875 (2 right + 2 left)', () => {
    expect(component).toBeTruthy();
    expect(component.depth()).toBe(2);
    expect(component.realTarget()).toBe(0.6875);
    const steps = component.steps();
    expect(steps.length).toBe(4);

    // Step 1: 0.6875 >= 0.5 -> bit 1
    expect(steps[0].bit).toBe(1);
    // Step 2: 0.6875 < 0.75 -> bit 0
    expect(steps[1].bit).toBe(0);
    // Step 3: 0.6875 >= 0.625 -> bit 1
    expect(steps[2].bit).toBe(1);
    // Step 4: 0.6875 >= 0.6875 -> bit 1
    expect(steps[3].bit).toBe(1);

    expect(component.binaryString()).toBe('1011');
  });

  it('should update reverseReal when setRealTarget is called', () => {
    component.setRealTarget(0.8125);
    expect(component.realTarget()).toBe(0.8125);
    expect(component.reverseReal()).toBe(0.8125);
  });

  it('should update realTarget when setReverseReal is called', () => {
    component.setReverseReal(0.3125);
    expect(component.reverseReal()).toBe(0.3125);
    expect(component.realTarget()).toBe(0.3125);
  });

  it('should update both realTarget and reverseReal when digit-display center is edited', () => {
    component.onDigitDisplayCenterChange({ num: 3n, den: 4n }); // 0.75
    expect(component.realTarget()).toBe(0.75);
    expect(component.reverseReal()).toBe(0.75);
    expect(component.binaryString()).toBe('1100');
  });

  it('should compute Berkovich disk regularization toward level of certainty when rho changes', () => {
    // For 0.6875 (binary digits 1011):
    // Max large rho = 0 -> exactly 0.5
    component.onDigitDisplayRhoChange(0);
    expect(component.decodedBiasedReal()).toBe(0.5);

    // Rho = -1 (1 less) -> 0.75 (since first bit b_{-1} is 1)
    component.onDigitDisplayRhoChange(-1);
    expect(component.decodedBiasedReal()).toBe(0.75);

    // Change target so b_{-1} is 0 (e.g. 0.20)
    component.setRealTarget(0.20);
    expect(component.decodedBiasedReal()).toBe(0.25);

    // When useRhoNormalization is disabled, decodedBiasedReal returns exact leaf midpoint
    component.setUseRhoNormalization(false);
    expect(component.decodedBiasedReal()).toBe(component.decodedExactReal());
  });

  it('should correctly encode x = 0.4160 to 0110 binary digits and 13/32 rational center', () => {
    component.setRealTarget(0.4160);
    expect(component.binaryString()).toBe('0110');
    expect(component.currentRationalCenter()).toEqual({ num: 13n, den: 32n });
    const steps = component.steps();
    expect(steps.length).toBe(4);
    expect(steps[0].bit).toBe(0);
    expect(steps[1].bit).toBe(1);
    expect(steps[2].bit).toBe(1);
    expect(steps[3].bit).toBe(0);
    expect(steps[3].rationalCenter).toEqual({ num: 13n, den: 32n });
  });
});
