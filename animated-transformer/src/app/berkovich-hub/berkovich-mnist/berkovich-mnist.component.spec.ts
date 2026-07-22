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
import { provideZonelessChangeDetection, SecurityContext } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideMarkdown, KATEX_OPTIONS, MarkedKatexOptions, SANITIZE } from 'ngx-markdown';
import { BerkovichMnistComponent } from './berkovich-mnist.component';

describe('BerkovichMnistComponent', () => {
  let component: BerkovichMnistComponent;
  let fixture: ComponentFixture<BerkovichMnistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichMnistComponent],
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

    fixture = TestBed.createComponent(BerkovichMnistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initialize correctly', () => {
    expect(component).toBeTruthy();
    expect(component.stepCount()).toBe(0);
    expect(component.epochCount()).toBe(0);

    // Default model should be set to Berkovich Affinoid
    expect(component.berkovichModel()).toBeTruthy();
    expect(component.padicLinearModel()).toBeNull();
    expect(component.euclideanModel()).toBeNull();

    expect(component.currentPrediction()).toBeTruthy();
    expect(component.walkthroughDetails()).toBeTruthy();
  });

  it('should switch approaches and reset models correctly', () => {
    component.onApproachChange('padic-linear');
    fixture.detectChanges();

    expect(component.approach()).toBe('padic-linear');
    expect(component.padicLinearModel()).toBeTruthy();
    expect(component.berkovichModel()).toBeNull();

    component.onApproachChange('euclidean-linear');
    fixture.detectChanges();

    expect(component.approach()).toBe('euclidean-linear');
    expect(component.euclideanModel()).toBeTruthy();
    expect(component.berkovichModel()).toBeNull();

    component.onApproachChange('berkovich-affinoid');
    fixture.detectChanges();

    expect(component.approach()).toBe('berkovich-affinoid');
    expect(component.berkovichModel()).toBeTruthy();
  });

  it('should execute a training step successfully', () => {
    const startStep = component.stepCount();
    expect(startStep).toBe(0);

    component.stepTrain();
    fixture.detectChanges();

    expect(component.stepCount()).toBe(1);
    expect(component.trainLossHistory().length).toBe(1);
    expect(component.trainAccHistory().length).toBe(1);
  });
});
