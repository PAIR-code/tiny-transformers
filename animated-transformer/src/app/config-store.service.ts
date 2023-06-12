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


import { Injectable } from '@angular/core';

import * as json5 from 'json5';
import * as jstree from '../lib/js_tree/js_tree';
import { GVariable } from '../lib/gtensor/gtensor';

export interface ModelData {
  name: string;
  kind: string;
  params: jstree.DictArrTree<GVariable<any>>;
}

export interface ConfigState<T> {
  str: string; // Most recent string value of user-provided config.
  obj: T;  // Last Valid condig Object.
  error?: string;  // Set iff `json.parse(str) !== obj`, and indicates when string is not valid.
}

export interface TrainingConfig {
  batchSize: number;
  nExamples: number;  // must be divisible by `batchSize`
  epochs: number;
  batchesPerEpoch: number;
}

export interface AppConfig {
  trainingConfig: TrainingConfig;
}

// export const defaultModelConfigStr = JSON.stringify(active_model.newDefaultModelData(), null, 2);

const defaultAppConfig: AppConfig = {
  // When training, returnAllParts in the config must not be present, and then we set the
  // batch size here.
  trainingConfig: {
    batchSize: 20,
    nExamples: 600,
    epochs: 2,
    // Why is this defined when batchSize and nExamples is already defined?
    batchesPerEpoch: 10,
  }
};

export const appConfigStr = JSON.stringify(defaultAppConfig, null, 2);


@Injectable({
  providedIn: 'root'
})
export class ConfigStoreService {
  public appConfig: ConfigState<AppConfig> = this.newDefaultAppConfig();
  public defaultStr = appConfigStr.slice();

  public modelKindInit: { [kind: string]: jstree.DictArrTree<GVariable<any>> } = {}

  constructor() {
  }

  // Returns a new copy of the default AppConfig.
  newDefaultAppConfig(): ConfigState<AppConfig> {
    return {
      str: appConfigStr.slice(),
      obj: json5.parse(appConfigStr)
    };
  }

  // Returns a new copy of the default AppConfig.
  newDefaultModelData(kind: string): ConfigState<ModelData> {
    if (!(kind in this.modelKindInit)) {
      throw new Error(`no such model kind: ${kind}`);
    }

    const str = json5.stringify(this.modelKindInit[kind]);
    return {
      str, obj: json5.parse(str)
    };
  }

  reset() {
    this.appConfig = this.newDefaultAppConfig();
  }

  updateAppConfig(configUpdate: ConfigState<AppConfig>) {
    this.appConfig = configUpdate;
  }
}
