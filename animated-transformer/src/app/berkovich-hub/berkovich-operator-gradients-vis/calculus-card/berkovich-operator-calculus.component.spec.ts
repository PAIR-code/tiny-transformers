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
import { BerkovichOperatorCalculusComponent } from './berkovich-operator-calculus.component';

if (typeof window !== 'undefined') {
  (window as any).katex = katex;
  (window as any).renderMathInElement = renderMathInElement;
}

describe('BerkovichOperatorCalculusComponent', () => {
  let component: BerkovichOperatorCalculusComponent;
  let fixture: ComponentFixture<BerkovichOperatorCalculusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichOperatorCalculusComponent],
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

    fixture = TestBed.createComponent(BerkovichOperatorCalculusComponent);
    component = fixture.componentInstance;
  });

  it('should format correct addition markdown when x1_rho > x2_rho', () => {
    fixture.componentRef.setInput('operator', 'addition');
    fixture.componentRef.setInput('rhoX1', 1.0);
    fixture.componentRef.setInput('rhoX2', -0.5);
    fixture.componentRef.setInput('stepDetails', {
      outCenter: { num: 0n, den: 1n },
      outRho: 1.0,
      loss: 0.5,
      drhoX1: 1.0,
      drhoX2: 0.0,
      drOut: 1.0
    });
    fixture.detectChanges();

    // Check outputs
    expect(component.outRowMarkdown()).toContain('1.00');
    expect(component.drhoX1Markdown()).toContain('1.00');
    expect(component.drhoX2Markdown()).toContain('0.00');
  });

  it('should format correct multiplication markdown', () => {
    fixture.componentRef.setInput('operator', 'multiplication');
    fixture.componentRef.setInput('rhoX1', 0.5);
    fixture.componentRef.setInput('rhoX2', 0.5);
    fixture.componentRef.setInput('stepDetails', {
      outCenter: { num: 0n, den: 1n },
      outRho: 1.0,
      loss: 0.2,
      drhoX1: 0.5,
      drhoX2: 0.5,
      drOut: -1.0
    });
    fixture.detectChanges();

    expect(component.outRowMarkdown()).toContain('x_1 \\cdot x_2');
    expect(component.drhoX1Markdown()).toContain('0.50');
    expect(component.drhoX2Markdown()).toContain('0.50');
  });

  it('should format correct softmax markdown', () => {
    fixture.componentRef.setInput('operator', 'softmax');
    fixture.componentRef.setInput('rhoX1', 0.0);
    fixture.componentRef.setInput('rhoX2', 0.0);
    fixture.componentRef.setInput('stepDetails', {
      loss: 0.1,
      drhoX1: -0.1,
      drhoX2: 0.1,
      pi1: 0.9,
      pi2: 0.1
    });
    fixture.detectChanges();

    expect(component.softmaxProbMarkdown()).toContain('pi_1 = 0.900');
    expect(component.softmaxBackpropX1Markdown()).toContain('-0.100');
  });
});
