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
import { stringifyJsonValue } from 'src/lib/json/pretty_json';
import { JsonValue } from 'src/lib/json/json';

function itemPathToId(path: string): string {
  return `file:${path}`;
}

const DEFAULT_STORAGE_ID = 'defaultFilePath';

@Injectable({
  providedIn: 'root',
})
export class LocalCacheStoreService {
  constructor() {}

  async loadFileCache<T = unknown>(path: string): Promise<T | null> {
    const s = localStorage.getItem(itemPathToId(path));
    if (!s) {
      return null;
    }

    return json5.parse(s);
  }

  async saveFileCache<T extends JsonValue>(path: string, obj: T): Promise<void> {
    localStorage.setItem(itemPathToId(path), stringifyJsonValue(obj));
  }

  async deleteFileCache(path: string): Promise<void> {
    localStorage.removeItem(path);
  }

  async setDefaultFile(path: string): Promise<void> {
    localStorage.setItem(DEFAULT_STORAGE_ID, path);
  }

  async getDefaultFile(): Promise<string | null> {
    return localStorage.getItem(DEFAULT_STORAGE_ID);
  }
}
