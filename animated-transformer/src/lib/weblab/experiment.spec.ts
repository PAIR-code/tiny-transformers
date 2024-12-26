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
import { ExpDefKind, loadExperiment } from './experiment';
import { InMemoryDataResolver } from '../distr-signal-exec/data-resolver';
import { ExpSectionDataDef, SectionDef, SectionKind } from './section';
import { LabEnv } from '../distr-signal-exec/lab-env';

describe('experiment', () => {
  beforeEach(() => {});

  it('Basic saving and loading experiments identity', async () => {
    const section1: SectionDef = {
      kind: ExpDefKind.Data,
      id: 'section 1',
      timestamp: Date.now(),
      sectionData: {
        sectionKind: SectionKind.Markdown,
        content: '# Section 1! \nThis is the start.',
      },
    };

    const section2_1: SectionDef = {
      kind: ExpDefKind.Data,
      id: 'section2_1',
      timestamp: Date.now(),
      sectionData: {
        sectionKind: SectionKind.Markdown,
        content: '# Preamble! \nThis is before the start in the sub exp.',
      },
    };

    const section2_2: SectionDef = {
      kind: ExpDefKind.Ref,
      id: 'section2_2',
      refId: 'section 1',
    };

    const section2: SectionDef = {
      kind: ExpDefKind.Data,
      id: 'section 2',
      timestamp: Date.now(),
      sectionData: {
        sectionKind: SectionKind.SubExperiment,
        // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
        content: [section2_1, section2_2],
      },
    };

    const section3: SectionDef = {
      kind: ExpDefKind.Path,
      id: 'section 3',
      dataPath: 'foo:/exp1/sec3.exp.json',
    };

    const exp1Data: ExpSectionDataDef = {
      kind: ExpDefKind.Data,
      id: 'toy experiment name 1',
      timestamp: Date.now(),
      sectionData: {
        sectionKind: SectionKind.SubExperiment,
        content: [section1, section2, section3],
      },
    };

    const sec3Node: SectionDef = {
      kind: ExpDefKind.Data,
      id: 'section 3',
      timestamp: Date.now(),
      sectionData: {
        sectionKind: SectionKind.Markdown,
        // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
        content: '# Section 3! This is the end.',
      },
    };

    const dataResolver = new InMemoryDataResolver({
      'foo:/exp1/sec3.exp.json': sec3Node,
      'foo:/exp1/exp1.exp.json': exp1Data,
    });

    const space = new SignalSpace();
    const env = new LabEnv(space);
    const exp1 = await loadExperiment(dataResolver, env, exp1Data);

    const { data, subpathData } = exp1.serialise();

    // console.log(`data: ${JSON.stringify(data, null, 2)}`);
    // console.log(`subpathData: ${JSON.stringify(subpathData, null, 2)}`);

    expect(data).toEqual(exp1Data);
    expect(subpathData!['foo:/exp1/sec3.exp.json']).toEqual(sec3Node);
  });
});
