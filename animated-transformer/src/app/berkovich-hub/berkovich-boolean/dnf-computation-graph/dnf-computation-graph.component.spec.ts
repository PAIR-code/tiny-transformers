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
import { provideMarkdown } from 'ngx-markdown';
import { DnfComputationGraphComponent } from './dnf-computation-graph.component';
import {
  BerkovichBooleanLearner
} from '../models/berkovich-boolean-learner';

describe('DnfComputationGraphComponent', () => {
  let component: DnfComputationGraphComponent;
  let fixture: ComponentFixture<DnfComputationGraphComponent>;
  let learner: BerkovichBooleanLearner;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DnfComputationGraphComponent],
      providers: [provideMarkdown()]
    }).compileComponents();

    fixture = TestBed.createComponent(DnfComputationGraphComponent);
    component = fixture.componentInstance;

    learner = new BerkovichBooleanLearner(2, 4, 2, 'pre-fixed-leaves', 'separated-branches');

    fixture.componentRef.setInput('learner', learner);
    fixture.componentRef.setInput('inputs', [0, 1]);
    fixture.componentRef.setInput('numVars', 2);
    fixture.componentRef.setInput('numPools', 4);
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

  it('should create and render the 5-layer DNF computation graph', () => {
    expect(component).toBeTruthy();
    expect(component.inputNodes().length).toBe(2);
    expect(component.poolNodes().length).toBe(4);
    expect(component.classNodes().length).toBe(2);
    expect(component.outputNodes().length).toBe(2);
  });

  it('should inspect default pool target when loaded', () => {
    const inspected = component.inspectedTarget();
    expect(inspected).toBeTruthy();
    expect(inspected?.type).toBe('pool');
    expect(inspected?.poolIndex).toBe(0);
  });

  it('should inspect input node and populate its leaf disk when clicked', () => {
    component.inspectInputNode(1);
    const inspected = component.inspectedTarget();
    expect(inspected?.type).toBe('input');
    expect(inspected?.dimIndex).toBe(1);
    expect(inspected?.disk).toBeTruthy();
  });

  it('should inspect pool weight parameter and show both learned weight and hidden pool disks', () => {
    component.inspectPoolWeight(0, 0);
    const inspected = component.inspectedTarget();
    expect(inspected?.type).toBe('pool-weight');
    expect(inspected?.poolIndex).toBe(0);
    expect(inspected?.dimIndex).toBe(0);
    expect(inspected?.disk).toBeTruthy();
    expect(inspected?.secondDisk).toBeTruthy();
  });

  it('should inspect class target constraints when class node is clicked', () => {
    component.inspectClassTarget(1);
    const inspected = component.inspectedTarget();
    expect(inspected?.type).toBe('class-target');
    expect(inspected?.classIndex).toBe(1);
  });

  it('should inspect pool target constraint disks when edge target badge is clicked', () => {
    component.inspectPoolTarget(0, 1);
    const inspected = component.inspectedTarget();
    expect(inspected?.type).toBe('pool-target');
    expect(inspected?.poolIndex).toBe(0);
    expect(inspected?.classIndex).toBe(1);
  });

  it('should compute bezier edges connecting inputs to pools and pools to class targets', () => {
    expect(component.inputToPoolEdges().length).toBe(8); // 2 inputs * 4 pools
    expect(component.poolToClassEdges().length).toBe(8); // 4 pools * 2 classes
  });

  it('should emit toggleBit when an input node is clicked', () => {
    let toggledDim = -1;
    component.toggleBit.subscribe((dim: number) => {
      toggledDim = dim;
    });

    component.onInputNodeClick(1);
    expect(toggledDim).toBe(1);
  });

  it('should filter edge dimming state when hovering over a pool', () => {
    expect(component.isEdgeDimmed(0)).toBe(false);
    component.hoveredPoolIndex.set(1); // hover Pool 1
    expect(component.isEdgeDimmed(0)).toBe(true);
    expect(component.isEdgeDimmed(1)).toBe(false);
  });
});
