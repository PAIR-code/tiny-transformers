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
import { BerkovichUnaryGradientsVisComponent } from './berkovich-unary-gradients-vis.component';

if (typeof window !== 'undefined') {
  (window as any).katex = katex;
  (window as any).renderMathInElement = renderMathInElement;
}

describe('BerkovichUnaryGradientsVisComponent', () => {
  let component: BerkovichUnaryGradientsVisComponent;
  let fixture: ComponentFixture<BerkovichUnaryGradientsVisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichUnaryGradientsVisComponent],
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

    fixture = TestBed.createComponent(BerkovichUnaryGradientsVisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the unary component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize inputs to valid 4-digit representations', () => {
    expect(component.centerXInput()).toBe('00.10');
    expect(component.centerYInput()).toBe('10.00');
    expect(component.centerX()).toEqual({ num: 1n, den: 3n });
    expect(component.centerY()).toEqual({ num: 3n, den: 1n });
  });

  it('should update inputs on operator change', () => {
    // Change to scale
    component.onOperatorChange('scale');
    expect(component.centerXInput()).toBe('00.10');
    expect(component.centerYInput()).toBe('10.00');
    expect(component.centerX()).toEqual({ num: 1n, den: 3n });
    expect(component.centerY()).toEqual({ num: 3n, den: 1n });

    // Change to square
    component.onOperatorChange('square');
    expect(component.centerXInput()).toBe('01.00');
    expect(component.centerYInput()).toBe('11.00');
    expect(component.centerX()).toEqual({ num: 1n, den: 1n });
    expect(component.centerY()).toEqual({ num: 4n, den: 1n });

    // Change to shift
    component.onOperatorChange('shift');
    expect(component.centerXInput()).toBe('01.00');
    expect(component.centerYInput()).toBe('10.00');
    expect(component.centerX()).toEqual({ num: 1n, den: 1n });
    expect(component.centerY()).toEqual({ num: 3n, den: 1n });
  });

  it('should format and sync inputs when prime changes', () => {
    // Set some valid inputs in base 3
    component.centerXInput.set('02.00'); // 2 in base 3
    component.centerYInput.set('12.00'); // 5 in base 3 (1*3 + 2*1)
    
    // Verify parsed values in base 3
    expect(component.centerX()).toEqual({ num: 2n, den: 1n });
    expect(component.centerY()).toEqual({ num: 5n, den: 1n });

    // Change prime to 5
    component.onPrimeChange(5);

    // Inputs should be formatted for base 5 representation of the same numbers (2 and 5)
    // 2 in base 5 is '02.00'
    // 5 in base 5 is '10.00' (1*5 + 0)
    expect(component.centerXInput()).toBe('02.00');
    expect(component.centerYInput()).toBe('10.00');
    expect(component.centerX()).toEqual({ num: 2n, den: 1n });
    expect(component.centerY()).toEqual({ num: 5n, den: 1n });
  });

  it('should compute straight vertical layouts for single path trees (no kinks)', () => {
    fixture.detectChanges();
    const treeVisDebug = fixture.debugElement.query(
      el => el.name === 'app-berkovich-unary-tree-vis'
    );
    expect(treeVisDebug).toBeTruthy();
    const treeVisComponent = treeVisDebug.componentInstance;

    const visuals = treeVisComponent.treeVisuals();
    expect(visuals.nodes.length).toBeGreaterThan(0);

    // Filter nodes belonging to the single path X tree
    const xNodes = visuals.nodes.filter((n: any) => n.id.startsWith('X_'));
    expect(xNodes.length).toBeGreaterThan(0);

    // All active nodes along the single active path must share the exact same X coordinate
    const activeXNodes = xNodes.filter((n: any) => n.isActive);
    expect(activeXNodes.length).toBeGreaterThan(0);
    const expectedX = activeXNodes[0].x;
    for (const node of activeXNodes) {
      expect(node.x).toBeCloseTo(expectedX, 1e-4);
    }
  });

  it('should run a gradient step correctly and update simulation signals continuously by eta', () => {
    expect(component.stepCount()).toBe(0);
    const initialCenterX = component.centerX();
    const initialRhoX = component.rhoX();

    // Execute one optimization step
    component.onStep();
    expect(component.stepCount()).toBe(1);

    // Verify coordinates updated to active simulation state and moved by eta (0.2)
    expect(component.centerX()).toEqual(initialCenterX); // center stays same for continuous step
    expect(component.rhoX()).toBeCloseTo(initialRhoX - 0.2, 1e-4);
  });
});
