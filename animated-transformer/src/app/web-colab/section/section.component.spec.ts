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

import { SectionComponent } from './section.component';
import { Experiment } from 'src/lib/weblab/experiment';
import { LabEnv } from 'src/lib/distr-signals/lab-env';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { MarkdownModule } from 'ngx-markdown';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { makeToyExperiment } from 'src/weblab-examples/toy-experiment';
import { provideHttpClient } from '@angular/common/http';

describe('SectionComponent', () => {
  let component: SectionComponent;
  let fixture: ComponentFixture<SectionComponent>;

  beforeEach(async () => {
    const space = new SignalSpace();
    const env = new LabEnv(space);
    const exp = await makeToyExperiment(env, 'toy experiment id');

    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection(), provideHttpClient()],
      imports: [MarkdownModule.forRoot(), SectionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SectionComponent);
    fixture.componentRef.setInput('experiment', exp);
    fixture.componentRef.setInput('section', exp.topLevelSections()[0]);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
