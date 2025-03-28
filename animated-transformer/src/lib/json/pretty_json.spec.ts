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

import { stringifyJsonValue } from './pretty_json';

describe('stringify', () => {
  it('basic stringifyJsonVaue', () => {
    const obj = {
      'z; fat': 'boo',
      b: [1, 2, 3],
      a: 'fat',
      c: { x: 1, y: [4, 5, true] },
      d: 'very wfklj sdfkjl sdfklj asdflkj asdf very  usdhlkaf asdkl fdslkj fdsklj fdsakljafds ljkadfs fat',
    };

    // Notice: c gets placeds on a single line, top level does not, and nothing
    // silly about wrapping d.
    expect(stringifyJsonValue(obj)).toEqual(`{ a: "fat",
  b: [1, 2, 3],
  c: {x: 1, y: [4, 5, true]},
  d: "very wfklj sdfkjl sdfklj asdflkj asdf very  usdhlkaf asdkl fdslkj fdsklj fdsakljafds ljkadfs fat",
  "z; fat": "boo" }`);
  });

  it('basic stringifyJsonVaue with quoteAllKeys', () => {
    const obj = {
      b: [1, 2, 3],
      a: 'fat',
      c: { x: 1, y: 2 },
      d: 'very ',
    };

    // Notice: c gets placeds on a single line, top level does not, and nothing
    // silly about wrapping d.
    expect(stringifyJsonValue(obj, { quoteAllKeys: true })).toEqual(`{ "a": "fat",
  "b": [1, 2, 3],
  "c": {"x": 1, "y": 2},
  "d": "very " }`);
  });

  it('basic stringifyJson of number list configs', () => {
    const obj = {
      paramValues: [[0], [1], [1], [0]],
      paramPositions: [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      paramVisResolution: 2,
    };
    // Notice top level objects on own lines, but values fit into the wrap window.
    expect(stringifyJsonValue(obj)).toEqual(`{ paramPositions: [[0, 0], [1, 0], [0, 1], [1, 1]],
  paramValues: [[0], [1], [1], [0]],
  paramVisResolution: 2 }`);
  });
});
