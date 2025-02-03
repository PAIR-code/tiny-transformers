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
/* 
  Service to wrap a basic abstraction for local browser caching of data,
  currently using localStorage, but can be migrate to indexDB later. 
*/

import { Injectable } from '@angular/core';
import json5 from 'json5';
import { stringifyJsonValue } from 'src/lib/json/pretty_json';
import { JsonValue } from 'src/lib/json/json';
import { defaultLocalCacheStore } from 'src/lib/data-resolver/data-resolver';

@Injectable({
  providedIn: 'root',
})
export class LocalCacheStoreService {
  cache = defaultLocalCacheStore;

  constructor() {}

  async load(path: string): Promise<string> {
    return this.cache.load(path) as Promise<string>;
  }

  async save(path: string, obj: string): Promise<void> {
    return this.cache.save(path, obj);
  }

  async delete(path: string): Promise<void> {
    this.cache.delete(path);
  }

  async saveDefault(obj: string): Promise<void> {
    this.cache.saveDefault(obj);
  }

  async loadDefault(): Promise<string> {
    return this.cache.loadDefault() as Promise<string>;
  }

  async deleteDefault(): Promise<void> {
    return this.cache.deleteDefault();
  }
}
