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
});
