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

import {
  signal,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  effect,
  Signal,
  computed,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { BasicLmTask, BasicLmTaskUpdate } from 'src/lib/seqtasks/util';
import { stringifyJsonValue } from '../../../lib/pretty_json/pretty_json';
import {
  jsonStrListValidator,
  jsonStrListErrorFn,
  JsonStrListConfig,
} from '../../form-validators/json-str-list-validator.directive';

import {
  ModelUpdate,
  ModelSpecAndData,
  ModelData,
} from '../model-selector/model-selector.component';
import json5 from 'json5';
import {
  BehaviorSubject,
  combineLatest,
  filter,
  firstValueFrom,
  map,
  merge,
  Observable,
  shareReplay,
  startWith,
  tap,
} from 'rxjs';
import { computeDecoder, computePrediction } from 'src/lib/transformer/transformer_gtensor';

import { JsTreeLib, DictArrTree, DictTree } from 'src/lib/js_tree/js_tree'; 
import { gtensorTrees } from 'src/lib/gtensor/gtensor_tree'
import { GTensor, GTensorOrScalar, GVariable } from 'src/lib/gtensor/gtensor';

function typedGetData<N extends string>(params: DictTree<GVariable<N>>)
: DictArrTree<{shape: number[]; data: number[]}> {
  return gtensorTrees.map(params, (g: GTensorOrScalar) => ({
    shape: g.tensor.shape as number[],
    data: (Array.from(g.tensor.dataSync()) as number[])
  }));
}

@Component({
  selector: 'app-model-evaluator',
  templateUrl: './model-evaluator.component.html',
  styleUrls: ['./model-evaluator.component.scss'],
})
export class ModelEvaluatorComponent {
  input = signal([] as string[]);
  inputControl: FormControl<string | null>;
  currentModel = signal<ModelSpecAndData | null>(null);
  currentTask = signal<BasicLmTask | null>(null);
  // currentTask$: BehaviorSubject<BasicLmTask | null>;
  modelData: Signal<ModelData | null>;
  // taskAndModel$: Observable<{ model: ModelMetadata; task: BasicLmTask } | null>;
  validatorConfig = {} as JsonStrListConfig;
  modelOutput: string[] | null = null;

  @Input()
  set inputValue(inputUpdateStr: string | null) {
    this.inputControl.setValue(inputUpdateStr);
  }
  @Input()
  set model(modelUpdate: ModelUpdate) {
    this.modelOutput = null;
    this.currentModel.set(modelUpdate.model || null);
  };
  @Input()
  set task(taskUpdate: BasicLmTaskUpdate) {
    this.currentTask.set(taskUpdate.task || null);
  }
  @Output() evalInputUpdate = new EventEmitter<string>();

  constructor() {
    const strListValidator = jsonStrListValidator(this.validatorConfig);
    this.inputControl = new FormControl<string | null>('', strListValidator);
    this.inputControl.valueChanges.forEach((s) => {
      this.setInputValueFromString(s);
      if (s !== null) {
        this.evalInputUpdate.emit(s);
      }
    });

    this.modelData = computed(() => {
      const model = this.currentModel();
      if (!model) {
        return null;
      }
      return model.modelData();
    });

    // effect(() => console.log(`input updated: ${this.input()}`));
  }

  getCurrentTask(): BasicLmTask {
    const currentTask = this.currentTask();
    if (!currentTask) { throw new Error('no currentTask'); }
    return currentTask;
  }

  setInputValueFromString(s: string | null) {
    if (s !== null && !jsonStrListErrorFn(this.validatorConfig, s)) {
      this.input.set(json5.parse(s));
    }
  }

  downloadModel() {
    const modelData = this.modelData();
    if (!modelData) {
      throw new Error('no current trainState');
    }

    const spec = stringifyJsonValue(modelData.config.transformer.spec, {
      arrWrapAt: 60,
      objWrapAt: 60,
      curIndent: '',
      sortObjKeys: true,
    });
    const weightsTree = modelData.params.tree;
    
    const tokenEmbedding = (weightsTree as any)['tokenEmbedding'].variable;
    const tokenEmbeddingData = {
      shape: tokenEmbedding.shape,
      data: Array.from(tokenEmbedding.dataSync())
    };

    const layerData: any = [];
    (weightsTree as any).layers.forEach((layer: any) => {
      layerData.push(typedGetData(layer));
    });

    const serialized = {spec, tokenEmbeddingData, layerData};
    this.downloadJSON(serialized, 'model.json')
  }

  downloadJSON(data: any, fname: string) {
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fname;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  }

  evaluate() {
    const modelData = this.modelData();
    if (!modelData) {
      throw new Error('no current trainState');
    }

    const outputs = computePrediction(
      modelData.tokenRep,
      modelData.inputPrepFn,
      modelData.config.transformer.spec,
      modelData.params,
      [this.input()]
    );
    this.modelOutput = outputs[0];
  }

  downloadActivations() {
    const modelData = this.modelData();
    if (!modelData) {
      throw new Error('no current trainState');
    }
    const currentTask = this.getCurrentTask();
    const generator = currentTask.makeExamplesGenerator();

    const trainingData = [];
    const nExamplesToCollect = 1000;
    for (let i=0; i<nExamplesToCollect; i++) {
      const example = generator.next();
      const input = example.value!.input;

      const decoderOutputs = computeDecoder(
        modelData.tokenRep,
        modelData.inputPrepFn,
        modelData.config.transformer.spec,
        modelData.params,
        [input]);

      const output = decoderOutputs.layers[0].seqOuput;
      trainingData.push({
        'input': input,
        'mlpOutputs': {
          shape: output.tensor.shape,
          data: Array.from(output.tensor.dataSync())
        }
      });
    }

    this.downloadJSON(trainingData, 'sae_train_data.json');
  }

}
