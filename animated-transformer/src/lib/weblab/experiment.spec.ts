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
import { InMemoryDataResolver } from '../data-resolver/data-resolver';
import {
  SecDefByPath,
  SecDefOfRef,
  SecDefKind,
  SecDefOfSecList,
  SecDefOfUiView,
  ViewerKind,
} from './section';
import { LabEnv } from '../distr-signals/lab-env';

describe('experiment', () => {
  beforeEach(() => {});

  it('Basic saving and loading experiments identity', async () => {
    // TODO: make a nicer way to make these... right now there is an implicit non-obvious dependency between `outputs: { markdown: ... }` and `uiView: ViewerKind.MarkdownOutView`
    const section1: SecDefOfUiView = {
      kind: SecDefKind.UiCell,
      id: 'section1',
      timestamp: Date.now(),
      io: {
        inputs: {},
        outputs: {
          markdown: {
            lastValue: '# Section 1! \nThis is the start.',
            saved: true,
          },
        },
        inStreams: {},
        outStreamIds: [],
      },
      uiView: ViewerKind.MarkdownOutView,
      display: { collapsed: false },
    };

    const section2_1: SecDefOfUiView = {
      kind: SecDefKind.UiCell,
      id: 'section2_1',
      timestamp: Date.now(),
      io: {
        inputs: {},
        outputs: {
          markdown: {
            lastValue: '# Preamble! \nThis is before the start in the sub exp.',
            saved: true,
          },
        },
        inStreams: {},
        outStreamIds: [],
      },
      uiView: ViewerKind.MarkdownOutView,
      display: { collapsed: false },
    };

    const section2_2: SecDefOfRef = {
      kind: SecDefKind.Ref,
      id: 'section2_2',
      refId: 'section1',
      display: { collapsed: false },
    };

    const section2: SecDefOfSecList = {
      kind: SecDefKind.SectionList,
      id: 'section2',
      timestamp: Date.now(),
      subsections: [section2_1, section2_2],
      display: { collapsed: false },
    };

    const section3: SecDefByPath = {
      kind: SecDefKind.Path,
      id: 'section3',
      dataPath: 'foo:/exp1/sec3.secdef.json',
      display: { collapsed: false },
    };

    const exp1Data: SecDefOfSecList = {
      kind: SecDefKind.SectionList,
      id: 'toy experiment name 1',
      timestamp: Date.now(),
      subsections: [section1, section2, section3],
      display: { collapsed: false },
    };

    const sec3Node: SecDefOfUiView = {
      kind: SecDefKind.UiCell,
      id: 'section3',
      timestamp: Date.now(),
      io: {
        inputs: {},
        outputs: {
          markdown: {
            lastValue: '# Section 3! This is the end.',
            saved: true,
          },
        },
        inStreams: {},
        outStreamIds: [],
      },
      uiView: ViewerKind.MarkdownOutView,
      display: { collapsed: false },
    };

    const dataResolver = new InMemoryDataResolver();
    dataResolver.saveStr(['foo:/exp1/sec3.secdef.json'], JSON.stringify(sec3Node));

    const space = new SignalSpace();
    const env = new LabEnv(space);
    const exp1 = (await loadExperiment(dataResolver, dataResolver, env, exp1Data, {
      fromCache: true,
    })) as Experiment;

    expect(exp1.topLevelSections().length).toEqual(3);

    const { data, subpathData } = exp1.serialise();
    console.log('data', data);
    console.log('subpathData', subpathData);

    expect(data).toEqual(exp1Data);
    expect(subpathData!['foo:/exp1/sec3.secdef.json']).toEqual(sec3Node);
  });

  // TODO: add sub-sub-path loading example.
  // TODO: add sub-sub-path loading cell example.
  // TODO: add sub-sub-path loading UI example.
});
