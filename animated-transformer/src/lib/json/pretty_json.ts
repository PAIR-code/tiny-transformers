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

import { stringifyTube, Tube, LeafTube, ArrTube, ObjTube, StringifyConfig } from '../tubes/tubes';
import { JsonValue } from './json';

// ----------------------------------------------------------------------------
export function tubeifyJsonValue(value: JsonValue): Tube {
  switch (typeof value) {
    case 'string':
      return new LeafTube(value);
    case 'number':
      return new LeafTube(value);
    case 'boolean':
      return new LeafTube(value);
    case 'object':
      // null case.
      if (!value) {
        return new LeafTube(null);
      }
      // JsonArray.
      if (Array.isArray(value)) {
        const arrTube = new ArrTube();
        value.forEach((v, i) => {
          arrTube.addArrChild(tubeifyJsonValue(v));
        });
        return arrTube;
      }
      // JsonObj.
      const objTube = new ObjTube();
      for (const k of Object.keys(value)) {
        // For every normal object key that is not assigned to undefined add a
        // printout for it's key.
        //
        // This treats an object { foo: undefined } to have the same serialization as {}
        if (Object.prototype.hasOwnProperty.call(value, k) && value[k] !== undefined) {
          const child = tubeifyJsonValue(value[k]);
          objTube.addKeyChild(k, child);
        }
      }
      return objTube;
  }
}

export function stringifyJsonValue(value: JsonValue, config?: Partial<StringifyConfig>): string {
  const completeConfig = {
    quoteAllKeys: false,
    curIndent: '',
    arrWrapAt: 60,
    objWrapAt: 60,
    sortObjKeys: true,
    ...config,
  };
  return stringifyTube(completeConfig, tubeifyJsonValue(value));
}
