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


import { signal, Component, EventEmitter, Input, OnInit, Output, effect } from '@angular/core';
import { FormControl } from '@angular/forms';
import { jsonStrListValidator, jsonStrListErrorFn, JsonStrListConfig } from '../../form-validators/json-str-list-validator.directive';

import { ModelUpdate, ModelSpecAndData, ModelData } from '../model-selector/model-selector.component';
import * as json5 from 'json5';
import { BehaviorSubject, combineLatest, filter, firstValueFrom, map, merge, Observable, shareReplay, startWith, tap } from 'rxjs';
import { computePrediction } from 'src/lib/transformer/transformer_gtensor';
import { mapNonNull } from 'src/lib/rxjs/util';

@Component({
  selector: 'app-model-evaluator',
  templateUrl: './model-evaluator.component.html',
  styleUrls: ['./model-evaluator.component.scss']
})
export class ModelEvaluatorComponent {
  input = signal([] as string[]);
  inputControl: FormControl<string | null>;
  currentModel$: BehaviorSubject<ModelSpecAndData | null>;
  // currentTask$: BehaviorSubject<BasicLmTask | null>;
  modelData$: Observable<ModelData | null>;
  // taskAndModel$: Observable<{ model: ModelMetadata; task: BasicLmTask } | null>;
  validatorConfig = {} as JsonStrListConfig;
  modelOutput: string[] | null = null;

  @Input()
  set inputValue(inputUpdateStr: string | null) {
    this.inputControl.setValue(inputUpdateStr);
  };
  @Input()
  set model(modelUpdate: ModelUpdate) {
    this.modelOutput = null;
    this.currentModel$.next(modelUpdate.model || null);
  };
  @Output() evalInputUpdate = new EventEmitter<string>();

  constructor() {
    const strListValidator = jsonStrListValidator(this.validatorConfig)
    this.inputControl = new FormControl<string | null>('', strListValidator);
    this.inputControl.valueChanges.forEach(
      s => {
        this.setInputValueFromString(s);
        if (s !== null) {
          this.evalInputUpdate.emit(s);
        }
      });

    this.currentModel$ = new BehaviorSubject<ModelSpecAndData | null>(null);
    this.modelData$ = this.currentModel$.pipe(
      mapNonNull(m => m.modelData || null)
    );

    effect(() => console.log(`input updated: ${this.input()}`));
  }

  setInputValueFromString(s: string | null) {
    if (s !== null && !jsonStrListErrorFn(this.validatorConfig, s)) {
      this.input.set(json5.parse(s));
    }
  }

  async evaluate() {
    const modelData = await firstValueFrom(this.modelData$);
    if (!modelData) {
      throw new Error('no current trainState');
    }

    const outputs = computePrediction(
      modelData.tokenRep,
      modelData.inputPrepFn,
      modelData.config.transformer.spec,
      modelData.params,
      [this.input()]);
    this.modelOutput = outputs[0];
  }

}
