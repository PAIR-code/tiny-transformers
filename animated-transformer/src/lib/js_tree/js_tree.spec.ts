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

import { JsTreeLib } from './js_tree';
import * as jstree from './js_tree';

describe('js_tree', () => {
  function isNumber(x: unknown): x is number {
    return typeof x === 'number';
  }
  const numberTrees = new JsTreeLib(isNumber);
  class Foo {}
  class Bar {
    someField = 0;
  }

  it('isLeaf', () => {
    const keyM = new Foo();
    const queryM = new Bar();
    const aTree = {
      ff1: { b: 1, w: 2 },
      ff2: { b: 3, w: 4 },
      keyM,
      queryM,
      valueM: 7,
    };
    expect(jstree.isLeaf(keyM)).toBe(true);
    expect(jstree.isLeaf(queryM)).toBe(true);
    expect(jstree.isLeaf(1)).toBe(true);
    expect(jstree.isLeaf(aTree)).toBe(false);
  });

  it('raw flatten', () => {
    const keyM = new Foo();
    const queryM = new Bar();
    const aTree = {
      ff1: { b: 1, w: 2 },
      ff2: { b: 3, w: 4 },
      keyM,
      queryM,
      valueM: 7,
    };
    expect(jstree.flatten(aTree)).toEqual([1, 2, 3, 4, keyM, queryM, 7]);
  });

  it('flatten', () => {
    const aTree = {
      ff1: { b: 1, w: 2 },
      ff2: { b: 3, w: 4 },
      keyM: 5,
      queryM: 6,
      valueM: 7,
    };
    expect(numberTrees.flatten(aTree)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('flatten with undefined', () => {
    const aTree = {
      ff1: { b: 1, w: 2 },
      ff2: { b: 3, w: 4 },
      keyM: 5,
      queryM: 6,
      valueM: 7,
    };
    expect(numberTrees.flatten(aTree)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('flatten and unflatten', () => {
    const aTree = {
      ff1: { b: 1, w: 2 },
      ff2: { b: 3, w: 4 },
      keyM: 5,
      queryM: 6,
      valueM: 7,
    };
    expect(numberTrees.flatten(aTree)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(numberTrees.unflatten(aTree, numberTrees.flatten(aTree))).toEqual(aTree);
  });

  it('nullify', () => {
    const aTree = {
      ff1: { b: 1, w: 2 },
      ff2: { b: 3, w: 4 },
      keyM: 5,
      queryM: 6,
      valueM: 7,
    };

    expect(numberTrees.nullify(aTree)).toEqual({
      ff1: { b: null, w: null },
      ff2: { b: null, w: null },
      keyM: null,
      queryM: null,
      valueM: null,
    });
  });
});
