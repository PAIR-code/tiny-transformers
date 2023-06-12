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


import * as _ from 'underscore';

import { Component, Input, OnInit } from '@angular/core';
import * as json5 from 'json5';
import { FormControl } from '@angular/forms';
import { firstValueFrom, Observable, tap, of, last, EMPTY, OperatorFunction, combineLatest, BehaviorSubject, ReplaySubject, Subscription } from 'rxjs';
import { map, startWith, shareReplay, take, mergeMap, distinctUntilChanged, skip, pairwise } from 'rxjs/operators';
import { stringifyJsonValue } from '../../../lib/pretty_json/pretty_json';
import { SimpleJsTreesLib, DictTree } from '../../../lib/js_tree/js_tree';
import { transformerAccuracy, TransformerConfig, TransformerParamLayerSpec, TransformerParams, TransformerParamSpec } from '../../../lib/transformer/transformer_gtensor';
import { ConfigUpdate } from '../../codemirror-config-editor/codemirror-config-editor.component';
import { Output, EventEmitter } from '@angular/core';
import { BasicLmTask, BasicLmTaskUpdate } from 'src/lib/seqtasks/util';
import { transformer } from 'src/lib';
import * as tf from '@tensorflow/tfjs';
import { BasicTaskTokenRep, StrSeqPrepFn, prepareBasicTaskTokenRep, strSeqPrepFn } from 'src/lib/tokens/token_gemb';
import { GVariableTree } from 'src/lib/gtensor/gtensor_tree';

export type JsonConfigData = DictTree<number | string | boolean>;

export type ModelConfig = {
  name: string;
  transformer: TransformerConfig;
}

export type ModelData = {
  // Locally cached version of the model config.
  config: ModelConfig;
  tokenRep: BasicTaskTokenRep;
  inputPrepFn: StrSeqPrepFn<'batch' | 'pos' | 'inputRep'>;
  params: GVariableTree<TransformerParams>;
  paramCount: number;
}

export class ModelSpecAndData {
  public config: ModelConfig;
  public configStr: string;
  public defaultConfigStr: string;

  public modelData?: ModelData;

  constructor(
    public kind: 'transformer',
    public defaultConfig: ModelConfig) {
    this.config =
      SimpleJsTreesLib.copy<JsonConfigData>(defaultConfig) as ModelConfig;
    this.configStr = stringifyJsonValue(this.config);
    this.defaultConfigStr = this.configStr;
  }

  updateFromStr(s: string): void {
    this.configStr = s;
    this.config = json5.parse(this.configStr);
  }
}

const layerSpec: TransformerParamLayerSpec = {
  nHeads: 4,
  hasPosEncoding: true,
  computeSpec: { residuals: true },
  layerNormFF: false,
  layerNormHeadsProjection: false,
  addLayerNormBias: false,
};

const defaultConfig: ModelConfig = {
  name: 'd=8 l=1 h=4, !layerN',
  transformer: {
    spec: {
      inputRep: 8,
      kqvRep: 8,
      layers: [layerSpec],
    },
    init: {
      stddev: 0.5,
      mean: 0,
      seed: 76,
    },
  }
};

const layerSpecWithNorm: TransformerParamLayerSpec = {
  nHeads: 4,
  hasPosEncoding: true,
  computeSpec: { residuals: true },
  layerNormFF: true,
  layerNormHeadsProjection: true,
  addLayerNormBias: false,
};

const transWithLayerNormed: ModelConfig = {
  name: 'd=8 l=1 h=4 +layerN',
  transformer: {
    spec: {
      inputRep: 8,
      kqvRep: 8,
      layers: [layerSpecWithNorm],
    },
    init: {
      stddev: 0.5,
      mean: 0,
      seed: 96
    },
  }
};

const simpleTransformer = new ModelSpecAndData(
  'transformer', defaultConfig);

const simpleTransformerWithLayerNorm = new ModelSpecAndData(
  'transformer', transWithLayerNormed);

export interface ModelUpdate {
  model: ModelSpecAndData | null;
}


// ----------------------------------------------------------------------------
@Component({
  selector: 'app-model-selector',
  templateUrl: './model-selector.component.html',
  styleUrls: ['./model-selector.component.scss']
})
export class ModelSelectorComponent implements OnInit {
  task: BasicLmTask | null = null;

  @Input()
  set taskUpdate(update: BasicLmTaskUpdate) {
    console.log('taskUpdate:', update);
    if (update.task) {
      this.task = update.task;
    } else {
      this.task = null;
    }
  };

  @Input()
  set modelName(n: string) {
    this.maybeSetModel(n);
  }

  @Output() modelChange = new EventEmitter<ModelUpdate>();
  isTraining: boolean = false;

  public get tfjsMemory(): string {
    return JSON.stringify(tf.memory(), null, 2);
  }

  // lossGraphVegaSpec: vegaembed.VisualizationSpec;
  // accGraphVegaSpec: vegaembed.VisualizationSpec;

  modelNameControl = new FormControl<string>('');
  view: 'edit' | 'view' = 'view';

  modelSet: ModelSpecAndData[] = [simpleTransformer, simpleTransformerWithLayerNorm];

  modelsByName: {
    [name: string]: ModelSpecAndData
  } = {}
  filteredModels$!: Observable<ModelSpecAndData[]>;
  currentModel$!: BehaviorSubject<ModelSpecAndData | null>;

  constructor() {
    this.reCreateModelNameIndex();
    this.currentModel$ = new BehaviorSubject<ModelSpecAndData | null>(null);

    // this.lossGraphVegaSpec = lossSpec(this.lossPoints);
    // this.accGraphVegaSpec = accSpec(this.accPoints);
  }

  reCreateModelNameIndex() {
    this.modelsByName = {};
    this.modelSet.forEach(m =>
      this.modelsByName[m.config.name.toLocaleLowerCase()] = m);
  }

  toggleModelEditor() {
    this.view = this.view === 'edit' ? 'view' : 'edit';
  }

  async maybeSetModel(maybeName: string | null) {
    const currentModel = await firstValueFrom(this.currentModel$);
    const currentModelName = currentModel ? currentModel.config.name : '';
    const newNameLc = (maybeName || '').toLocaleLowerCase();
    // console.log('---');
    // console.log('maybeSetModel maybeName:', maybeName);
    // console.log('maybeSetModel currentModelName:', currentModelName);
    // console.log('maybeSetModel modelNameControl:', this.modelNameControl.value);
    if (newNameLc in this.modelsByName) {
      const newModel = this.modelsByName[newNameLc];
      if (currentModelName !== newModel.config.name) {
        this.currentModel$.next(newModel);
        if (this.modelNameControl.value !== newModel.config.name) {
          this.modelNameControl.setValue(newModel.config.name);
        }
        this.modelChange.emit({ model: newModel });
      }
    } else {
      if (maybeName === null) {
        this.modelNameControl.setValue('');
      } else if (this.modelNameControl.value !== maybeName) {
        this.modelNameControl.setValue(maybeName);
      }
      if (currentModelName !== null) {
        this.modelChange.emit({ model: null });
        this.currentModel$.next(null);
      }
    }
  }

  ngOnInit(): void {
    this.filteredModels$ = this.modelNameControl.valueChanges.pipe(
      tap(s => this.maybeSetModel(s)),
      map(name => (name ? this._filter(name) : this.modelSet.slice())),
      startWith(this.modelSet.slice()),
      shareReplay(1));
  }

  private _filter(name: string): ModelSpecAndData[] {
    const filterValue = name.toLowerCase();

    const filteredModels = this.modelSet.filter(model => {
      return model.config.name.toLowerCase().includes(filterValue)
    });

    if (filteredModels.length <= 1
      //  && filteredTasks[0].config.name.toLowerCase() === filterValue
    ) {
      return this.modelSet;
    }

    return filteredModels;
  }

  modelConfigAsJson(model: ModelSpecAndData): string {
    return model.configStr;
    // stringifyJsonValue(model.config,
    // { wrapAt: 80, curIndent: '', sortObjKeys: true });
  }

  modelDataAsJson(modelData: TransformerParamSpec): string {
    return stringifyJsonValue(modelData,
      { arrWrapAt: 60, objWrapAt: 60, curIndent: '', sortObjKeys: true });
  }

  async modelConfigUpdated(event: unknown): Promise<void> {
    // When configUpdate has a new object, we assume it to be correct.
    //
    // TODO: provide some runtime value type checking. Right now all that is
    // needed is valid JSON/JSON5, but if you provide valid JSON missing needed
    // values (e.g. encoderConfig is null), it should complain here, but
    // currently does not.
    const configUpdate = event as ConfigUpdate<TransformerParamSpec>;

    if (configUpdate.close) {
      this.view = 'view';
    }

    if (configUpdate.error || !configUpdate.obj || !configUpdate.json) {
      // console.log(`configUpdated with no update: ${configUpdate}`);
      return;
    }

    const currentModel = await firstValueFrom(this.currentModel$);
    if (!currentModel) {
      console.error(`had null model for configUpdated: ${configUpdate}`);
      return;
    }
    currentModel.updateFromStr(configUpdate.json);
    // Model name was changed.
    if (currentModel.config.name !== this.modelNameControl.value) {
      if (!currentModel.config.name) {
        currentModel.config.name = 'model without a name'
      }
      // Because the name of the model may have changed, we need to re-create the
      // index
      this.reCreateModelNameIndex();
      this.modelNameControl.setValue(currentModel.config.name);
    }
    this.currentModel$.next(currentModel);
  }

  // TODO: think about if we should remove this?
  updateSelectedModel(event: unknown): void {
    // console.log('this.modelNameControl.value:', this.modelNameControl.value);
    // console.log('event:', event);
  }

  async initModelData() {
    const curModel = await firstValueFrom(this.currentModel$);
    if (!curModel) {
      throw new Error('no model set');
    }
    if (!this.task) {
      throw new Error('no task set');
    }
    if (curModel?.modelData) {
      // Dispose...
      // curModel.modelData.tokenRep
      curModel.modelData.params.forEach(g => g.dispose());
    }

    const config = _.clone(curModel.config);
    const tokenRep = prepareBasicTaskTokenRep(
      this.task.baseVocab, config.transformer.spec.inputRep);
    const params = transformer.initDecoderParamsTree(config.transformer);
    const paramCount = params.reduce(
      (count, paramObj) => count + paramObj.tensor.size, 0);
    curModel.modelData = {
      config, tokenRep, inputPrepFn: strSeqPrepFn, params, paramCount
    };

    // Make sure downstream consumers know we now have model data...
    this.modelChange.emit({ model: curModel });
  }

}
