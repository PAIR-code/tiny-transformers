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

import { Component, Input, OnInit, Signal, WritableSignal, computed, signal } from '@angular/core';
import json5 from 'json5';
import { FormControl } from '@angular/forms';
import { stringifyJsonValue } from '../../../lib/json/pretty_json';
import { DictTree } from '../../../lib/js_tree/js_tree';
import * as jstree from '../../../lib/js_tree/js_tree';
import {
  transformerAccuracy,
  TransformerConfig,
  TransformerParamLayerSpec,
  TransformerParams,
  TransformerParamSpec,
  VarTransformerParams,
} from '../../../lib/transformer/transformer_gtensor';
import { ConfigUpdate } from '../../codemirror-config-editor/codemirror-config-editor.component';
import { Output, EventEmitter } from '@angular/core';
import { BasicLmTask, BasicLmTaskUpdate } from 'src/lib/seqtasks/util';
import { transformer } from 'src/lib';
import * as tf from '@tensorflow/tfjs';
import {
  BasicTaskTokenRep,
  StrSeqPrepFn,
  prepareBasicTaskTokenRep,
  strSeqPrepFn,
} from 'src/lib/tokens/token_gemb';
import { GTensor } from 'src/lib/gtensor/gtensor';

export type JsonConfigData = DictTree<number | string | boolean>;

export type ModelConfig = {
  name: string;
  transformer: TransformerConfig;
};

export type ModelData = {
  // Locally cached version of the model config.
  config: ModelConfig;
  tokenRep: BasicTaskTokenRep;
  inputPrepFn: StrSeqPrepFn<TransformerParams, 'batch' | 'pos' | 'inputRep'>;
  params: VarTransformerParams;
  paramCount: number;
};

export class ModelSpecAndData {
  public config: ModelConfig;
  public configStr: string;
  public defaultConfigStr: string;

  public modelData: WritableSignal<ModelData | null> = signal(null);

  constructor(public kind: 'transformer', public defaultConfig: ModelConfig) {
    this.config = structuredClone(defaultConfig);
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
  },
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
      seed: 96,
    },
  },
};

const simpleTransformer = new ModelSpecAndData('transformer', defaultConfig);

const simpleTransformerWithLayerNorm = new ModelSpecAndData('transformer', transWithLayerNormed);

export interface ModelUpdate {
  model: ModelSpecAndData | null;
}

const initModels: ModelSpecAndData[] = [simpleTransformer, simpleTransformerWithLayerNorm];
const initModelsMap: { [name: string]: ModelSpecAndData } = {};
initModels.forEach((m) => (initModelsMap[m.config.name] = m));

// ----------------------------------------------------------------------------
@Component({
  selector: 'app-model-selector',
  templateUrl: './model-selector.component.html',
  styleUrls: ['./model-selector.component.scss'],
})
export class ModelSelectorComponent {
  task: BasicLmTask | null = null;

  @Input()
  set taskUpdate(update: BasicLmTaskUpdate) {
    if (update.task) {
      this.task = update.task;
    } else {
      this.task = null;
    }
  }

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

  modelsMap = signal(initModelsMap);
  currentModel = signal<ModelSpecAndData | null>(null);
  currentModelName: Signal<string>;
  modelNames: Signal<string[]>;

  constructor() {
    this.currentModelName = computed(() => {
      const model = this.currentModel();
      return model ? model.config.name : '';
    });

    this.modelNames = computed(() => Object.keys(this.modelsMap()));
  }

  toggleModelEditor() {
    this.view = this.view === 'edit' ? 'view' : 'edit';
  }

  maybeSetModel(maybeName: string | null) {
    const newModel = this.modelsMap()[maybeName || ''] || null;
    if (newModel !== this.currentModel()) {
      this.currentModel.set(newModel);
      this.modelChange.emit({ model: newModel });
    }
  }

  modelConfigAsJson(model: ModelSpecAndData): string {
    return model.configStr;
    // stringifyJsonValue(model.config,
    // { wrapAt: 80, curIndent: '', sortObjKeys: true });
  }

  modelDataAsJson(modelData: TransformerParamSpec): string {
    return stringifyJsonValue(modelData, {
      arrWrapAt: 60,
      objWrapAt: 60,
      curIndent: '',
      sortObjKeys: true,
    });
  }

  modelConfigUpdated(configUpdate: ConfigUpdate<TransformerParamSpec>): void {
    // When configUpdate has a new object, we assume it to be correct.
    //
    // TODO: provide some runtime value type checking. Right now all that is
    // needed is valid JSON/JSON5, but if you provide valid JSON missing needed
    // values (e.g. encoderConfig is null), it should complain here, but
    // currently does not.
    if (configUpdate.close) {
      this.view = 'view';
    }

    if (configUpdate.error || !configUpdate.obj || !configUpdate.json) {
      // console.log(`configUpdated with no update: ${configUpdate}`);
      return;
    }

    const currentModel = this.currentModel();
    if (!currentModel) {
      console.error(`had null model for configUpdated: ${configUpdate}`);
      return;
    }

    const newModel = new ModelSpecAndData(currentModel.kind, currentModel.defaultConfig);
    newModel.updateFromStr(configUpdate.json);
    // Model name was changed.
    if (newModel.config.name !== currentModel.config.name) {
      const newModelsMap = { ...this.modelsMap() };
      delete newModelsMap[currentModel.config.name];
      newModelsMap[newModel.config.name] = newModel;
      this.modelsMap.set(newModelsMap);
    }
    this.currentModel.set(newModel);
    this.modelChange.emit({ model: newModel });
  }

  initModelData() {
    const curModel = this.currentModel();
    if (!curModel) {
      throw new Error('no model set');
    }
    if (!this.task) {
      throw new Error('no task set');
    }
    const modelData = curModel.modelData();
    if (modelData) {
      // Dispose...
      // curModel.modelData.tokenRep
      jstree.forEach((g: GTensor<any>) => g.dispose(), modelData.params);
    }

    const config = _.clone(curModel.config);
    const tokenRep = prepareBasicTaskTokenRep(this.task.baseVocab);
    const params = transformer.initDecoderVarParams(tokenRep, config.transformer);
    const paramCount = jstree.reduce<GTensor<any>, number>(
      (count, paramObj) => count + paramObj.tensor.size,
      0,
      params
    );
    curModel.modelData.set({
      config,
      tokenRep,
      inputPrepFn: strSeqPrepFn,
      params,
      paramCount,
    });
  }
}
