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

import { parseTerm, printTerm, evaluateTerm, constr, BindingDef, DisjunctionDef, TermKind, parseContext } from '../../../logic';
import { getApplicableActions } from '../../../linear';
import { Story } from '../../../story';

export const PARAMETRIC_LISTS_SRC = [
  "type list<'x> = cons(h: 'x, t: list<'x>) | nil;",
  'type nat = 0 | suc(num: nat);',
  'fun append(cons(?h, ?t), ?l) = cons(?h, append(?t, ?l)) | fun append(nil, ?l) = ?l;',
  'action concat: { ?l1: list(?a), ?l2: list(?a) } -o { ?l1and2: append(?l1, ?l2) };',
  '_r1: cons(suc(0), nil);',
  '_r2: cons(0, nil);',
  '?y: *;',
].join('\n');

describe('Example 2: Generic Parametric Lists & Concatenation Spec', () => {
  it('runs correctly at runtime', () => {
    const ctxt = parseContext(PARAMETRIC_LISTS_SRC);

    // 1. Validate append term evaluation
    const appendTerm = parseTerm('append(cons(suc(0), nil), cons(0, nil))', ctxt);
    const evaluated = evaluateTerm(ctxt, appendTerm);
    expect(printTerm(evaluated, { ctxt })).toBe('cons<suc(0), cons<0, nil>>');

    // 2. Linear logic action list concatenation
    const story = new Story(ctxt);
    const applicable = getApplicableActions(ctxt);
    expect(applicable.length).toBe(2);
    expect(applicable[0].action.name).toBe('concat');

    story.applyAction(applicable[0]);
    const nextCtxt = story.getCurrentContext();
    
    // List resources _r1 and _r2 are consumed, merged list _r3 is produced
    expect(nextCtxt.linearResources['_r1']).toBeUndefined();
    expect(nextCtxt.linearResources['_r2']).toBeUndefined();
    expect(nextCtxt.linearResources['_r3']).toBe('cons<suc(0), cons<0, nil>>');

    // Verify generic type structures
    const listDef = ctxt.types['list'] as BindingDef;
    expect(listDef.paramOrder).toEqual(["'x"]);
    expect(listDef.params).toEqual({ "'x": constr('*') });
  });
});
