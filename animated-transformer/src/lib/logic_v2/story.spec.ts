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

import { parseContext, parseTerm, printTerm, printLinearContext } from './logic';
import { getApplicableActions } from './linear';
import { Story } from './story';

describe('V2Story concept and trace execution', () => {
  it('handles basic state transition trace step-by-step', () => {
    const ctxtSrc = [
      'type nat = 0 | suc(num: nat);',
      'fun add(suc(x), y) = suc(add(x, y)) | fun add(0, y) = y;',
      'action sum: { ?a: nat, ?b: nat } -o { ?c: add(?a, ?b) };',
      '?r1: suc(0);',
      '?r2: suc(suc(0));',
    ].join('\n');

    const initialCtxt = parseContext(ctxtSrc);
    const story = new Story(initialCtxt);

    expect(story.steps.length).toBe(0);
    expect(story.getCurrentContext()).toBe(initialCtxt);

    // Print linear context before
    const beforeStr = printLinearContext(initialCtxt);
    expect(beforeStr).toContain('action sum: { ?a: nat, ?b: nat } -o { ?c: add(?a, ?b) };');
    expect(beforeStr).toContain('?r1: suc(0);');
    expect(beforeStr).toContain('?r2: suc(suc(0));');

    // Find applicable actions
    const applicable = getApplicableActions(initialCtxt);
    expect(applicable.length).toBe(2); // Permutations: a=_r1/b=_r2, a=_r2/b=_r1

    // Apply one match
    story.applyAction(applicable[0]);

    expect(story.steps.length).toBe(1);
    const step = story.steps[0];

    expect(step.contextBefore).toBe(initialCtxt);
    
    const finalCtxt = step.contextAfter;
    expect(story.getCurrentContext()).toBe(finalCtxt);

    // Check variables in the final context: resources should be transitioned
    expect(finalCtxt.variables['r1']).toBeUndefined();
    expect(finalCtxt.variables['r2']).toBeUndefined();
    // Result is 1 + 2 = 3: suc(suc(suc(0)))
    expect(finalCtxt.variables['r3']).toBe('suc(suc(suc(0)))');

    // Print linear context after
    const afterStr = printLinearContext(finalCtxt);
    expect(afterStr).toContain('action sum: { ?a: nat, ?b: nat } -o { ?c: add(?a, ?b) };');
    expect(afterStr).toContain('?r3: suc(suc(suc(0)));');
    expect(afterStr).not.toContain('?r1:');
    expect(afterStr).not.toContain('?r2:');
  });

  it('verifies multiple applicable actions in a complex setup', () => {
    const src = [
      'type nat = 0 | suc(num: nat);',
      'action doubleGrow: { ?x: nat } -o { ?y: suc(?x), ?z: suc(?x) };',
      '?r1: 0;',
      '?r2: suc(0);',
      '?r3: suc(suc(0));',
    ].join('\n');

    const ctxt = parseContext(src);
    const applicable = getApplicableActions(ctxt);

    // Since doubleGrow takes 1 nat, and we have 3 active resources of type nat (0, suc(0), suc(suc(0))),
    // there should be exactly 3 applicable action matches!
    expect(applicable.length).toBe(3);

    const matchedVars = applicable.map(m => m.matchedResources.get('x'));
    expect(matchedVars).toContain('_r1');
    expect(matchedVars).toContain('_r2');
    expect(matchedVars).toContain('_r3');
  });

  it('maps animal jumps/squishes/escapes from past V1 stories', () => {
    // Define ADTs mapping our animal kinds, items, and action states
    const src = [
      'type species = cat | monkey | elephant;',
      'type item = animal(kind: species) | flower | rock | tree;',
      'type state = active(what: item) | jumpedOver(jumper: item, target: item) | squished(jumper: item, target: item) | ranAway(who: item);',
      
      // Action rules:
      // 1. A monkey squishes a flower if they jumped over it:
      'action monkeySquish: { ?j: jumpedOver(animal(monkey), flower) } -o { ?s: squished(animal(monkey), flower) };',
      
      // 2. A cat runs away if jumped over:
      'action catEscape: { ?j: jumpedOver(?any, animal(cat)) } -o { ?r: ranAway(animal(cat)) };',
      
      // Active linear resources:
      // - Monkey jumped over flower (triggers monkeySquish)
      '?r1: jumpedOver(animal(monkey), flower);',
      // - Elephant jumped over cat (triggers catEscape)
      '?r2: jumpedOver(animal(elephant), animal(cat));',
      // - Rock jumped over tree (no action applicable)
      '?r3: jumpedOver(rock, tree);',
    ].join('\n');

    const ctxt = parseContext(src);
    const story = new Story(ctxt);

    // Find applicable actions
    const applicable = getApplicableActions(ctxt);
    expect(applicable.length).toBe(2);

    const actionNames = applicable.map(m => m.action.name);
    expect(actionNames).toContain('monkeySquish');
    expect(actionNames).toContain('catEscape');

    // Apply monkeySquish match
    const monkeyMatch = applicable.find(m => m.action.name === 'monkeySquish')!;
    story.applyAction(monkeyMatch);

    // Verify step trace
    expect(story.steps.length).toBe(1);
    const firstCtxt = story.steps[0].contextAfter;

    // _r1 should be consumed, squished resource _r4 should be produced
    expect(firstCtxt.variables['r1']).toBeUndefined();
    expect(firstCtxt.variables['r4']).toBe('squished(animal(monkey), flower)');
    // _r2 and _r3 should remain unaffected
    expect(firstCtxt.variables['r2']).toBe('jumpedOver(animal(elephant), animal(cat))');
    expect(firstCtxt.variables['r3']).toBe('jumpedOver(rock, tree)');

    // Find applicable actions in the new context state
    const applicable2 = getApplicableActions(firstCtxt);
    expect(applicable2.length).toBe(1);
    expect(applicable2[0].action.name).toBe('catEscape');

    // Apply catEscape match
    story.applyAction(applicable2[0]);

    expect(story.steps.length).toBe(2);
    const secondCtxt = story.steps[1].contextAfter;

    // _r2 should be consumed, ranAway resource _r5 should be produced
    expect(secondCtxt.variables['r2']).toBeUndefined();
    expect(secondCtxt.variables['r5']).toBe('ranAway(animal(cat))');
    // _r3 and _r4 should remain unaffected
    expect(secondCtxt.variables['r3']).toBe('jumpedOver(rock, tree)');
    expect(secondCtxt.variables['r4']).toBe('squished(animal(monkey), flower)');

    // Final context should have 0 applicable actions left
    const applicable3 = getApplicableActions(secondCtxt);
    expect(applicable3.length).toBe(0);
  });
});
