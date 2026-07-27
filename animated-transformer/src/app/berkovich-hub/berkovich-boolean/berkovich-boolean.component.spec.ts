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
import { provideRouter } from '@angular/router';
import { provideMarkdown } from 'ngx-markdown';
import { BerkovichBooleanComponent } from './berkovich-boolean.component';
import { BerkovichBooleanLearner, buildBooleanDataset } from './models/berkovich-boolean-learner';

describe('BerkovichBooleanLearner', () => {
  it('should initialize learner with DNF pools and pre-fixed leaves', () => {
    const learner = new BerkovichBooleanLearner(2, 2, 2, 'pre-fixed-leaves', 'separated-branches');
    expect(learner.numVars).toBe(2);
    expect(learner.numPools).toBe(2);
    expect(learner.W.length).toBe(2); // Class 0 and Class 1
  });

  it('should forward pass and predict XOR function', () => {
    const learner = new BerkovichBooleanLearner(2, 2, 2, 'pre-fixed-leaves', 'separated-branches');
    const fwd = learner.forward([0, 1], {
      prime: 2,
      numPools: 2,
      lr: 0.04,
      reg: 0.02,
      beta: 1.0,
      targetInitMode: 'pre-fixed-leaves',
      poolInitMode: 'separated-branches',
      repulsionReg: 0.02
    });

    expect(fwd.probs.length).toBe(2);
    expect(fwd.pools.length).toBe(2);
  });

  it('should execute a training batch step', () => {
    const learner = new BerkovichBooleanLearner(2, 2, 2, 'pre-fixed-leaves', 'separated-branches');
    const dataset = buildBooleanDataset([0, 1, 1, 0], 2);
    const res = learner.trainBatch(dataset, {
      prime: 2,
      numPools: 2,
      lr: 0.04,
      reg: 0.02,
      beta: 1.0,
      targetInitMode: 'pre-fixed-leaves',
      poolInitMode: 'separated-branches',
      repulsionReg: 0.02
    });

    expect(res.loss).toBeGreaterThan(0);
    expect(res.accuracy).toBeGreaterThanOrEqual(0);
  });
});

describe('BerkovichBooleanComponent', () => {
  let component: BerkovichBooleanComponent;
  let fixture: ComponentFixture<BerkovichBooleanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BerkovichBooleanComponent],
      providers: [provideRouter([]), provideMarkdown()]
    }).compileComponents();

    fixture = TestBed.createComponent(BerkovichBooleanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component and initialize default XOR dataset', () => {
    expect(component).toBeTruthy();
    expect(component.truthTable().length).toBe(4);
    expect(component.currentPredictions().length).toBe(4);
  });

  it('should execute stepTrain and update loss history', () => {
    component.stepTrain();
    expect(component.stepCount()).toBe(1);
    expect(component.trainLossHistory().length).toBe(1);
  });

  it('should toggle truth table bits and reset model', () => {
    component.toggleTruthTableBit(0);
    expect(component.truthTable()[0]).toBe(1);
    expect(component.stepCount()).toBe(0);
  });

  it('should toggle info popups correctly', () => {
    const dummyEvent = new MouseEvent('click');
    component.togglePopup('numpools', dummyEvent);
    expect(component.activePopup()).toBe('numpools');

    component.closePopup();
    expect(component.activePopup()).toBeNull();
  });

  it('should compute modelConfig for walkthrough component', () => {
    const cfg = component.modelConfig();
    expect(cfg.numPools).toBe(4);
    expect(cfg.prime).toBe(2);
  });
});

