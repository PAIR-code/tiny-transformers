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

import { ActivationVisComponent } from './activation-vis.component';

import { CommonModule } from '@angular/common';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TensorImageModule } from '../tensor-image/tensor-image.module';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { CodemirrorConfigEditorModule } from '../codemirror-config-editor/codemirror-config-editor.module';
import { RouterTestingModule } from '@angular/router/testing';

import { AxisWrapperComponent } from './axis-wrapper/axis-wrapper.component';
import { NanValidatorDirective } from '../form-validators/nan-validator.directive';
import { BoundedFloatValidatorDirective } from '../form-validators/bounded-float-validator.directive';
import { ActivationManagerDirective } from './activation-manager.directive';
import { CornerActivationComponent } from './corner-activation/corner-activation.component';
import { AutoCompletedTextInputComponent } from '../auto-completed-text-input/auto-completed-text-input.component';

describe('ActivationVisComponent', () => {
  let component: ActivationVisComponent;
  let fixture: ComponentFixture<ActivationVisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        NoopAnimationsModule,
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        RouterTestingModule,
        // ---
        MatButtonModule,
        MatIconModule,
        MatInputModule,
        MatMenuModule,
        MatListModule,
        MatAutocompleteModule,
        MatTableModule,
        MatCardModule,
        // ---
        CodemirrorConfigEditorModule,
        TensorImageModule,
        AutoCompletedTextInputComponent,
      ],
      declarations: [
        ActivationVisComponent,
        AxisWrapperComponent,
        ActivationManagerDirective,
        CornerActivationComponent,
        NanValidatorDirective,
        BoundedFloatValidatorDirective,
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ActivationVisComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
