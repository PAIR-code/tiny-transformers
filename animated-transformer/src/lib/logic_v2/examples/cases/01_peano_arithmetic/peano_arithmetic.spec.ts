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

import { parseTerm, printTerm, evaluateTerm, typeCheck, parseContext } from '../../../logic';
import { getApplicableActions } from '../../../linear';
import { Story } from '../../../story';

export const PEANO_ARITHMETIC_SRC = [
  'type nat = 0 | suc(num: nat);',
  'let 1 = suc(0);',
  'let 2 = suc(suc(0));',
  'let 3 = suc(suc(suc(0)));',
  'fun add(suc(?x), ?y) = suc(add(?x, ?y)) | fun add(0, ?y) = ?y;',
  'action grow: { ?x: nat } -o { ?y: suc(?x) };',
  'action doubleGrow: { ?x: nat } -o { ?y: suc(?x), ?z: suc(?x) };',
  '_r1: 0;',
  '_r2: suc(0);',
  '_r3: suc(suc(0));',
  '?y: *;',
].join('\n');

describe('Example 1: Peano Natural Numbers & CBV Arithmetic Spec', () => {
  it('runs correctly at runtime', () => {
    const ctxt = parseContext(PEANO_ARITHMETIC_SRC);

    // 1. Validate term typechecking: 1 + 1 = 2
    const testTerm = parseTerm('add(suc(0), suc(0))', ctxt);
    expect(() => typeCheck(ctxt, testTerm, 'nat')).not.toThrow();

    // 2. Validate CBV evaluation: 1 + 1 evaluates to suc(suc(0)) (which is 2)
    const evaluated = evaluateTerm(ctxt, testTerm);
    expect(printTerm(evaluated)).toBe('suc(suc(0))');

    // 3. Stateful story grow resource matching
    const story = new Story(ctxt);
    const applicable = getApplicableActions(ctxt);
    
    // Grow is applicable on _r1 (0), _r2 (suc(0)), and _r3 (suc(suc(0)))
    const growMatches = applicable.filter((m) => m.action.name === 'grow');
    expect(growMatches.length).toBe(3);

    // Apply grow on _r1: consumes _r1 (0) and produces _r4 (suc(0))
    const growZero = growMatches.find((m) => m.matchedResources.get('x') === '_r1')!;
    story.applyAction(growZero);

    const nextCtxt = story.getCurrentContext();
    expect(nextCtxt.linearResources['_r1']).toBeUndefined();
    expect(nextCtxt.linearResources['_r4']).toBe('suc(0)');
  });
});
