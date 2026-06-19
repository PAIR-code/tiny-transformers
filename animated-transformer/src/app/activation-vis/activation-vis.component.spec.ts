/* Copyright 2023 Google LLC. All Rights Reserved.

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

import { ActivationVisComponent } from './activation-vis.component';
import { CornerActivationComponent } from './corner-activation/corner-activation.component';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideMarkdown, KATEX_OPTIONS, MarkedKatexOptions } from 'ngx-markdown';

describe('ActivationVisComponent', () => {
  let component: ActivationVisComponent;
  let fixture: ComponentFixture<ActivationVisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideMarkdown(),
        {
          provide: KATEX_OPTIONS,
          useValue: {
            // Cast is needed because 'nonStandard' is missing from ngx-markdown's MarkedKatexOptions typings.
            // We need 'nonStandard: true' to support inline math without surrounding spaces (e.g. '($\rho$)').
            nonStandard: true
          } as MarkedKatexOptions & { nonStandard?: boolean }
        }
      ],
      imports: [ActivationVisComponent, CornerActivationComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ActivationVisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
