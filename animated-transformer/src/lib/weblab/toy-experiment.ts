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

import { LabEnv } from '../distr-signal-exec/lab-env';
import { ExpDefKind, Experiment } from './experiment';
import { CellRefKind, ExpSectionDataDef, SectionDataDef, SectionDef, SectionKind } from './section';

export const initExpDef: ExpSectionDataDef = {
  kind: ExpDefKind.Data,
  id: 'top level exp name/id',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  sectionData: {
    sectionKind: SectionKind.SubExperiment,
    content: [],
  },
};

export const secSimpleMarkdown: SectionDataDef = {
  kind: ExpDefKind.Data,
  id: 'about',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  sectionData: {
    sectionKind: SectionKind.Markdown,
    content: '# foo is a title\nAnd this is some normal text, **bold**, and _italic_.',
  },
};
export const secSimpleJson: SectionDataDef = {
  kind: ExpDefKind.Data,
  id: 'some data',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  sectionData: {
    sectionKind: SectionKind.JsonObj,
    content: {
      hello: 'foo',
    },
  },
};

export function secSimpleCell(): SectionDataDef {
  return {
    kind: ExpDefKind.Data,
    id: 'cell section',
    timestamp: Date.now(),
    sectionData: {
      sectionKind: SectionKind.WorkerCell,
      content: {
        cellRef: {
          kind: CellRefKind.InlineWorkerJsCode,
          js: 'console.log("hello world from simple cell!");',
        },
        inputs: {},
        outputs: {},
        inStreams: {},
        outStreamIds: [],
      },
    },
  };
}

export function makeToyExperiment(id: string, env: LabEnv): Experiment {
  const initExpDef: ExpSectionDataDef = {
    kind: ExpDefKind.Data,
    id,
    timestamp: Date.now(),
    // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
    sectionData: {
      sectionKind: SectionKind.SubExperiment,
      content: [],
    },
  };
  const exp = new Experiment(env, [], initExpDef);
  exp.appendLeafSectionFromDataDef(secSimpleMarkdown);
  exp.appendLeafSectionFromDataDef(secSimpleJson);
  exp.appendLeafSectionFromDataDef(secSimpleCell());
  return exp;
}
