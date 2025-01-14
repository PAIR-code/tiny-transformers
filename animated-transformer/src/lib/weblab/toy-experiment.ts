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

import { LabEnv } from '../distr-signals/lab-env';
import { Experiment } from './experiment';
import {
  SecDef,
  CellRefKind,
  SecDefOfExperiment,
  SecDefKind,
  SecDefOfUiView,
  ViewerKind,
  SecDefOfWorker,
} from './section';

export const initExpDef: SecDefOfExperiment = {
  kind: SecDefKind.Experiment,
  id: 'top level exp name/id',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  subsections: [],
};

export const secSimpleMarkdown: SecDefOfUiView = {
  kind: SecDefKind.UiCell,
  id: 'about',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  io: {
    outputs: {
      markdown: {
        saved: true,
        lastValue: '# foo is a title\nAnd this is some normal text, **bold**, and _italic_.',
      },
    },
  },
  uiView: ViewerKind.MarkdownOutView,
};

export const secSimpleJson: SecDefOfUiView = {
  kind: SecDefKind.UiCell,
  id: 'some json data',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  io: {
    outputs: {
      jsonObj: {
        saved: true,
        lastValue: { hello: 'foo' },
      },
    },
  },
  uiView: ViewerKind.JsonObjOutView,
};

export function secSimpleCell(): SecDefOfWorker {
  return {
    kind: SecDefKind.WorkerCell,
    id: 'cell section',
    timestamp: Date.now(),
    io: {},
    cellCodeRef: {
      kind: CellRefKind.InlineWorkerJsCode,
      js: 'console.log("hello world from simple cell!");',
    },
  };
}

export function makeToyExperiment(id: string, env: LabEnv): Experiment {
  const initExpDef: SecDefOfExperiment = {
    kind: SecDefKind.Experiment,
    id,
    timestamp: Date.now(),
    // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
    subsections: [],
  };
  const exp = new Experiment(env, [], initExpDef);
  exp.appendLeafSectionFromDataDef(secSimpleMarkdown);
  exp.appendLeafSectionFromDataDef(secSimpleJson);
  exp.appendLeafSectionFromDataDef(secSimpleCell());
  return exp;
}
