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
import { BerkovichEncodingTreeVisComponent } from './berkovich-encoding-tree-vis.component';

describe('BerkovichEncodingTreeVisComponent', () => {
  let component: BerkovichEncodingTreeVisComponent;
  let fixture: ComponentFixture<BerkovichEncodingTreeVisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichEncodingTreeVisComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BerkovichEncodingTreeVisComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('steps', [
      {
        step: 1,
        lower: 0,
        upper: 1,
        midpoint: 0.5,
        rationalCenter: { num: 1n, den: 2n },
        bit: 1,
        direction: 'higher',
        rho: -1,
        diskRadius: 0.5
      }
    ]);
    fixture.componentRef.setInput('targetValue', 0.6875);
    fixture.componentRef.setInput('currentRationalCenter', { num: 11n, den: 16n });
    fixture.componentRef.setInput('depth', 4);
    fixture.detectChanges();
  });

  it('should create and render D3 tree elements', () => {
    expect(component).toBeTruthy();
    const svgEl = fixture.nativeElement.querySelector('svg');
    expect(svgEl).toBeTruthy();
    expect(svgEl.querySelectorAll('.tree-node').length).toBeGreaterThan(0);
  });

  it('should render rho cutoff line and grey overlay when useRhoNormalization is true', () => {
    fixture.componentRef.setInput('useRhoNormalization', true);
    fixture.componentRef.setInput('padicRho', 3);
    fixture.componentRef.setInput('biasedValue', 0.75);
    fixture.detectChanges();

    const svgEl: SVGSVGElement = fixture.nativeElement.querySelector('svg');
    expect(svgEl.querySelector('.rho-cutoff-line')).toBeTruthy();
    expect(svgEl.querySelector('.rho-grey-overlay')).toBeTruthy();
  });

  it('should render darker and thicker dotted lines for inactive tree edges', () => {
    const svgEl: SVGSVGElement = fixture.nativeElement.querySelector('svg');
    const edges = Array.from(svgEl.querySelectorAll<SVGLineElement>('.tree-edge'));
    expect(edges.length).toBeGreaterThan(0);

    const inactiveEdges = edges.filter((e) => e.getAttribute('stroke-dasharray') === '3 3');
    expect(inactiveEdges.length).toBeGreaterThan(0);
    inactiveEdges.forEach((edge) => {
      expect(edge.getAttribute('stroke')).toBe('#64748b');
      expect(edge.getAttribute('stroke-width')).toBe('1.8');
    });
  });

  it('should render draggable x_exact pin and number line drag area', () => {
    const svgEl: SVGSVGElement = fixture.nativeElement.querySelector('svg');
    const exactPinGroup = svgEl.querySelector('.exact-pin-group');
    expect(exactPinGroup).toBeTruthy();
    expect(exactPinGroup?.querySelector('circle')).toBeTruthy();
    expect(exactPinGroup?.querySelector('text')?.textContent).toContain('x_exact = 0.6875');

    const dragArea = svgEl.querySelector('.number-line-drag-area');
    expect(dragArea).toBeTruthy();
  });

  it('should render blue pin labeled x_{ρ-norm} when rho-norm is enabled, and x_padic when disabled', () => {
    // When rho normalization is enabled
    fixture.componentRef.setInput('useRhoNormalization', true);
    fixture.componentRef.setInput('biasedValue', 0.625);
    fixture.detectChanges();

    const svgEl: SVGSVGElement = fixture.nativeElement.querySelector('svg');
    let bluePinGroup = svgEl.querySelector('.blue-pin-group');
    expect(bluePinGroup).toBeTruthy();
    expect(bluePinGroup?.querySelector('text')?.textContent).toContain('x_{ρ-norm} = 0.6250');

    // When rho normalization is disabled
    fixture.componentRef.setInput('useRhoNormalization', false);
    fixture.componentRef.setInput('biasedValue', 0.6875);
    fixture.detectChanges();

    bluePinGroup = svgEl.querySelector('.blue-pin-group');
    expect(bluePinGroup).toBeTruthy();
    expect(bluePinGroup?.querySelector('text')?.textContent).toContain('x_padic = 0.6875');
  });

  it('should render centered digit-display with blue outline placed underneath the tree vis', () => {
    const hostEl: HTMLElement = fixture.nativeElement;
    const digitDisplayWrapper = hostEl.querySelector('.centered-digit-display');
    expect(digitDisplayWrapper).toBeTruthy();

    const digitDisplayComponent = hostEl.querySelector('app-berkovich-digit-display');
    expect(digitDisplayComponent).toBeTruthy();
  });
});
