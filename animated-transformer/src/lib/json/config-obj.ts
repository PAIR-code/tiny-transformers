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

import { DictArrTree } from '../js_tree/js_tree';
import { JsonObj } from './json';
import { stringifyJsonValue } from './pretty_json';
import * as json5 from 'json5';

// Combines an instance of a class with the config that generates it so you can
// easily change the config and reconstruct it.
export class ConfigObj<ConfigT extends JsonObj, ObjT> {
  public configStr: string;
  public defaultConfigStr: string;
  public task: ObjT;

  constructor(public defaultConfig: ConfigT, public factory: (c: ConfigT) => ObjT) {
    this.configStr = stringifyJsonValue(defaultConfig);
    this.defaultConfigStr = this.configStr;
    this.task = this.factory(this.defaultConfig);
  }

  updateFromStr(s: string): void {
    this.configStr = s;
    const config: ConfigT = json5.parse(this.configStr);
    // TODO: add additional validtation stuff...?
    this.task = this.factory(config);
  }
}

// ----------------------------------------------------------------------------

export type JsonWithKind = DictArrTree<number | string | boolean> & { kind: string };

export type RegisterEntry<T> = {
  kind: string;
  defaultConfig: JsonWithKind;
  defaultConfigStr: string;
  makeFn: (newConfig: string) => T;
};

export class ConfigObjRegistry<T> {
  kinds: { [kind: string]: RegisterEntry<T> } = {};

  register<ConfigT extends JsonWithKind>(defaultConfig: ConfigT, factory: (c: ConfigT) => T) {
    const kind = defaultConfig.kind;
    if (kind in this.kinds) {
      throw new Error(`${kind} is already registered.`);
    }
    function makeFn(s: string): T {
      const config: ConfigT = json5.parse(s);
      return factory(config);
    }
    this.kinds[kind] = {
      kind,
      defaultConfig,
      defaultConfigStr: stringifyJsonValue(defaultConfig),
      makeFn,
    };
  }
}
