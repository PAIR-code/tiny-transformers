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

import * as tf from '@tensorflow/tfjs';
import { Router, ActivatedRoute } from '@angular/router';
import { BasicLmTaskUpdate } from 'src/lib/seqtasks/util';
import { ModelUpdate } from './model-selector/model-selector.component';
import { ModelParamsUpdate } from './model-task-trainer/model-task-trainer.component';
import { TinyModelsService } from '../tiny-models.service';

@Component({
  selector: 'app-animated-transformer',
  templateUrl: './animated-transformer.component.html',
  styleUrls: ['./animated-transformer.component.scss'],
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
