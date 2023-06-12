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


import { gridLayoutColumnSizes } from './layout';

describe('layoutColumnSizes', () => {
  beforeEach(() => { });

  it('single column = row length', () => {
    const columnSizes = gridLayoutColumnSizes([2, 1, 2, 1], 1);
    expect(columnSizes).toEqual([2]);
  });

  it('two columns = max length per column.', () => {
    const columnSizes = gridLayoutColumnSizes([2, 1, 2, 1], 2);
    expect(columnSizes).toEqual([2, 1]);
  });

  it('3 columns, leaving one entry in second row.', () => {
    const columnSizes = gridLayoutColumnSizes([2, 1, 2, 1], 3);
    expect(columnSizes).toEqual([2, 1, 2]);
  });

  it('respect larger values later.', () => {
    const columnSizes = gridLayoutColumnSizes([2, 1, 3, 1], 2);
    expect(columnSizes).toEqual([3, 1]);
  });

  it('respect larger values later in both columns.', () => {
    const columnSizes = gridLayoutColumnSizes([2, 1, 3, 2], 2);
    expect(columnSizes).toEqual([3, 2]);
  });

  it('max column width from different rows.', () => {
    const columnSizes = gridLayoutColumnSizes([2, 3, 3, 2], 2);
    expect(columnSizes).toEqual([3, 3]);
  });
});
