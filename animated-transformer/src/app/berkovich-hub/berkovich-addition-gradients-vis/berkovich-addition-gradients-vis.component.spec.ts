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

import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideMarkdown, KATEX_OPTIONS, MarkedKatexOptions, SANITIZE } from 'ngx-markdown';
import { SecurityContext } from '@angular/core';
import katex from 'katex';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render.js';
import { BerkovichAdditionGradientsVisComponent } from './berkovich-addition-gradients-vis.component';

if (typeof window !== 'undefined') {
  (window as any).katex = katex;
  (window as any).renderMathInElement = renderMathInElement;
}

describe('BerkovichAdditionGradientsVisComponent', () => {
  let component: BerkovichAdditionGradientsVisComponent;
  let fixture: ComponentFixture<BerkovichAdditionGradientsVisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichAdditionGradientsVisComponent],
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

    fixture = TestBed.createComponent(BerkovichAdditionGradientsVisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize with correct default values', () => {
    expect(component).toBeTruthy();
    expect(component.prime()).toBe(3);
    expect(component.learningRate()).toBe(0.20);
    expect(component.canUndo()).toBe(false);
  });

  it('should take a step and update parameter history/canUndo', () => {
    // Set initial inputs
    component.centerX1Input.set('00.00');
    component.rhoX1Input.set('0.00');
    component.centerX2Input.set('00.00');
    component.rhoX2Input.set('-1.00');
    component.centerYInput.set('01.00');
    fixture.detectChanges();

    expect(component.canUndo()).toBe(false);

    component.onStep();
    fixture.detectChanges();

    expect(component.canUndo()).toBe(true);
    expect(component.history().length).toBe(1);
    expect(component.history()[0].centerX1Input).toBe('00.00');
  });

  it('should undo step and restore inputs', () => {
    component.centerX1Input.set('00.00');
    component.rhoX1Input.set('0.00');
    component.centerX2Input.set('00.00');
    component.rhoX2Input.set('-1.00');
    component.centerYInput.set('01.00');
    fixture.detectChanges();

    component.onStep();
    fixture.detectChanges();

    expect(component.centerX1Input()).not.toBe('00.00');

    component.onUndo();
    fixture.detectChanges();

    expect(component.centerX1Input()).toBe('00.00');
    expect(component.canUndo()).toBe(false);
  });

  it('should clear history on input change, prime change, or randomize', () => {
    component.centerX1Input.set('12.20');
    fixture.detectChanges();

    component.onStep();
    fixture.detectChanges();
    expect(component.canUndo()).toBe(true);

    // Manual input edit
    component.onInputChange({ nodeId: 'X1', field: 'center', value: '11.00' });
    expect(component.canUndo()).toBe(false);

    component.onStep();
    fixture.detectChanges();
    expect(component.canUndo()).toBe(true);

    // Randomize
    component.onRandomize();
    expect(component.canUndo()).toBe(false);

    component.onStep();
    fixture.detectChanges();
    expect(component.canUndo()).toBe(true);

    // Prime change
    component.onPrimeChange(2);
    expect(component.canUndo()).toBe(false);
  });
});
