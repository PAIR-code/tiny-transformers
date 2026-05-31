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

export const INVALID_ANIMAL_STORY_SRC = [
  'type species = cat | monkey | elephant;',
  'type animal = animal(kind: species);',
  'type item = animalVal(who: animal) | flower | rock | tree;',
  'type state = active(what: item) | jumpedOver(jumper: animal, target: item) | squished(jumper: animal, target: item) | ranAway(who: animal);',
  'action monkeySquish: { ?j: jumpedOver(animal(monkey), flower) } -o { ?s: squished(animal(monkey), flower) };',
  'action catEscape: { ?j: jumpedOver(?any, animalVal(animal(cat))) } -o { ?r: ranAway(animal(cat)) };',
  '_r1: jumpedOver(animal(monkey), flower);',
  '_r2: jumpedOver(animal(elephant), animalVal(animal(cat)));',
  '_r3: jumpedOver(rock, tree);', // INVALID! rock is not animal
].join('\n');

export const VALID_ANIMAL_STORY_SRC = [
  'type species = cat | monkey | elephant;',
  'type animal = animal(kind: species);',
  'type item = animalVal(who: animal) | flower | rock | tree;',
  'type state = active(what: item) | jumpedOver(jumper: animal, target: item) | squished(jumper: animal, target: item) | ranAway(who: animal);',
  'action monkeySquish: { ?j: jumpedOver(animal(monkey), flower) } -o { ?s: squished(animal(monkey), flower) };',
  'action catEscape: { ?j: jumpedOver(?any, animalVal(animal(cat))) } -o { ?r: ranAway(animal(cat)) };',
  '_r1: jumpedOver(animal(monkey), flower);',
  '_r2: jumpedOver(animal(elephant), animalVal(animal(cat)));',
  '_r3: jumpedOver(animal(monkey), tree);', // VALID!
].join('\n');

describe('Example 3: Relational Linear Logic Stories Spec', () => {
  it('enforces only animals can jump over things at compile/typecheck-time', () => {
    expect(() => parseContext(INVALID_ANIMAL_STORY_SRC)).toThrowError(
      /Type mismatch/
    );
  });

  it('runs correctly at runtime', () => {
    const ctxt = parseContext(VALID_ANIMAL_STORY_SRC);
    const story = new Story(ctxt);

    // 1. Find applicable actions on the initial relational multiset
    const applicable = getApplicableActions(ctxt);
    expect(applicable.length).toBe(2);
    
    const actionNames = applicable.map((m: any) => m.action.name);
    expect(actionNames).toContain('monkeySquish');
    expect(actionNames).toContain('catEscape');

    // 2. Apply monkeySquish action
    const monkeyMatch = applicable.find((m: any) => m.action.name === 'monkeySquish')!;
    story.applyAction(monkeyMatch);
    const ctxt2 = story.getCurrentContext();

    // _r1 is consumed, squished flower _r4 is produced
    expect(ctxt2.linearResources['_r1']).toBeUndefined();
    expect(ctxt2.linearResources['_r4']).toBe('squished(animal(monkey), flower)');

    // 3. Apply catEscape action
    const applicable2 = getApplicableActions(ctxt2);
    expect(applicable2.length).toBe(1);
    expect(applicable2[0].action.name).toBe('catEscape');

    story.applyAction(applicable2[0]);
    const ctxt3 = story.getCurrentContext();

    // _r2 is consumed, cat ranAway _r5 is produced
    expect(ctxt3.linearResources['_r2']).toBeUndefined();
    expect(ctxt3.linearResources['_r5']).toBe('ranAway(animal(cat))');
    expect(ctxt3.linearResources['_r3']).toBe('jumpedOver(animal(monkey), tree)'); // unaffected rock
  });
});
