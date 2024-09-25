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

import {
  Component,
  Input,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  effect,
  signal,
} from '@angular/core';
import json5 from 'json5';
import { FormControl } from '@angular/forms';
import { stringifyJsonValue } from '../../../lib/json/pretty_json';
import { DictTree } from '../../../lib/js_tree/js_tree';
import * as jstree from '../../../lib/js_tree/js_tree';
import {
  TransformerConfig,
  TransformerModel,
  transformerModelKind,
} from '../../../lib/transformer/transformer_gtensor';
import { ConfigUpdate } from '../../codemirror-config-editor/codemirror-config-editor.component';
import { Output, EventEmitter } from '@angular/core';
import { BasicLmTaskUpdate, BasicRandLmTask } from 'src/lib/seqtasks/util';
import { transformer } from 'src/lib';
import * as tf from '@tensorflow/tfjs';
import { prepareBasicTaskTokenRep } from 'src/lib/tokens/token_gemb';
import { GTensor } from 'src/lib/gtensor/gtensor';
import { ConfigKind } from 'src/lib/json/config-obj';
import { nullableEqFn } from 'src/lib/utils';
import { disposeParams } from 'src/lib/gtensor/params';
import { TinyModelsService } from 'src/app/tiny-models.service';

// export class ModelSpecAndData {
//   public config: TransformerConfig;
//   public configStr: string;
//   public defaultConfigStr: string;

//   public modelData: WritableSignal<TransformerModel | null> = signal(null);

//   constructor(public kind: 'transformer', public defaultConfig: TransformerConfig) {
//     this.config = structuredClone(defaultConfig);
//     this.configStr = stringifyJsonValue(this.config);
//     this.defaultConfigStr = this.configStr;
//   }

//   updateFromStr(s: string): void {
//     this.configStr = s;
//     this.config = json5.parse(this.configStr);
//   }
// }

// const simpleTransformer = new ModelSpecAndData('transformer', defaultConfig);

// const simpleTransformerWithLayerNorm = new ModelSpecAndData('transformer', transWithLayerNormed);

export interface ModelUpdate {
  model: TransformerModel | null;
}

// ----------------------------------------------------------------------------
@Component({
  selector: 'app-model-selector',
  templateUrl: './model-selector.component.html',
  styleUrls: ['./model-selector.component.scss'],
})
export class ModelSelectorComponent {
  isTraining: boolean = false;

  public get tfjsMemory(): string {
    return JSON.stringify(tf.memory(), null, 2);
  }

  // lossGraphVegaSpec: vegaembed.VisualizationSpec;
  // accGraphVegaSpec: vegaembed.VisualizationSpec;

  modelNameControl = new FormControl<string>('');
  view: 'edit' | 'view' = 'view';

  currentConfig = signal<TransformerConfig | null>(null, { equal: (a, b) => _.isEqual(a, b) });
  currentModel: Signal<TransformerModel | null>;
  paramCount: Signal<number>;
  lastModelValue: TransformerModel | null = null;

  constructor(public tmService: TinyModelsService) {
    this.currentModel = computed(() => this.initModelData());

    this.paramCount = computed(() => {
      const model = this.currentModel();
      if (!model) {
        return -1;
      }
      // TODO: kind of ugly to need the any here.
      return jstree.reduce<GTensor<any>, number>(
        (count, paramObj) => count + paramObj.tensor.size,
        0,
        model.params
      );
    });
  }

  currentDefaultConfigStr(): string {
    return this.tmService.modelConfigDefaultStr;
  }

  currentConfigStr(): string {
    const curConfig = this.currentConfig();
    if (curConfig) {
      return stringifyJsonValue(curConfig);
    } else {
      return '<currentTaskConfigStr: undefined config>';
    }
  }

  initModelData(): TransformerModel | null {
    const config = this.currentConfig();
    if (!config) {
      return null;
    }
    if (this.lastModelValue) {
      disposeParams(this.lastModelValue.params);
    }
    this.lastModelValue = modelMakerMap[config.kind].makeFn(JSON.stringify(config));
    return this.lastModelValue;
  }

  toggleModelEditor() {
    this.view = this.view === 'edit' ? 'view' : 'edit';
  }

  maybeSetModel(maybeName: string | null) {
    this.currentConfig.set(this.modelsMap()[maybeName || ''] || null);
  }

  modelConfigAsJson(model: TransformerModel): string {
    return stringifyJsonValue(model.config, {
      arrWrapAt: 60,
      objWrapAt: 60,
      curIndent: '',
      sortObjKeys: true,
    });
    // stringifyJsonValue(model.config,
    // { wrapAt: 80, curIndent: '', sortObjKeys: true });
  }

  modelDataAsJson(modelData: TransformerConfig): string {
    return stringifyJsonValue(modelData, {
      arrWrapAt: 60,
      objWrapAt: 60,
      curIndent: '',
      sortObjKeys: true,
    });
  }

  modelConfigUpdated(configUpdate: ConfigUpdate<TransformerConfig>): void {
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

    this.tmService;
    this.currentConfig.set(configUpdate.obj);
  }
}
