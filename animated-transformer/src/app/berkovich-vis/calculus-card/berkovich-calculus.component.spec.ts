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
import { provideMarkdown } from 'ngx-markdown';
import katex from 'katex';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render.js';
import { BerkovichCalculusComponent } from './berkovich-calculus.component';

declare module 'vitest' {
  interface Assertion<T = any> {
    toMatchScreenshot(): Promise<void>;
  }
}

if (typeof window !== 'undefined') {
  (window as any).katex = katex;
  (window as any).renderMathInElement = renderMathInElement;
}

describe('BerkovichCalculusComponent', () => {
  let component: BerkovichCalculusComponent;
  let fixture: ComponentFixture<BerkovichCalculusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichCalculusComponent],
      providers: [provideZonelessChangeDetection(), provideMarkdown()]
    }).compileComponents();

    fixture = TestBed.createComponent(BerkovichCalculusComponent);
    component = fixture.componentInstance;
  });

  const vertexMockData = {
    isVertex: true,
    rho: 1,
    d: 1,
    loss: 1,
    nextCenter: { num: 2n, den: 3n },
    nextLogRadius: 0.8,
    stepType: 'Vertex (Move to Child 2)',
    explanation: 'At Type II vertex ($\\rho = 1$), the tangent space has 4 branches (parent and 3 children). We evaluate the path-metric loss for each branch and choose the one with the smallest loss: **Child 2**.',
    candidates: [
      { branch: 'parent', branchLabel: 'Parent (∞)', center: { num: 0n, den: 1n }, logRadius: 2, lossVal: 2 },
      { branch: '0', branchLabel: 'Child 0', center: { num: 0n, den: 1n }, logRadius: 0, lossVal: 2 },
      { branch: '1', branchLabel: 'Child 1', center: { num: 1n, den: 3n }, logRadius: 0, lossVal: 1.6666 },
      { branch: '2', branchLabel: 'Child 2', center: { num: 2n, den: 3n }, logRadius: 0, lossVal: 1.0 }
    ],
    bestBranch: '2',
    bestBranchLabel: 'Child 2'
  };

  const edgeMockData = {
    isVertex: false,
    rho: 1.8,
    d: 1.0,
    loss: 1.8,
    nextCenter: { num: 0n, den: 1n },
    nextLogRadius: 1.6,
    stepType: 'Edge (Continuous descent dL/dρ=+1)',
    explanation: 'On Type III edge ($\\rho = 1.8000$), the gradient of the loss with respect to $\\rho$ is $\\frac{dL}{d\\rho} = \\text{sgn}(\\rho - d) = +1.0$ (since $\\rho \\ge d$). Under gradient descent, the proposed update is $\\rho_{\\text{new}} = \\rho - \\eta \\cdot \\frac{dL}{d\\rho} = 1.6000$.',
    gRho: 1,
    crossesInteger: false,
    snappedRho: 1.6
  };

  it('should render collapsed by default', async () => {
    fixture.componentRef.setInput('gradientBreakdown', edgeMockData);
    fixture.componentRef.setInput('learningRate', 0.2);
    fixture.detectChanges();

    expect(component.isCollapsed()).toBe(true);
    await expect(fixture.nativeElement).toMatchScreenshot();
  });

  it('should toggle collapse state on header click', async () => {
    fixture.componentRef.setInput('gradientBreakdown', edgeMockData);
    fixture.componentRef.setInput('learningRate', 0.2);
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('.clickable-header') as HTMLElement;
    header.click();
    fixture.detectChanges();

    expect(component.isCollapsed()).toBe(false);

    header.click();
    fixture.detectChanges();

    expect(component.isCollapsed()).toBe(true);
  });

  it('should render correct content when expanded on Type III edge', async () => {
    fixture.componentRef.setInput('gradientBreakdown', edgeMockData);
    fixture.componentRef.setInput('learningRate', 0.2);
    component.isCollapsed.set(false);
    fixture.detectChanges();

    await expect(fixture.nativeElement).toMatchScreenshot();
  });

  it('should render correct content when expanded on Type II vertex', async () => {
    fixture.componentRef.setInput('gradientBreakdown', vertexMockData);
    fixture.componentRef.setInput('learningRate', 0.2);
    component.isCollapsed.set(false);
    fixture.detectChanges();

    await expect(fixture.nativeElement).toMatchScreenshot();
  });
});
