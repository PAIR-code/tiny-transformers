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

import { CellSectionComponent } from './cell-section.component';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { Experiment } from 'src/lib/weblab/experiment';
import { LabEnv } from 'src/lib/distr-signals/lab-env';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import {
  CellCodeRefKind,
  SecDefKind,
  SecDefOfSecList,
  SecDefOfWorker,
} from 'src/lib/weblab/section';
import { InMemoryDataResolver } from 'src/lib/data-resolver/data-resolver';
import { provideHttpClient } from '@angular/common/http';

describe('CellSectionComponent', () => {
  let component: CellSectionComponent;
  let fixture: ComponentFixture<CellSectionComponent>;

  beforeEach(async () => {
    const space = new SignalSpace();
    const lab = new LabEnv(space);
    const exp1Data: SecDefOfSecList = {
      kind: SecDefKind.SectionList,
      id: 'toy experiment name 1',
      timestamp: Date.now(),
      subsections: [],
      display: { collapsed: false },
    };
    // const code = "console.log('Hello from web worker!')";
    const section1: SecDefOfWorker = {
      kind: SecDefKind.WorkerCell,
      id: 'section 1',
      timestamp: Date.now(),
      cellCodeRef: {
        kind: CellCodeRefKind.InlineWorkerJsCode,
        js: '1 + 1;',
      },
      io: {
        inputs: {},
        inStreams: {},
        outputs: {},
        outStreamIds: [],
      },
      display: { collapsed: false },
    };
    const experiment = new Experiment(lab, [], exp1Data, new InMemoryDataResolver());
    await experiment.appendLeafSectionFromDataDef(section1);
    const section = [...experiment.sectionMap.values()][0];

    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection(), provideHttpClient()],
      imports: [CellSectionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CellSectionComponent);
    fixture.componentRef.setInput('section', section);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
