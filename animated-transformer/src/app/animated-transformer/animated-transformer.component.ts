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

import { AfterViewInit, Component, OnInit } from '@angular/core';

import { CommonModule } from '@angular/common';
import { TransformerVisComponent } from './transformer-vis/transformer-vis.component';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { RouterModule } from '@angular/router';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
// import { TensorImageModule } from '../tensor-image/tensor-image.module';

import { CodemirrorConfigEditorComponent } from '../codemirror-config-editor/codemirror-config-editor.component';
import { SeqTaskSelectorComponent } from './seq-task-selector/seq-task-selector.component';
import { ModelSelectorComponent } from './model-selector/model-selector.component';
// import { VegaChartModule } from '../vega-chart/vega-chart.module';
import { D3LineChartComponent } from '../d3-line-chart/d3-line-chart.component';
import { ModelTaskTrainerComponent } from './model-task-trainer/model-task-trainer.component';
import { ModelEvaluatorComponent } from './model-evaluator/model-evaluator.component';
// import { ModelTaskTrainerComponent } from './model-task-trainer/model-task-trainer.component';
// import { NanValidatorDirective } from '../form-validators/nan-validator.directive';
// import { BoundedFloatValidatorDirective } from '../form-validators/bounded-float-validator.directive';
import { AutoCompletedTextInputComponent } from '../auto-completed-text-input/auto-completed-text-input.component';
import { TokenSeqDisplayComponent } from '../token-seq-display/token-seq-display.component';

import * as tf from '@tensorflow/tfjs';
import { Router, ActivatedRoute } from '@angular/router';
import { BasicLmTaskUpdate } from 'src/lib/seqtasks/util';
import { ModelUpdate } from './model-selector/model-selector.component';
import { ModelParamsUpdate } from './model-task-trainer/model-task-trainer.component';
// import { TinyModelsService } from '../tiny-models.service';
import { JsonStrListValidatorDirective } from '../form-validators/json-str-list-validator.directive';

@Component({
  selector: 'app-animated-transformer',
  templateUrl: './animated-transformer.component.html',
  styleUrls: ['./animated-transformer.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    JsonStrListValidatorDirective,
    // --
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatTableModule,
    // ---
    CodemirrorConfigEditorComponent,
    // VegaChartModule,
    D3LineChartComponent,
    SeqTaskSelectorComponent,
    ModelEvaluatorComponent,
    ModelTaskTrainerComponent,
    AutoCompletedTextInputComponent,
    TokenSeqDisplayComponent,
    ModelSelectorComponent,
    AnimatedTransformerComponent,
    TransformerVisComponent,
  ],
})
export class AnimatedTransformerComponent {
  jsonComputation = '';
  modelName: string = '';
  taskName: string = '';
  trainerName: string = '';
  evalInputStr: string = '';
  lastTaskUpdate: BasicLmTaskUpdate = {};
  lastModelUpdate: ModelUpdate = { model: null };
  // lastTrainerUpdate: TrainerConfigUpdate = { trainer: null };

  constructor() {
    console.log(`tf.getBackend: ${tf.getBackend()}`);
  }
}
