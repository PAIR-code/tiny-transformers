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
import { provideMarkdown, KATEX_OPTIONS, MarkedKatexOptions, SANITIZE } from 'ngx-markdown';
import { SecurityContext } from '@angular/core';
import katex from 'katex';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render.js';
import { BerkovichAdditionCalculusComponent } from './berkovich-addition-calculus.component';

if (typeof window !== 'undefined') {
  (window as any).katex = katex;
  (window as any).renderMathInElement = renderMathInElement;
}

describe('BerkovichAdditionCalculusComponent', () => {
  let component: BerkovichAdditionCalculusComponent;
  let fixture: ComponentFixture<BerkovichAdditionCalculusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichAdditionCalculusComponent],
      providers: [
        provideZonelessChangeDetection(),
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

    fixture = TestBed.createComponent(BerkovichAdditionCalculusComponent);
    component = fixture.componentInstance;
  });

  it('should compute correct addition radius and active degrees when x1_rho > x2_rho', () => {
    fixture.componentRef.setInput('rhoX1', 1.0);
    fixture.componentRef.setInput('rhoX2', -0.5);
    fixture.componentRef.setInput('dL_drhoSum', 1.0);
    fixture.detectChanges();

    expect(component.rhoSum()).toBe(1.0);
    expect(component.activeDegrees()).toEqual({ x1: 1, x2: 0 });
    
    // Markdown formulas should contain expected math content and no invalid \\text{} wrapper around relations
    expect(component.drhoX1Markdown()).toContain('x_{1,\\rho} \\ge x_{2,\\rho}');
    expect(component.drhoX1Markdown()).not.toContain('\\text{(x_{1,\\rho}');
  });

  it('should split active degrees equally when x1_rho == x2_rho', () => {
    fixture.componentRef.setInput('rhoX1', 0.5);
    fixture.componentRef.setInput('rhoX2', 0.5);
    fixture.componentRef.setInput('dL_drhoSum', -1.0);
    fixture.detectChanges();

    expect(component.rhoSum()).toBe(0.5);
    expect(component.activeDegrees()).toEqual({ x1: 0.5, x2: 0.5 });
  });
});
