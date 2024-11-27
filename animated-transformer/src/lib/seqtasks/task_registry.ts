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
import { ConfigKindRegistry } from '../json/config-obj';
import {
  DecisionBoundaryTask,
  DecisionBoundaryTaskConfig,
  defaultDecisionBoundaryTaskConfig,
} from './decision_boundary_task';
import { defaultSecretTokenTaskConfig, SecretTokenTaskConfig } from './secret_token_task';
import { defaultSwapTaskConfig, SwapTaskConfig } from './swap_task';
import { defaultTinyWorldTaskConfig, TinyWorldTask, TinyWorldTaskConfig } from './tiny_worlds';
import { BasicLmTask, BasicLmTaskConfig } from './util';

// export type TaskConfig =
//   | TinyWorldTaskConfig
//   | DecisionBoundaryTaskConfig
//   | SwapTaskConfig
//   | SecretTokenTaskConfig<string>;

// export const taskConfigDefaults: TaskConfig[] = [
//   defaultTinyWorldTaskConfig,
//   defaultDecisionBoundaryTaskConfig,
//   defaultSwapTaskConfig,
//   defaultSecretTokenTaskConfig,
// ];

// TODO: think hard about this 'any'...
export const taskRegistry = new ConfigKindRegistry<BasicLmTask<BasicLmTaskConfig<{}>>>();

// TODO: think about better error handling, we probably want to be able to
// separate parse errors from config validity errors from missing task.
export function makeTask(kind: string, configStr?: string): BasicLmTask<BasicLmTaskConfig<{}>> {
  const entry = taskRegistry.kinds[kind];
  if (!entry) {
    throw new Error(`makeTask: no such kind ${kind}`);
  }
  return entry.makeFn(configStr || entry.defaultConfigStr);
}
