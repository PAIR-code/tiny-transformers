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
  filterGen,
  iterToItor,
  itorToIter,
  listGen,
  takeNextN,
  takeNextNgen,
} from './state-iter';

describe('state-iter', () => {
  beforeEach(() => {});

  it('iterToGen', () => {
    const g = iterToItor([1, 2, 3, 4, 5]);
    g.next();
    expect([...itorToIter(g)]).toEqual([2, 3, 4, 5]);
  });

  it('takeNextN', () => {
    const l = [1, 2, 3, 4, 5];
    expect([...takeNextN(l, 2)]).toEqual([1, 2]);
    expect([...takeNextN(l, 7)]).toEqual([1, 2, 3, 4, 5]);
  });

  it('takeNextNgen', () => {
    const g = listGen([1, 2, 3, 4, 5]);
    expect([...takeNextNgen(g, 2)]).toEqual([1, 2]);
    expect(g.next().value).toEqual(3);
    expect([...takeNextNgen(g, 2)]).toEqual([4, 5]);
  });

  it('filterGen', () => {
    const takenNums = filterGen((n) => n % 2 !== 0, listGen([1, 2, 3, 4, 5]));
    expect([...takenNums]).toEqual([1, 3, 5]);
  });
});
