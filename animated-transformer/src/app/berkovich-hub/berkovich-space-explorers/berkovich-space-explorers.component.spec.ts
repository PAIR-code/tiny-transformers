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
import { BerkovichSpaceExplorersComponent } from './berkovich-space-explorers.component';

describe('BerkovichSpaceExplorersComponent', () => {
  let component: BerkovichSpaceExplorersComponent;
  let fixture: ComponentFixture<BerkovichSpaceExplorersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichSpaceExplorersComponent],
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

    fixture = TestBed.createComponent(BerkovichSpaceExplorersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initialize correctly', () => {
    expect(component).toBeTruthy();
    expect(component.stepCount()).toBe(0);
    expect(component.epochCount()).toBe(0);
    expect(component.vocab().length).toBeGreaterThan(0);
    
    // Default model should be set to Berkovich
    expect(component.berkovichModel()).toBeTruthy();
    expect(component.euclideanModel()).toBeNull();
  });

  it('should switch approaches and reset weights correctly', () => {
    component.onApproachChange('euclidean-ngram');
    fixture.detectChanges();
    
    expect(component.approach()).toBe('euclidean-ngram');
    expect(component.euclideanModel()).toBeTruthy();
    expect(component.berkovichModel()).toBeNull();

    // Switch back to Berkovich
    component.onApproachChange('berkovich-ngram');
    fixture.detectChanges();
    expect(component.berkovichModel()).toBeTruthy();
    expect(component.euclideanModel()).toBeNull();
  });

  it('should run training steps successfully', () => {
    const startStep = component.stepCount();
    expect(startStep).toBe(0);

    // Perform a training step
    component.stepTrain();
    fixture.detectChanges();

    expect(component.stepCount()).toBe(1);
    expect(component.recentPredictions().length).toBeGreaterThan(0);
    expect(component.currentLossVal()).toBeGreaterThanOrEqual(0);
  });
});
