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


import { NgModule } from '@angular/core';
import { ActivationVisComponent } from './activation-vis.component';

import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
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
import { RouterModule } from '@angular/router';

import { AxisWrapperComponent } from './axis-wrapper/axis-wrapper.component';
import { NanValidatorDirective } from '../form-validators/nan-validator.directive';
import { BoundedFloatValidatorDirective } from '../form-validators/bounded-float-validator.directive';
import { CornerActivationComponent } from './corner-activation/corner-activation.component';
import { NnActivationComponent } from './nn-activation/nn-activation.component';
import { CircleActivationComponent } from './circle-activation/circle-activation.component';
import { ActivationManagerDirective } from './activation-manager.directive';
import { ActivationManagerComponent } from './activation-manager/activation-manager.component';
import { AutoCompletedTextInputComponent } from '../auto-completed-text-input/auto-completed-text-input.component';

@NgModule({
  declarations: [
    ActivationVisComponent,
    AxisWrapperComponent,
    NanValidatorDirective,
    BoundedFloatValidatorDirective,
    ActivationManagerDirective,
    CornerActivationComponent,
    NnActivationComponent,
    CircleActivationComponent,
    ActivationManagerComponent,
  ],
  imports: [
    AutoCompletedTextInputComponent,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    BrowserAnimationsModule,
    RouterModule,
    // ---
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatMenuModule,
    MatTableModule,
    // ---
    CodemirrorConfigEditorModule,
    TensorImageModule,
  ]
})
export class ActivationVisModule { }
