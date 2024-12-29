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

import { CornerActivationComponent } from './corner-activation.component';

import {
  signal,
  Component,
  Input,
  OnInit,
  ViewChild,
  OnDestroy,
  Signal,
  WritableSignal,
} from '@angular/core';

import { TwoVarGTensorDataset } from 'src/lib/gtensor/the_16_two_var_bool_fns';
import { ActivationManagerComponent } from '../activation-manager/activation-manager.component';
import { AxisWrapperComponent } from '../axis-wrapper/axis-wrapper.component';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CodemirrorConfigEditorComponent } from 'src/app/codemirror-config-editor/codemirror-config-editor.component';
import { TensorImageComponent } from 'src/app/tensor-image/tensor-image.component';
import { MatInputModule } from '@angular/material/input';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

describe('CornerActivationComponent', () => {
  let component: CornerActivationComponent;
  let fixture: ComponentFixture<CornerActivationComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideNoopAnimations()],
      imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        MatInputModule,
        CodemirrorConfigEditorComponent,
        TensorImageComponent,
        AxisWrapperComponent,
        ActivationManagerComponent,
        CornerActivationComponent,
      ],
    });
    fixture = TestBed.createComponent(CornerActivationComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('view', 'vis');
    fixture.componentRef.setInput('dataset', null);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
