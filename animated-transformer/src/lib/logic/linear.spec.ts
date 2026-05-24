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

import { parseContext, parseTerm, printTerm } from './v2_logic';
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

  it('matches general type resource pattern', () => {
    const ctxtSrc = [
      'type nat = 0 | suc(num: nat);',
      '?r1: 0;',
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
      '?r1: suc(0);',
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
      'fun add(suc(x), y) = suc(add(x, y)) | fun add(0, y) = y;',
      '?r1: suc(0);',
      '?r2: suc(suc(0));',
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
});
