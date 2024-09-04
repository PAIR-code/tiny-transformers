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

import {
  DecisionBoundaryTask,
  DecisionBoundaryTaskConfig,
  defaultDecisionBoundaryTaskConfig,
} from './decision_boundary_task';
import { defaultTinyWorldTaskConfig, TinyWorldTask, TinyWorldTaskConfig } from './tiny_worlds';
import { BasicLmTask } from './util';

export type TaskConfig = TinyWorldTaskConfig | DecisionBoundaryTaskConfig;

export const taskConfigDefaults: TaskConfig[] = [
  defaultTinyWorldTaskConfig,
  defaultDecisionBoundaryTaskConfig,
];

export function makeTask(config: TaskConfig): BasicLmTask<TaskConfig> {
  switch (config.kind) {
    case 'TinyWorldTask':
      return new TinyWorldTask(config);
    case 'DecisionBoundaryTask':
      return new DecisionBoundaryTask(config);
    default:
      throw new Error(`Invalid condig: ${JSON.stringify(config)}`);
  }
}
