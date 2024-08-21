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
import {
  TrainerConfigUpdate,
  ModelParamsUpdate,
} from './model-task-trainer/model-task-trainer.component';

@Component({
  selector: 'app-animated-transformer',
  templateUrl: './animated-transformer.component.html',
  styleUrls: ['./animated-transformer.component.scss'],
})
export class AnimatedTransformerComponent implements OnInit {
  jsonComputation = '';
  modelName: string = '';
  taskName: string = '';
  trainerName: string = '';
  evalInputStr: string = '';
  lastTaskUpdate: BasicLmTaskUpdate = {};
  lastModelUpdate: ModelUpdate = { model: null };
  lastTrainerUpdate: TrainerConfigUpdate = { trainer: null };

  constructor(private route: ActivatedRoute, private router: Router) {
    console.log(`tf.getBackend: ${tf.getBackend()}`);
  }

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.modelName = params['model'] || '';
      this.taskName = params['task'] || '';
      this.trainerName = params['trainer'] || '';
      this.evalInputStr = params['input'] || '';
    });
  }

  updateTask(taskUpdate: BasicLmTaskUpdate) {
    this.taskName = taskUpdate.task ? taskUpdate.task.config.name : '';
    // Note: we need a new top level object so that compoents who look for a
    // new value of this.task will see one when it has been updated.
    // Note: we can't do the same thing directly with taskUpdate.task because
    // it's a class, and destructing/restructing a class breaks it.
    this.lastTaskUpdate = { ...taskUpdate };
    const queryParams = { task: this.taskName };
    // console.log('navigate to task: ', this.taskName);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      // remove to replace all query params by provided
      queryParamsHandling: 'merge',
    });
  }

  updateModel(modelUpdate: ModelUpdate) {
    this.modelName = modelUpdate.model ? modelUpdate.model.config.name : '';
    this.lastModelUpdate = { ...modelUpdate };
    const queryParams = { model: this.modelName };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      // remove to replace all query params by provided
      queryParamsHandling: 'merge',
    });
  }

  modelParamsUpdate(modelParamsUpdate: ModelParamsUpdate) {}

  updateTrainer(trainerUpdate: TrainerConfigUpdate) {
    console.log('trainer update in top level component.');
    this.trainerName = trainerUpdate.trainer ? trainerUpdate.trainer.config.name : '';
    this.lastTrainerUpdate = { ...trainerUpdate };
    const queryParams = { trainer: this.trainerName };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      // remove to replace all query params by provided
      queryParamsHandling: 'merge',
    });
  }

  updateEvalInput(input: string) {
    const queryParams = { input };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      // remove to replace all query params by provided
      queryParamsHandling: 'merge',
    });
  }
}
