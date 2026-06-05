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

import { parseContext, parseTerm, printTerm } from './logic';
import {
  parseLolliAction,
  printLolliAction,
  splitTopLevelCommas,
  matchAction,
  LinearStory,
} from './linear';

describe('linear lolli logic', () => {
  it('splitTopLevelCommas parses commas at top level only', () => {
    expect(splitTopLevelCommas('?x: nat, ?y: list(?x)')).toEqual([
      '?x: nat',
      '?y: list(?x)',
    ]);
    expect(splitTopLevelCommas('?x: node{left=leaf, val=suc(0)}, ?y: nat')).toEqual([
      '?x: node{left=leaf, val=suc(0)}',
      '?y: nat',
    ]);
  });

  it('parses and prints Lolli Actions correctly', () => {
    const ctxtSrc = [
      'type nat = 0 | suc(num: nat);',
    ].join('\n');
    const ctxt = parseContext(ctxtSrc);

    const actionStr = 'grow: { ?x: nat } -o { ?y: suc(?x) }';
    const action = parseLolliAction(actionStr, ctxt);

    expect(action.name).toBe('grow');
    expect(action.lhs.length).toBe(1);
    expect(action.lhs[0].varName).toBe('x');
    expect(printTerm(action.lhs[0].typePattern)).toBe('nat');

    expect(action.rhs.length).toBe(1);
    expect(action.rhs[0].varName).toBe('y');
    expect(printTerm(action.rhs[0].typePattern)).toBe('suc(?x)');

    const printed = printLolliAction(action);
    expect(printed).toBe('grow: { ?x: nat } -o { ?y: suc(?x) }');
  });

  it('parses and prints Lolli Actions with scores correctly', () => {
    const ctxtSrc = [
      'type nat = 0 | suc(num: nat);',
    ].join('\n');
    const ctxt = parseContext(ctxtSrc);

    const actionStr = 'grow[1.5]: { ?x: nat } -o { ?y: suc(?x) }';
    const action = parseLolliAction(actionStr, ctxt);

    expect(action.name).toBe('grow');
    expect(action.score).toBeDefined();
    expect(printTerm(action.score!)).toBe('1.5');
    expect(action.lhs.length).toBe(1);

    const printed = printLolliAction(action);
    expect(printed).toBe('grow [1.5]: { ?x: nat } -o { ?y: suc(?x) }');
  });

  it('matches general type resource pattern', () => {
    const ctxtSrc = [
      'type nat = 0 | suc(num: nat);',
      '_r1: 0;',
    ].join('\n');
    const ctxt = parseContext(ctxtSrc);
    const story = LinearStory.fromContext(ctxt);

    const action = parseLolliAction('grow: { ?x: nat } -o { ?y: suc(?x) }', ctxt);
    const matches = matchAction(ctxt, action, story.resources);

    expect(matches.length).toBe(1);
    const match = matches[0];
    expect(match.matchedResources.get('x')).toBe('_r1');
    expect(printTerm(match.subst['x'])).toBe('0');
  });

  it('matches specific term pattern', () => {
    const ctxtSrc = [
      'type nat = 0 | suc(num: nat);',
      '_r1: suc(0);',
    ].join('\n');
    const ctxt = parseContext(ctxtSrc);
    const story = LinearStory.fromContext(ctxt);

    const action = parseLolliAction('decrement: { ?x: suc(?v) } -o { ?y: ?v }', ctxt);
    const matches = matchAction(ctxt, action, story.resources);

    expect(matches.length).toBe(1);
    const match = matches[0];
    expect(match.matchedResources.get('x')).toBe('_r1');
    expect(printTerm(match.subst['v'])).toBe('0');
    expect(printTerm(match.subst['x'])).toBe('suc(0)');
  });

  it('applies action and transitions state, including evaluating functions', () => {
    const ctxtSrc = [
      'type nat = 0 | suc(num: nat);',
      'fun add(suc(?x), ?y) = suc(add(?x, ?y)) | fun add(0, ?y) = ?y;',
      '_r1: suc(0);',
      '_r2: suc(suc(0));',
    ].join('\n');
    const ctxt = parseContext(ctxtSrc);
    const story = LinearStory.fromContext(ctxt);

    expect(story.resources.length).toBe(2);

    // Match and apply a simple grow action
    const growAction = parseLolliAction('grow: { ?x: nat } -o { ?y: suc(?x) }', ctxt);
    const growMatches = matchAction(ctxt, growAction, story.resources);
    // Two possible matches since we have two nat resources!
    expect(growMatches.length).toBe(2);

    // Let's match grow on _r1 (suc(0))
    const matchGrow = growMatches.find(m => m.matchedResources.get('x') === '_r1')!;
    const story2 = story.applyAction(matchGrow);

    // _r1 (suc(0)) is consumed, and a new resource _r3 (suc(suc(0))) is produced!
    // So active resources should be _r2 (suc(suc(0))) and _r3 (suc(suc(0))).
    expect(story2.resources.length).toBe(2);
    expect(story2.resources.map(r => printTerm(r.type))).toContain('suc(suc(0))');

    // Let's match and apply add action: consumes both and sums them up
    const addAction = parseLolliAction('sum: { ?a: nat, ?b: nat } -o { ?c: add(?a, ?b) }', ctxt);
    const addMatches = matchAction(ctxt, addAction, story2.resources);
    
    // Since both resources are of type nat, there are 2 matches depending on ordering (a matched to _r2/b to _r3 or vice versa)
    expect(addMatches.length).toBe(2);

    const story3 = story2.applyAction(addMatches[0]);
    expect(story3.resources.length).toBe(1);
    
    // The sum of suc(suc(0)) (2) and suc(suc(0)) (2) should evaluate to 4: suc(suc(suc(suc(0))))!
    const resultType = story3.resources[0].type;
    expect(printTerm(resultType)).toBe('suc(suc(suc(suc(0))))');
  });

  it('evaluates initial resource types containing function calls to normal form for structural matching', () => {
    const ctxtSrc = [
      'type nat = 0 | suc(num: nat);',
      'fun add(suc(?x), ?y) = suc(add(?x, ?y)) | fun add(0, ?y) = ?y;',
      '_r1: add(suc(0), suc(0));', // evaluates to suc(suc(0))
    ].join('\n');
    const ctxt = parseContext(ctxtSrc);
    const story = LinearStory.fromContext(ctxt);

    // Assert that the initial resource type is evaluated to normal form 'suc(suc(0))'
    expect(story.resources.length).toBe(1);
    expect(printTerm(story.resources[0].type)).toBe('suc(suc(0))');

    // Structural match: decrement action requires 'suc(?v)' which matches 'suc(suc(0))'
    const decrementAction = parseLolliAction('decrement: { ?x: suc(?v) } -o { ?y: ?v }', ctxt);
    const matches = matchAction(ctxt, decrementAction, story.resources);
    expect(matches.length).toBe(1);
    expect(printTerm(matches[0].subst['v'])).toBe('suc(0)');
  });

  it('supports action declarations without resource names', () => {
    const ctxtSrc = [
      'type nat = 0 | suc(num: nat);',
      '_r1: 0;',
    ].join('\n');
    const ctxt = parseContext(ctxtSrc);
    const story = LinearStory.fromContext(ctxt);

    // Parsing action string with anonymous resources on LHS and RHS (no cross-references)
    const actionStr = 'reset: { nat } -o { 0 }';
    const action = parseLolliAction(actionStr, ctxt);

    expect(action.name).toBe('reset');
    expect(action.lhs.length).toBe(1);
    expect(action.lhs[0].varName).toBe('_gen_var_0');
    expect(printTerm(action.lhs[0].typePattern)).toBe('nat');

    expect(action.rhs.length).toBe(1);
    expect(action.rhs[0].varName).toBe('_gen_var_1');
    expect(printTerm(action.rhs[0].typePattern)).toBe('0');

    // Verify printed action does not output generated variable names
    const printed = printLolliAction(action);
    expect(printed).toBe('reset: { nat } -o { 0 }');

    // Matching and application still works correctly
    const matches = matchAction(ctxt, action, story.resources);
    expect(matches.length).toBe(1);
    expect(matches[0].matchedResources.get('_gen_var_0')).toBe('_r1');
  });

  it('supports mixing named and anonymous resources in a single action', () => {
    const ctxtSrc = [
      'type nat = 0 | suc(num: nat);',
      'type species = cat | dog;',
      '_r1: 0;',
      '_r2: cat;',
    ].join('\n');
    const ctxt = parseContext(ctxtSrc);
    const story = LinearStory.fromContext(ctxt);

    // ?x is named because it is referenced on the RHS in suc(?x). 
    // species is anonymous because we just consume it and do not reference it on the RHS.
    const actionStr = 'grow_with_animal: { ?x: nat, species } -o { suc(?x) }';
    const action = parseLolliAction(actionStr, ctxt);

    expect(action.name).toBe('grow_with_animal');
    expect(action.lhs.length).toBe(2);
    
    // ?x is named
    expect(action.lhs[0].varName).toBe('x');
    expect(printTerm(action.lhs[0].typePattern)).toBe('nat');
    
    // species is anonymous (gets auto-generated name)
    expect(action.lhs[1].varName).toBe('_gen_var_0');
    expect(printTerm(action.lhs[1].typePattern)).toBe('species');

    // RHS gets auto-generated name
    expect(action.rhs[0].varName).toBe('_gen_var_1');
    expect(printTerm(action.rhs[0].typePattern)).toBe('suc(?x)');

    // Verify printed action preserves the mix of named and anonymous
    const printed = printLolliAction(action);
    expect(printed).toBe('grow_with_animal: { ?x: nat, species } -o { suc(?x) }');

    // Matching and application still works correctly
    const matches = matchAction(ctxt, action, story.resources);
    expect(matches.length).toBe(1);
    expect(matches[0].matchedResources.get('x')).toBe('_r1');
    expect(matches[0].matchedResources.get('_gen_var_0')).toBe('_r2');
  });
});
