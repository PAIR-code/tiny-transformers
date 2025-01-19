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
import { stringifyJsonValue } from 'src/lib/json/pretty_json';
import { JsonValue } from 'src/lib/json/json';
import { LocalCacheStore } from 'src/lib/weblab/data-resolver';

const cache = new LocalCacheStore(stringifyJsonValue, json5.parse);

@Injectable({
  providedIn: 'root',
})
export class LocalCacheStoreService {
  cache: LocalCacheStore<JsonValue>;

  constructor() {
    this.cache = cache;
  }

  async load<T extends JsonValue>(path: string): Promise<T | null> {
    return cache.load(path) as Promise<T | null>;
  }

  async save<T extends JsonValue>(path: string, obj: T): Promise<void> {
    return cache.save(path, obj);
  }

  async delete(path: string): Promise<void> {
    cache.delete(path);
  }

  async saveDefault<T extends JsonValue>(obj: T): Promise<void> {
    cache.saveDefault(obj);
  }

  async loadDefault<T extends JsonValue>(): Promise<T | null> {
    return cache.loadDefault() as Promise<T | null>;
  }

  async deleteDefault(): Promise<void> {
    return cache.deleteDefault();
  }
}
