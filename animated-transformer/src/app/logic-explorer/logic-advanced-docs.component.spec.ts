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
import { LogicAdvancedDocsComponent } from './logic-advanced-docs.component';
import { provideRouter } from '@angular/router';
import { routes } from '../app.config';
import { provideZonelessChangeDetection } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('LogicAdvancedDocsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
      ],
      imports: [NoopAnimationsModule, LogicAdvancedDocsComponent],
    }).compileComponents();
  });

  it('should create the logic advanced docs component', () => {
    const fixture = TestBed.createComponent(LogicAdvancedDocsComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should sanitize and color logic syntax correctly', () => {
    const fixture = TestBed.createComponent(LogicAdvancedDocsComponent);
    const component = fixture.componentInstance;
    
    const raw = 'let result = double(originalVal);';
    const result = component.getHighlightHtml(raw);
    const resultHtml = (result as any).toString();
    
    expect(resultHtml).toContain('hl-keyword');
    expect(resultHtml).toContain('let');
  });

  it('should sanitize and color TypeScript syntax correctly', () => {
    const fixture = TestBed.createComponent(LogicAdvancedDocsComponent);
    const component = fixture.componentInstance;
    
    const raw = 'class TSVal extends EscapedValue {';
    const result = component.getHighlightTsHtml(raw);
    const resultHtml = (result as any).toString();
    
    expect(resultHtml).toContain('hl-keyword');
    expect(resultHtml).toContain('class');
    expect(resultHtml).toContain('extends');
  });
});
