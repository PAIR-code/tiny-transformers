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

import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { CodemirrorConfigEditorModule } from '../../codemirror-config-editor/codemirror-config-editor.module';

import { ModelTaskTrainerComponent } from './model-task-trainer.component';
import { AutoCompletedTextInputComponent } from 'src/app/auto-completed-text-input/auto-completed-text-input.component';

describe('ModelTaskTrainerComponent', () => {
  let component: ModelTaskTrainerComponent;
  let fixture: ComponentFixture<ModelTaskTrainerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        BrowserAnimationsModule,
        FormsModule,
        ReactiveFormsModule,
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
        AutoCompletedTextInputComponent,
      ],
      declarations: [ModelTaskTrainerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ModelTaskTrainerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
