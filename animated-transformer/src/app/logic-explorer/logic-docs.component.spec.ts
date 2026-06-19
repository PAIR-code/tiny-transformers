/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
you may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import { TestBed } from '@angular/core/testing';
import { LogicDocsComponent } from './logic-docs.component';
import { provideRouter } from '@angular/router';
import { routes } from '../app.config';
import { provideZonelessChangeDetection } from '@angular/core';

describe('LogicDocsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
      ],
      imports: [LogicDocsComponent],
    }).compileComponents();
  });

  it('should create the logic docs component', () => {
    const fixture = TestBed.createComponent(LogicDocsComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should toggle accordion states', () => {
    const fixture = TestBed.createComponent(LogicDocsComponent);
    const component = fixture.componentInstance;
    
    // Initially peano is open, others are closed
    expect(component.peanoOpen()).toBe(true);
    expect(component.listOpen()).toBe(false);
    
    component.toggleAccordion('peano');
    expect(component.peanoOpen()).toBe(false);
    
    component.toggleAccordion('list');
    expect(component.listOpen()).toBe(true);
  });

  it('should sanitize and color syntax correctly', () => {
    const fixture = TestBed.createComponent(LogicDocsComponent);
    const component = fixture.componentInstance;
    
    const raw = 'fun add(0, ?y) = ?y;';
    const result = component.getHighlightHtml(raw);
    
    // Since bypassSecurityTrustHtml returns an object with a property, let's extract it or check its string representation
    const resultHtml = (result as any).toString();
    
    expect(resultHtml).toContain('hl-keyword');
    expect(resultHtml).toContain('fun');
    expect(resultHtml).toContain('hl-var');
    expect(resultHtml).toContain('?y');
  });
});
