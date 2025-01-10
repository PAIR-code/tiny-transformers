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

import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { Experiment, loadExperiment } from './experiment';
import { InMemoryDataResolver } from './data-resolver';
import {
  SecDefByPath,
  SecDefByRef,
  SecDefKind,
  SecDefOfSubExperiment,
  SecDefOfUiView,
  ViewerComponent,
} from './section';
import { LabEnv } from '../distr-signal-exec/lab-env';

describe('experiment', () => {
  beforeEach(() => {});

  it('Basic saving and loading experiments identity', async () => {
    // TODO: make a nicer way to make these... right now there is an implicit non-obvious dependency between `outputs: { markdown: ... }` and `uiView: ViewerComponent.MarkdownOutView`
    const section1: SecDefOfUiView = {
      kind: SecDefKind.UiCell,
      id: 'section 1',
      timestamp: Date.now(),
      io: {
        inputs: {},
        inStreams: {},
        outputs: {
          markdown: {
            lastValue: '# Section 1! \nThis is the start.',
            saved: true,
          },
        },
        outStreamIds: [],
      },
      uiView: ViewerComponent.MarkdownOutView,
    };

    const section2_1: SecDefOfUiView = {
      kind: SecDefKind.UiCell,
      id: 'section 1',
      timestamp: Date.now(),
      io: {
        inputs: {},
        inStreams: {},
        outputs: {
          markdown: {
            lastValue: '# Preamble! \nThis is before the start in the sub exp.',
            saved: true,
          },
        },
        outStreamIds: [],
      },
      uiView: ViewerComponent.MarkdownOutView,
    };

    const section2_2: SecDefByRef = {
      kind: SecDefKind.Ref,
      id: 'section2_2',
      refId: 'section 1',
    };

    const section2: SecDefOfSubExperiment = {
      kind: SecDefKind.SubExperiment,
      id: 'section 2',
      timestamp: Date.now(),
      subsections: [section2_1, section2_2],
    };

    const section3: SecDefByPath = {
      kind: SecDefKind.Path,
      id: 'section 3',
      dataPath: 'foo:/exp1/sec3.exp.json',
    };

    const exp1Data: SecDefOfSubExperiment = {
      kind: SecDefKind.SubExperiment,
      id: 'toy experiment name 1',
      timestamp: Date.now(),
      subsections: [section1, section2, section3],
    };

    const sec3Node: SecDefOfUiView = {
      kind: SecDefKind.UiCell,
      id: 'section 1',
      timestamp: Date.now(),
      io: {
        inputs: {},
        inStreams: {},
        outputs: {
          markdown: {
            lastValue: '# Section 3! This is the end.',
            saved: true,
          },
        },
        outStreamIds: [],
      },
      uiView: ViewerComponent.MarkdownOutView,
    };

    const dataResolver = new InMemoryDataResolver({
      'foo:/exp1/sec3.exp.json': sec3Node,
      'foo:/exp1/exp1.exp.json': exp1Data,
    });

    const space = new SignalSpace();
    const env = new LabEnv(space);
    const exp1 = (await loadExperiment(dataResolver, env, exp1Data)) as Experiment;
    const { data, subpathData } = exp1.serialise();

    expect(data).toEqual(exp1Data);
    expect(subpathData!['foo:/exp1/sec3.exp.json']).toEqual(sec3Node);
  });
});
