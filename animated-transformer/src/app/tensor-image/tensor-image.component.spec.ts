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

import { TensorImageComponent } from './tensor-image.component';
import { GTensor } from 'src/lib/gtensor/gtensor';
import * as tf from '@tensorflow/tfjs';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';

describe('TensorImageComponent', () => {
  let component: TensorImageComponent;
  let fixture: ComponentFixture<TensorImageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection()],
      imports: [TensorImageComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TensorImageComponent);
    const gtensor = new GTensor<'x' | 'y' | 'rgb'>(tf.tensor([[[255]]]), ['x', 'y', 'rgb']);
    fixture.componentRef.setInput('gtensor', gtensor);
    fixture.componentRef.setInput('seenWidth', 10);
    fixture.componentRef.setInput('seenHeight', 10);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
