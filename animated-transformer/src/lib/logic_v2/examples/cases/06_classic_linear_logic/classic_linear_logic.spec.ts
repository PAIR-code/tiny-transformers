/* Copyright 2026 Google LLC. All Rights Reserved.

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

import { getApplicableActions } from '../../../linear';
import { Story } from '../../../story';
import { parseContext } from '../../../logic';

export const CLASSIC_LINEAR_LOGIC_SRC = [
  'type beverage = coffee | tea;',
  'type colorType = red | blue;',
  'type coin = dollar | quarter;',
  'type item = drink(what: beverage) | sock(color: colorType) | pair(color: colorType);',
  'action buyCoffee: { ?d: dollar } -o { ?c: drink(coffee) };',
  'action buyTea: { ?d: dollar } -o { ?t: drink(tea) };',
  'action matchSocks: { ?s1: sock(?c), ?s2: sock(?c) } -o { ?p: pair(?c) };',
  '_r1: dollar;',
  '_r2: dollar;',
  '_r3: sock(red);',
  '_r4: sock(red);',
  '_r5: sock(blue);',
].join('\n');

describe('Example 6: Classic Linear Logic Spec', () => {
  it('runs correctly at runtime', () => {
    const ctxt = parseContext(CLASSIC_LINEAR_LOGIC_SRC);
    const story = new Story(ctxt);

    // 1. Verify Choice ("you choose" coffee or tea)
    const applicable = getApplicableActions(ctxt);
    
    // Both buyCoffee and buyTea are applicable because of the shared dollar resource type
    const coffeeMatches = applicable.filter((m: any) => m.action.name === 'buyCoffee');
    const teaMatches = applicable.filter((m: any) => m.action.name === 'buyTea');
    
    // Since we have two dollars (_r1 and _r2), we have 2 possible matches for each!
    expect(coffeeMatches.length).toBe(2);
    expect(teaMatches.length).toBe(2);

    // Buy coffee using _r1: consumes _r1 and produces _r6: drink(coffee)
    const buyCoffeeMatch = coffeeMatches.find((m: any) => m.matchedResources.get('d') === '_r1')!;
    story.applyAction(buyCoffeeMatch);
    const ctxt2 = story.getCurrentContext();

    expect(ctxt2.linearResources['_r1']).toBeUndefined();
    expect(ctxt2.linearResources['_r6']).toBe('drink(coffee)');
    expect(ctxt2.linearResources['_r2']).toBe('dollar'); // other dollar remains

    // 2. Verify Tensor/Both matching ("getting socks")
    // matchSocks matches two red socks (_r3 and _r4) of clashing colors
    const sockMatches = applicable.filter((m: any) => m.action.name === 'matchSocks');
    
    // Exactly 2 matches depending on permutation order of r3/r4
    expect(sockMatches.length).toBe(2);

    // Apply matchSocks: consumes _r3 (red sock) and _r4 (red sock) to produce pair(red)
    const story2 = new Story(ctxt); // reset to initial
    const matchingSocks = getApplicableActions(ctxt).find((m: any) => m.action.name === 'matchSocks')!;
    story2.applyAction(matchingSocks);
    const ctxt3 = story2.getCurrentContext();

    expect(ctxt3.linearResources['_r3']).toBeUndefined();
    expect(ctxt3.linearResources['_r4']).toBeUndefined();
    expect(ctxt3.linearResources['_r6']).toBe('pair(red)'); // paired red socks produced
    expect(ctxt3.linearResources['_r5']).toBe('sock(blue)'); // blue sock remains unpaired!
  });
});
