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
import { provideZonelessChangeDetection, SecurityContext } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideMarkdown, KATEX_OPTIONS, MarkedKatexOptions, SANITIZE } from 'ngx-markdown';
import { BBool2Component } from './b-bool2.component';
import { describe, it, beforeEach, expect } from 'vitest';

describe('BBool2Component', () => {
  let component: BBool2Component;
  let fixture: ComponentFixture<BBool2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BBool2Component],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideMarkdown({
          sanitize: {
            provide: SANITIZE,
            useValue: SecurityContext.NONE,
          },
        }),
        {
          provide: KATEX_OPTIONS,
          useValue: {
            nonStandard: true
          } as MarkedKatexOptions & { nonStandard?: boolean }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BBool2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should select XOR preset and update truth table to [0, 1, 1, 0]', () => {
    component.selectFunction(6); // XOR
    expect(component.selectedFunctionIndex()).toBe(6);
    expect(component.truthTable()).toEqual([0, 1, 1, 0]);
  });

  it('should set exact algebraic solution for current circuit and update sticky preset', () => {
    component.selectFunction(6); // XOR
    component.initExactAlgebraic();
    expect(component.selectedPreset()).toBe('exact');

    const learner = component.learner();
    expect(learner).toBeTruthy();
    expect(learner?.b.center.num).toBe(0n);
    expect(learner?.w1.center.num).toBe(1n);
    expect(learner?.w2.center.num).toBe(1n);
    expect(learner?.w3.center.num).toBe(-2n);
    expect(component.currentAccuracy()).toBe(1.0);
  });

  it('should toggle truth table bits and re-evaluate', () => {
    component.selectFunction(8); // AND [0, 0, 0, 1]
    expect(component.truthTable()).toEqual([0, 0, 0, 1]);

    component.toggleTruthTableBit(0); // Toggle to [1, 0, 0, 1] (XNOR)
    expect(component.truthTable()).toEqual([1, 0, 0, 1]);
    expect(component.selectedFunctionIndex()).toBe(9); // Matches XNOR
  });

  it('should compute 256 heatmap grid points for continuous 2D relaxation visualization', () => {
    const grid = component.heatmapGrid();
    expect(grid.length).toBe(256);
  });

  it('should set all parameter rho values via radius presets', () => {
    component.selectFunction(6); // XOR
    component.setAllRho(-2.0);
    expect(component.initialRho()).toBe(-2.0);
    expect(component.selectedRhoPreset()).toBe('-2');
    expect(component.isAllRhoNear(-2.0)).toBe(true);

    const learner = component.learner();
    expect(learner?.b.rho).toBe(-2.0);
    expect(learner?.w1.rho).toBe(-2.0);
    expect(learner?.w2.rho).toBe(-2.0);
    expect(learner?.w3.rho).toBe(-2.0);
    expect(component.currentAverageRho()).toBe(-2.0);
  });

  it('should randomize parameter rho values with setRandomRho', () => {
    component.selectFunction(6); // XOR
    component.setRandomRho();
    expect(component.selectedRhoPreset()).toBe('random');
    const learner = component.learner();
    expect(learner).toBeTruthy();
    if (learner) {
      expect(learner.b.rho).toBeGreaterThanOrEqual(-2.0);
      expect(learner.b.rho).toBeLessThanOrEqual(1.0);
      expect(learner.w1.rho).toBeGreaterThanOrEqual(-2.0);
      expect(learner.w1.rho).toBeLessThanOrEqual(1.0);
    }
  });

  it('should preserve sticky parameter preset and rho preset when switching circuits', () => {
    component.initZero();
    component.setAllRho(-2.0);
    expect(component.selectedPreset()).toBe('zero');
    expect(component.selectedRhoPreset()).toBe('-2');

    // Switch to AND gate
    component.selectFunction(8);
    expect(component.selectedPreset()).toBe('zero');
    expect(component.selectedRhoPreset()).toBe('-2');
    expect(component.truthTable()).toEqual([0, 0, 0, 1]);

    const learner = component.learner();
    expect(learner?.b.center.num).toBe(0n);
    expect(learner?.w1.center.num).toBe(0n);
    expect(learner?.b.rho).toBe(-2.0);
  });
});
