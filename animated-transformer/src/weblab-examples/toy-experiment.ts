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

import { TaskGenConfig } from 'src/weblab-examples/tiny-transformer-example/common.types';
import { LabEnv } from '../lib/distr-signals/lab-env';
import { Experiment, prefixCacheCodePath, prefixCacheCodeUrl } from '../lib/weblab/experiment';
import {
  SecDefOfSecList,
  SecDefKind,
  SecDefOfUiView,
  ViewerKind,
  SecDefOfWorker,
  CellCodeRefKind,
} from '../lib/weblab/section';
import { defaultTinyWorldTaskConfig } from '../lib/seqtasks/tiny_worlds';
import { toyCellKind } from './toycell.kind';
import { taskCellKind } from './tiny-transformer-example/task-cell.kind';
import { BrowserDirDataResolver, LocalCacheDataResolver } from 'src/lib/weblab/data-resolver';
import { JsonValue } from 'src/lib/json/json';

export const initExpDef: SecDefOfSecList = {
  kind: SecDefKind.SectionList,
  id: 'top level exp name/id',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  subsections: [],
};

export const simpleMarkdownSecDef: SecDefOfUiView = {
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

export const taskConfigJsonSecDef: SecDefOfUiView = {
  kind: SecDefKind.UiCell,
  id: 'Task Configuration',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  io: {
    outputs: {
      jsonObj: {
        saved: true,
        lastValue: structuredClone(defaultTinyWorldTaskConfig),
      },
    },
  },
  uiView: ViewerKind.JsonObjOutView,
};

export const genConfigJsonSecDef: SecDefOfUiView = {
  kind: SecDefKind.UiCell,
  id: 'Generation Configuration',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  io: {
    outputs: {
      jsonObj: {
        saved: true,
        lastValue: {
          initBatchId: 0,
          initBatchSeed: 0,
          maxBatches: 5,
          batchSize: 10,
          testSetSize: 3,
        } as TaskGenConfig,
      },
    },
  },
  uiView: ViewerKind.JsonObjOutView,
};

export function simpleInlineCodeSecDefFn(): SecDefOfWorker & {
  cellCodeRef: {
    kind: CellCodeRefKind.InlineWorkerJsCode;
  };
} {
  return {
    kind: SecDefKind.WorkerCell,
    id: 'InlineCodeCell',
    timestamp: Date.now(),
    io: {},
    cellCodeRef: {
      kind: CellCodeRefKind.InlineWorkerJsCode,
      js: 'console.log("hello world from simple cell!");',
    },
  };
}

export function simpleCellPathSecDefFn(): SecDefOfWorker & {
  cellCodeRef: {
    kind: CellCodeRefKind.PathToWorkerCode;
  };
} {
  return {
    kind: SecDefKind.WorkerCell,
    id: toyCellKind.cellKindId,
    timestamp: Date.now(),
    io: {},
    cellCodeRef: {
      kind: CellCodeRefKind.PathToWorkerCode,
      tsSrcPath: 'toycell.worker.ts',
      jsPath: 'dist/toycell.worker.js',
    },
  };
}

export function simpleUrlCodeSecDefFn(): SecDefOfWorker & {
  cellCodeRef: {
    kind: CellCodeRefKind.UrlToCode;
  };
} {
  return {
    kind: SecDefKind.WorkerCell,
    id: taskCellKind.cellKindId,
    timestamp: Date.now(),
    io: {
      inputs: {
        taskConfig: {
          sectionId: taskConfigJsonSecDef.id,
          outputId: 'jsonObj',
        },
        genConfig: {
          sectionId: genConfigJsonSecDef.id,
          outputId: 'jsonObj',
        },
      },
    },
    cellCodeRef: {
      kind: CellCodeRefKind.UrlToCode,
      tsSrcPath: 'tiny-transformer-example/task-cell.worker.ts',
      jsUrl: 'http://127.0.0.1:9000/tiny-transformer-example/task-cell.worker.js',
    },
  };
}

export async function makeToyExperiment(env: LabEnv, id: string): Promise<Experiment> {
  const initExpDef: SecDefOfSecList = {
    kind: SecDefKind.SectionList,
    id,
    timestamp: Date.now(),
    vsCodePathRoot:
      '/Users/ldixon/code/github/tiny-transformers/animated-transformer/src/weblab-examples',
    // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
    subsections: [],
  };
  const dataResolver = new LocalCacheDataResolver<JsonValue>();

  const simpleCellPathSecDef = simpleCellPathSecDefFn();
  dataResolver.save(
    prefixCacheCodePath(simpleCellPathSecDef.cellCodeRef.jsPath),
    'console.log("hello from simpleCellPathSecDef cell!");',
  );

  const simpleUrlCodeSecDef = simpleUrlCodeSecDefFn();
  dataResolver.save(
    prefixCacheCodeUrl(simpleUrlCodeSecDef.cellCodeRef.jsUrl),
    'console.log("hello from simpleUrlCodeSecDef cell!");',
  );

  // TODO: add entries for URLs and Paths.

  const exp = new Experiment(env, [], initExpDef, dataResolver);

  exp.appendLeafSectionFromDataDef(simpleMarkdownSecDef);
  exp.appendLeafSectionFromDataDef(taskConfigJsonSecDef);
  exp.appendLeafSectionFromDataDef(genConfigJsonSecDef);
  exp.appendLeafSectionFromDataDef(simpleCellPathSecDef);
  exp.appendLeafSectionFromDataDef(simpleInlineCodeSecDefFn());
  exp.appendLeafSectionFromDataDef(simpleUrlCodeSecDef);
  return exp;
}
