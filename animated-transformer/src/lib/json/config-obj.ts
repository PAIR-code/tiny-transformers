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

import _ from 'underscore';
import { DictArrTree } from '../js_tree/js_tree';
import { stringifyJsonValue } from './pretty_json';
import json5 from 'json5';

export type JsonWithKind = DictArrTree<number | string | boolean> & { kind: string };

// Combines an instance of a class with the config that generates it so you can
// easily change the config and reconstruct it.
export class ConfigObj<ConfigT extends JsonWithKind> {
  public configStr: string;
  public defaultConfigStr: string;
  public config: ConfigT;

  constructor(defaultConfig: ConfigT, defaultConfigStr: string) {
    this.configStr = defaultConfigStr;
    this.defaultConfigStr = defaultConfigStr;
    this.config = structuredClone(defaultConfig);
  }

  updateFromStr(s: string): void {
    this.configStr = s;
    // TODO: consider validity checking...?
    this.config = json5.parse(this.configStr);
  }
}

// ----------------------------------------------------------------------------

export type ConfigKind<Config extends JsonWithKind, T> = {
  kind: string;
  defaultConfig: Config;
  defaultConfigStr: string;
  makeFn: (newConfig: string) => T;
  makeDefault: () => T;
  configFn: (obj: T) => JsonWithKind;
};

export class ConfigKindRegistry<T extends { config: JsonWithKind }> {
  kinds: { [kind: string]: ConfigKind<JsonWithKind, T> } = {};

  register<ConfigT extends JsonWithKind, T2 extends T>(
    defaultConfig: ConfigT,
    makeFromConfigFn: (c: ConfigT) => T2
  ): ConfigKind<ConfigT, T2> {
    const kind = defaultConfig.kind;
    if (kind in this.kinds) {
      throw new Error(`${kind} is already registered.`);
    }
    function makeFn(s: string): T {
      let config: ConfigT;
      try {
        config = json5.parse(s);
      } catch (e) {
        console.warn(e);
        console.error(`Cannot make '${kind}', string parsing failed... \n'''\n${s}\n'''`);
        throw new Error('register failed.');
      }
      return makeFromConfigFn(config);
    }
    const defaultConfigStr = stringifyJsonValue(defaultConfig);
    const configKind: ConfigKind<ConfigT, T> = {
      kind,
      defaultConfig,
      defaultConfigStr,
      makeFn,
      makeDefault: () => makeFn(defaultConfigStr),
      configFn: (obj) => obj.config as ConfigT,
    };
    this.kinds[kind] = configKind;
    return configKind as unknown as ConfigKind<ConfigT, T2>;
  }
}
