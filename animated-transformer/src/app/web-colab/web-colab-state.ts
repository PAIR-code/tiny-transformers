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

import { SerializedGTensor } from 'src/lib/gtensor/gtensor';
import * as json5 from 'json5';

export type ItemData<T> = {
  metaData: ItemMetaData;
  data: T;
};

export type ItemMetaData = {
  timestamp: Date;
};

type SavableItemData<T> = {
  metaData: SavableItemMetaData;
  data: T;
};

type SavableItemMetaData = {
  timestamp: number;
};

// Simple implementation with LocalStorage, should make better
// ones with file-system, and with indexDB.
export class WorkerState<Globals extends { [key: string]: any }> {
  async loadValue<Key extends keyof Globals & string>(
    inputName: Key
  ): Promise<ItemData<Globals[Key]> | null> {
    const json = localStorage.getItem(inputName);
    if (json === null) {
      return null;
    }
    const saveableItem = json5.parse(json) as SavableItemData<Globals[Key]>;
    const item: ItemData<Globals[Key]> = {
      data: saveableItem.data,
      metaData: { timestamp: new Date(saveableItem.metaData.timestamp) },
    };
    return item;
  }

  async saveValue<
    Key extends keyof Globals & string,
    Value extends Globals[Key]
  >(key: Key, value: Value): Promise<void> {
    const saveableItem: SavableItemData<Value> = {
      metaData: { timestamp: Date.now().valueOf() },
      data: value,
    };
    localStorage.setItem(key, json5.stringify(saveableItem));
  }
}

/* stuff for a filesystem based state */

/* 

  // having to add string here to avoid Typescript bug.
  async loadValueFromFile<Key extends keyof Globals & string>(
    inputFileName: Key
  ): Promise<Globals[Key]> {
    const fileHandle = await this.workingDir.getFileHandle(inputFileName);
    const file = await fileHandle.getFile();
    const dec = new TextDecoder('utf-8');
    const json = dec.decode(await file.arrayBuffer());
    let obj: Globals[Key];
    try {
      obj = json5.parse(json);
    } catch (e: unknown) {
      // Remark: Why don't errors come in trees, so one can provide
      // context in try/catch blocks?
      console.error(`Failed to parse ${inputFileName}.`);
      throw e;
    }
    // TODO: introduce concept of escaping & object registry.
    return obj;
  }
*/
