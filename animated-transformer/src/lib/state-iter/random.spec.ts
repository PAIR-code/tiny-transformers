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
import { makeRandomStream, nextRandom } from './random';

describe('random', () => {
  beforeEach(() => {});

  it('state iteration on random numbers', () => {
    const rng = makeRandomStream({ curSeedVal: 42 });
    const rng2 = rng.copy();
    expect(rng.takeOutN(5)).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
      0.6697340414393693, 0.17481389874592423,
    ]);
    expect(rng.takeOutN(5)).toEqual([
      0.5265925421845168, 0.2732279943302274, 0.6247446539346129,
      0.8654746483080089, 0.4723170551005751,
    ]);
    // Same as the first 5 out of rng!
    expect(rng2.takeOutN(5)).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
      0.6697340414393693, 0.17481389874592423,
    ]);
  });

  it('nextRandom', () => {
    const rand = nextRandom({ curSeedVal: 1 });
    expect(rand).toEqual(0.6270739405881613);
  });
});
