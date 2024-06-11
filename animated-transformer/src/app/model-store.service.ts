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
import json5 from 'json5';
import { ConfigStoreService, ModelData } from './config-store.service';

@Injectable({
  providedIn: 'root',
})
export class ModelStoreService {
  public models: { [name: string]: ModelData } = {};

  constructor(private configStore: ConfigStoreService) {
    this.loadAllModels();
  }

  loadAllModels(): { [name: string]: ModelData } {
    const modelsStr = localStorage.getItem('models');

    let models: { [name: string]: ModelData } = {};
    if (modelsStr) {
      models = json5.parse(modelsStr);
    }
    // if (Object.keys(this.models).length === 0) {
    //   const appConfig: AppConfig = json5.parse(appConfigStr.slice());
    //   const modelData : ModelData = {
    //     name: 'un-named new model',
    //     config: appConfig.encoderConfig
    //   };
    //   models[modelData.name] = modelData;
    // }
    this.models = models;
    return models;
  }

  addToyModel(kind: string): ModelData {
    const modelData: ModelData = this.configStore.newDefaultModelData(kind).obj;
    this.models[modelData.name] = modelData;
    return modelData;
  }

  saveAllModels() {
    localStorage.setItem('models', JSON.stringify(this.models));
  }

  async save(modelData: ModelData): Promise<void> {
    this.models[modelData.name] = JSON.parse(JSON.stringify(modelData));
    this.saveAllModels();
  }

  async load(name: string): Promise<ModelData | null> {
    if (!(name in this.models)) {
      return null;
    }
    return JSON.parse(JSON.stringify(this.models[name]));
  }

  async delete(name: string): Promise<void> {
    delete this.models[name];
    this.saveAllModels();
  }
}
