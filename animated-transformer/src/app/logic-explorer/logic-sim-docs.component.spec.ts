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
import { LogicSimDocsComponent } from './logic-sim-docs.component';
import { provideRouter } from '@angular/router';
import { routes } from '../app.config';
import { provideZonelessChangeDetection } from '@angular/core';

describe('LogicSimDocsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
      ],
      imports: [LogicSimDocsComponent],
    }).compileComponents();
  });

  it('should create the logic simulation docs component', () => {
    const fixture = TestBed.createComponent(LogicSimDocsComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should sanitize and color logic and ts syntax correctly', () => {
    const fixture = TestBed.createComponent(LogicSimDocsComponent);
    const component = fixture.componentInstance;
    
    const rawLogic = 'action buyCoffee [1.5]: { ?d: dollar } -o { ?c: drink(coffee) };';
    const resultLogic = component.getHighlightHtml(rawLogic);
    const resultLogicHtml = (resultLogic as any).toString();
    expect(resultLogicHtml).toContain('hl-keyword');
    expect(resultLogicHtml).toContain('action');
    expect(resultLogicHtml).toContain('hl-number');
    expect(resultLogicHtml).toContain('1.5');

    const rawTs = 'const score = Math.max(0.1, 10 / (dist + 1));';
    const resultTs = component.getHighlightTsHtml(rawTs);
    const resultTsHtml = (resultTs as any).toString();
    expect(resultTsHtml).toContain('hl-keyword');
    expect(resultTsHtml).toContain('const');
    expect(resultTsHtml).toContain('hl-number');
    expect(resultTsHtml).toContain('0.1');
  });
});
