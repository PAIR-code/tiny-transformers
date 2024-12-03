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

import { GTensor, GVariable } from '../gtensor/gtensor';
import { DictArrTree } from '../js_tree/js_tree';
import { ConfigKindRegistry, JsonWithKind } from '../json/config-obj';
import { Expand, ExpandOnce } from '../ts-type-helpers';

export type Model<Config extends JsonWithKind, Params extends DictArrTree<GTensor<any>>> = {
  config: Config;
  params: Params;
};
export type SomeModel = ExpandOnce<Model<JsonWithKind, DictArrTree<GTensor<any>>>>;

export const modelRegistry = new ConfigKindRegistry<SomeModel>();

// TODO: think about better error handling, we probably want to be able to
// separate parse errors from config validity errors from missing task.
export function makeModel(kind: string, configStr?: string): SomeModel {
  const entry = modelRegistry.kinds[kind];
  if (!entry) {
    throw new Error(`makeTask: no such kind ${kind}`);
  }
  return entry.makeFn(configStr || entry.defaultConfigStr);
}
