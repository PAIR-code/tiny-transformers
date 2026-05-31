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

import { parseTerm, printTerm, evaluateTerm, parseContext } from '../../../logic';
import { getApplicableActions } from '../../../linear';
import { Story } from '../../../story';

export const BINARY_TREES_SRC = [
  "type tree<'val> = leaf | node(left: tree<'val>, val: 'val, right: tree<'val>);",
  'type nat = 0 | suc(num: nat);',
  "type list<'x> = cons(h: 'x, t: list<'x>) | nil;",
  'fun append(cons(?h, ?t), ?l) = cons(?h, append(?t, ?l)) | fun append(nil, ?l) = ?l;',
  'fun flat(node{ left = ?l, val = ?v, right = ?r }) = append(flat(?l), cons(?v, flat(?r))) | fun flat(leaf) = nil;',
  'action flattenTree: { ?t: tree(?elem) } -o { ?res: flat(?t) };',
  '_r1: node{ left = leaf, val = suc(0), right = node{ left = leaf, val = 0, right = leaf } };',
].join('\n');

describe('Example 4: Algebraic Parameterized Binary Trees Spec', () => {
  it('runs correctly at runtime', () => {
    const ctxt = parseContext(BINARY_TREES_SRC);

    // 1. Flatten tree node `_r1` via `flat(_r1)` CBV evaluation
    const flatTerm = parseTerm('flat(node{ left = leaf, val = suc(0), right = node{ left = leaf, val = 0, right = leaf } })', ctxt);
    const evaluated = evaluateTerm(ctxt, flatTerm);
    expect(printTerm(evaluated, { ctxt })).toBe('cons<suc(0), cons<0, nil>>');

    // 2. Linear flattening action transition
    const story = new Story(ctxt);
    const applicable = getApplicableActions(ctxt);
    expect(applicable.length).toBe(1);
    expect(applicable[0].action.name).toBe('flattenTree');

    story.applyAction(applicable[0]);
    const nextCtxt = story.getCurrentContext();
    expect(nextCtxt.linearResources['_r1']).toBeUndefined();
    expect(nextCtxt.linearResources['_r2']).toBe('cons<suc(0), cons<0, nil>>');
  });
});
