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
import { provideZonelessChangeDetection, SecurityContext } from '@angular/core';
import { BBool2TreeComponent } from './b-bool2-tree.component';
import { BBool2Learner, BBool2Config } from '../models/b-bool2-learner';
import { provideMarkdown, KATEX_OPTIONS, MarkedKatexOptions, SANITIZE } from 'ngx-markdown';
import { describe, it, beforeEach, expect } from 'vitest';

describe('BBool2TreeComponent', () => {
  let component: BBool2TreeComponent;
  let fixture: ComponentFixture<BBool2TreeComponent>;

  const mockConfig: BBool2Config = {
    prime: 2,
    lr: 0.1,
    reg: 0.01,
    beta: 2.0,
    digitsLeft: 3,
    digitsRight: 2,
    mode: 'berkovich',
    updateCenters: true,
    updateRadii: true
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BBool2TreeComponent],
      providers: [
        provideZonelessChangeDetection(),
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

    fixture = TestBed.createComponent(BBool2TreeComponent);
    component = fixture.componentInstance;

    const learner = new BBool2Learner(2, 'exact-xor');
    fixture.componentRef.setInput('learner', learner);
    fixture.componentRef.setInput('config', mockConfig);
    fixture.componentRef.setInput('activeSample', [1, 1]);
    fixture.componentRef.setInput('target', 0);
    fixture.componentRef.setInput('tick', 0);

    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should compute forward intermediate nodes for active sample (1, 1)', () => {
    const fwd = component.currentForward();
    expect(fwd).toBeTruthy();
    expect(fwd?.inputs).toEqual([1, 1]);
    expect(fwd?.pred).toBe(0); // XOR(1, 1) = 0
  });

  it('should select node and display node disk values', () => {
    component.selectNode('f_out');
    expect(component.selectedNodeId()).toBe('f_out');

    const disk = component.getNodeDisk('f_out');
    expect(disk).toBeTruthy();

    const additionNode = component.nodes.find(n => n.id === 'f_out');
    expect(additionNode?.category).toBe('addition');

    const bNode = component.nodes.find(n => n.id === 'b');
    expect(bNode?.category).toBe('param');
    expect(component.nodes.filter(n => n.id === 'b').length).toBe(1);

    const multNodes = component.nodes.filter(n => n.category === 'multiplication');
    expect(multNodes.length).toBe(4); // t1, t2, p12, t3
  });
});
