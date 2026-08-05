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
import { DnfVisCardComponent } from './dnf-vis-card.component';
import {
  BerkovichBooleanLearner,
  buildBooleanDataset
} from './models/berkovich-boolean-learner';

describe('DnfVisCardComponent', () => {
  let component: DnfVisCardComponent;
  let fixture: ComponentFixture<DnfVisCardComponent>;
  let learner: BerkovichBooleanLearner;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DnfVisCardComponent],
      providers: [provideRouter([]), provideMarkdown()]
    }).compileComponents();

    fixture = TestBed.createComponent(DnfVisCardComponent);
    component = fixture.componentInstance;

    learner = new BerkovichBooleanLearner(2, 4, 2, 'pre-fixed-leaves', 'separated-branches');
    const dataset = buildBooleanDataset([0, 1, 1, 0], 2);

    fixture.componentRef.setInput('learner', learner);
    fixture.componentRef.setInput('samples', dataset);
    fixture.componentRef.setInput('numPools', 4);
    fixture.componentRef.setInput('numVars', 2);
    fixture.componentRef.setInput('prime', 2);
    fixture.componentRef.setInput('config', {
      prime: 2,
      numPools: 4,
      lr: 0.04,
      reg: 0.02,
      beta: 1.0,
      targetInitMode: 'pre-fixed-leaves',
      poolInitMode: 'separated-branches',
      repulsionReg: 0.02,
      updateTargetCenters: false
    });

    fixture.detectChanges();
  });

  it('should create and render the DNF affinoid domain structure card', () => {
    expect(component).toBeTruthy();
    expect(component.currentInputVector()).toEqual([0, 0]);
    expect(component.matchedTarget()).toBe(0);
  });

  it('should select preset sample and update current input vector', () => {
    const dataset = buildBooleanDataset([0, 1, 1, 0], 2);
    component.selectSample(dataset[1]); // (0, 1) -> 1
    expect(component.currentInputVector()).toEqual([0, 1]);
    expect(component.matchedTarget()).toBe(1);
  });

  it('should toggle individual input bits and compute DNF calculation walkthrough', () => {
    component.toggleInputBit(0); // [0, 0] -> [1, 0]
    expect(component.currentInputVector()).toEqual([1, 0]);
    expect(component.matchedTarget()).toBe(1);

    const fwd = component.currentFwdResult();
    expect(fwd).toBeTruthy();
    expect(fwd?.pathLosses.length).toBe(2);
    expect(fwd?.pathLosses[1].length).toBe(4); // 4 pools
  });

  it('should reset input vector back to first sample', () => {
    component.toggleInputBit(0);
    component.toggleInputBit(1);
    expect(component.currentInputVector()).toEqual([1, 1]);

    component.resetInputVector();
    expect(component.currentInputVector()).toEqual([0, 0]);
  });
});
