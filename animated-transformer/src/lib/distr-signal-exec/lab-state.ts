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

import { unpack, pack } from 'msgpackr';
import { addExtension, Packr } from 'msgpackr';
import { GTensor } from '../gtensor/gtensor';

declare let localStorage: {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

let extPackr = new Packr();
addExtension({
  Class: GTensor,
  type: 1, // register your own extension code (a type code from 1-100)
  pack(instance: GTensor<any>) {
    // define how your custom class should be encoded
    const serialsed = instance.toSerialised();
    const buffer = pack(serialsed);
    return buffer; // return a buffer
  },
  unpack(buffer: Uint8Array) {
    const obj = unpack(buffer);
    return GTensor.fromSerialised(obj);
  },
});

export type ItemData<T> = {
  metaData: ItemMetaData;
  data: T;
};

export type ItemMetaData = {
  timestamp: Date;
};

// Converts an ArrayBuffer to a string.
export function arrayBufferToString(buffer: ArrayBuffer): string {
  var bytes = new Uint8Array(buffer);
  const chars = Array.from(bytes, (b) => String.fromCharCode(b));
  return chars.join('');
}

// Converts a string to an ArrayBuffer.
export function stringToArrayBuffer(s: string): ArrayBuffer {
  var buffer = new ArrayBuffer(s.length);
  var bytes = new Uint8Array(buffer);
  for (var i = 0; i < s.length; ++i) {
    bytes[i] = s.charCodeAt(i);
  }
  return buffer;
}

/// <Globals extends { [key: string]: any }>
// Key extends keyof Globals & string

// Simple implementation with LocalStorage, should make better
// ones with file-system, and with indexDB.

export class LabState {
  async loadValue<Value>(inputName: string): Promise<ItemData<Value> | null> {
    const s = localStorage.getItem(inputName);
    if (s === null) {
      return null;
    }
    const item = extPackr.unpack(new Uint8Array(stringToArrayBuffer(s)));
    return item;
  }

  async saveValue<Value>(key: string, value: Value): Promise<void> {
    localStorage.setItem(
      key,
      // TODO: this type conversion is likely wrong.
      arrayBufferToString(
        extPackr.pack({ metaData: { timestamp: new Date() }, data: value }) as never as ArrayBuffer,
      ),
    );
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
