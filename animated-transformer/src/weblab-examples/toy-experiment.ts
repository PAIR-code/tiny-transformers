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
  ModelInit,
  ModelInitKind,
  TaskGenConfig,
  TrainConfig,
} from 'src/weblab-examples/tiny-transformer-example/common.types';
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
import { LocalCacheDataResolver } from 'src/lib/data-resolver/data-resolver';
import { JsonValue } from 'src/lib/json/json';
import { trainerCellKind } from './tiny-transformer-example/trainer-cell.kind';
import { defaultTransformerConfig } from 'src/lib/transformer/transformer_gtensor';

export const initExpDef: SecDefOfSecList = {
  kind: SecDefKind.SectionList,
  id: 'Toy Tiny Transformers Example Experiment',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  subsections: [],
  display: { collapsed: false },
};

export const simpleMarkdownSecDef: SecDefOfUiView = {
  kind: SecDefKind.UiCell,
  id: 'about',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  io: {
    inputs: {},
    outputs: {
      markdown: {
        saved: true,
        lastValue:
          '# Toy Tiny Transformers Example \nThis is a small illustrative experiment with Tiny Transformers.',
      },
    },
    inStreams: {},
    outStreamIds: [],
  },
  uiView: ViewerKind.MarkdownOutView,
  display: { collapsed: false },
};

export const taskConfigJsonSecDef: SecDefOfUiView = {
  kind: SecDefKind.UiCell,
  id: 'Task Configuration',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  io: {
    inputs: {},
    outputs: {
      jsonObj: {
        saved: true,
        lastValue: structuredClone(defaultTinyWorldTaskConfig),
      },
    },
    inStreams: {},
    outStreamIds: [],
  },
  uiView: ViewerKind.JsonObjOutView,
  display: { collapsed: false },
};

export const genConfigJsonSecDef: SecDefOfUiView = {
  kind: SecDefKind.UiCell,
  id: 'Task Generation Configuration',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  io: {
    inputs: {},
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
    inStreams: {},
    outStreamIds: [],
  },
  uiView: ViewerKind.JsonObjOutView,
  display: { collapsed: false },
};

export const simpleInlineCodeSecDef: SecDefOfWorker & {
  cellCodeRef: {
    kind: CellCodeRefKind.InlineWorkerJsCode;
  };
} = {
  kind: SecDefKind.WorkerCell,
  id: 'InlineCodeCell',
  timestamp: Date.now(),
  io: {
    inputs: {},
    inStreams: {},
    outputs: {},
    outStreamIds: [],
  },
  cellCodeRef: {
    kind: CellCodeRefKind.InlineWorkerJsCode,
    js: 'console.log("hello world from simple cell!");',
  },
  display: { collapsed: true },
};

export const toyCellPathSecDef: SecDefOfWorker & {
  cellCodeRef: {
    kind: CellCodeRefKind.PathToWorkerCode;
  };
} = {
  kind: SecDefKind.WorkerCell,
  id: toyCellKind.cellKindId,
  timestamp: Date.now(),
  io: {
    inputs: {},
    inStreams: {},
    outputs: {},
    outStreamIds: [],
  },
  cellCodeRef: {
    kind: CellCodeRefKind.PathToWorkerCode,
    tsSrcPath: 'toycell.worker.ts',
    jsPath: 'dist/toycell.worker.js',
  },
  display: { collapsed: true },
};

export const taskGenUrlCodeSecDef: SecDefOfWorker & {
  cellCodeRef: {
    kind: CellCodeRefKind.UrlToCode;
  };
} = {
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
    inStreams: {},
    outputs: { testSet: { saved: false } },
    outStreamIds: ['trainBatches'],
  },
  cellCodeRef: {
    kind: CellCodeRefKind.UrlToCode,
    tsSrcPath: 'tiny-transformer-example/task-cell.worker.ts',
    jsUrl: 'http://127.0.0.1:9000/scripts/tiny-transformer-example/task-cell.worker.js',
  },
  display: { collapsed: false },
};

const modelTrainConfigDef: SecDefOfUiView = {
  kind: SecDefKind.UiCell,
  id: 'Model Train Config',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  io: {
    inputs: {},
    outputs: {
      jsonObj: {
        saved: true,
        lastValue: {
          id: 'initial config',
          kind: 'basicSeqTrainer',
          // training hyper-params
          learningRate: 0.5,
          batchSize: 16,
          maxInputLength: 2,
          trainForBatches: 3,
          randomSeed: 42,
          // Reporting / eval
          checkpointFrequencyInBatches: 4,
          metricReporting: {
            metricFrequencyInBatches: 2,
          },
        } as TrainConfig,
      },
    },
    inStreams: {},
    outStreamIds: [],
  },
  uiView: ViewerKind.JsonObjOutView,
  display: { collapsed: false },
};

const modelInitDef: SecDefOfUiView = {
  kind: SecDefKind.UiCell,
  id: 'Model Init Config',
  timestamp: Date.now(),
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  io: {
    inputs: {},
    outputs: {
      jsonObj: {
        saved: true,
        lastValue: {
          kind: ModelInitKind.ReinitFromConfig,
          config: defaultTransformerConfig(),
        } as JsonValue,
      },
    },
    inStreams: {},
    outStreamIds: [],
  },
  uiView: ViewerKind.JsonObjOutView,
  display: { collapsed: false },
};

export const trainUrlCodeSecDef: SecDefOfWorker & {
  cellCodeRef: {
    kind: CellCodeRefKind.UrlToCode;
  };
} = {
  kind: SecDefKind.WorkerCell,
  id: trainerCellKind.cellKindId,
  timestamp: Date.now(),
  io: {
    inputs: {
      testSet: { sectionId: taskCellKind.cellKindId, outputId: 'testSet' },
      modelInit: { sectionId: modelInitDef.id, outputId: 'jsonObj' },
      trainConfig: { sectionId: modelTrainConfigDef.id, outputId: 'jsonObj' },
    },
    inStreams: {
      trainBatches: { sectionId: taskCellKind.cellKindId, outStreamId: 'trainBatches' },
    },
    outputs: { testSet: { saved: false } },
    outStreamIds: ['metrics', 'checkpoint'],
  },
  cellCodeRef: {
    kind: CellCodeRefKind.UrlToCode,
    tsSrcPath: 'tiny-transformer-example/trainer-cell.worker.ts',
    jsUrl: 'http://127.0.0.1:9000/scripts/tiny-transformer-example/trainer-cell.worker.js',
  },
  display: { collapsed: false },
};

export async function makeToyExperiment(env: LabEnv, id: string): Promise<Experiment> {
  const initExpDef: SecDefOfSecList = {
    kind: SecDefKind.SectionList,
    id,
    timestamp: Date.now(),
    vsCodePathRoot:
      '/Users/ldixon/code/github/tiny-transformers/animated-transformer/src/weblab-examples',
    // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
    subsections: [],
    display: { collapsed: false },
  };
  const dataResolver = new LocalCacheDataResolver<JsonValue>();

  // Note: these fake the contents for the path and URL code in the cache.
  dataResolver.save(
    prefixCacheCodePath(toyCellPathSecDef.cellCodeRef.jsPath),
    'console.log("hello from simpleCellPathSecDef cell!");',
  );

  dataResolver.save(
    prefixCacheCodeUrl(taskGenUrlCodeSecDef.cellCodeRef.jsUrl),
    'console.log("hello from taskGenUrlCodeSecDef cell!");',
  );

  dataResolver.save(
    prefixCacheCodeUrl(trainUrlCodeSecDef.cellCodeRef.jsUrl),
    'console.log("hello from trainUrlCodeSecDef cell!");',
  );

  const footerSecDef: SecDefOfUiView = {
    kind: SecDefKind.UiCell,
    id: 'footer',
    timestamp: Date.now(),
    // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
    io: {
      inputs: {},
      outputs: {
        markdown: {
          saved: true,
          lastValue: 'Footer: the end.',
        },
      },
      inStreams: {},
      outStreamIds: [],
    },
    uiView: ViewerKind.MarkdownOutView,
    display: { collapsed: false },
  };

  // TODO: add entries for URLs and Paths.

  const exp = new Experiment(env, [], initExpDef, dataResolver);

  const sections = [
    simpleMarkdownSecDef,
    toyCellPathSecDef,
    simpleInlineCodeSecDef,
    taskConfigJsonSecDef,
    genConfigJsonSecDef,
    taskGenUrlCodeSecDef,
    modelInitDef,
    modelTrainConfigDef,
    trainUrlCodeSecDef,
    footerSecDef,
  ];
  for (const sectionDef of sections) {
    await exp.appendLeafSectionFromDataDef(sectionDef);
  }

  return exp;
}
