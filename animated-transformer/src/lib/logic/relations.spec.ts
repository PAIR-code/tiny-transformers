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
import {
  addToTypeMap,
  initTypeDef,
  parseRel,
  stringifyRelation,
  stringifyTypes,
  subtypeOfTypeset,
  typesetIntersection,
  typeIntersectSet,
  typeSetIsSubsetOf,
} from './relations';

fdescribe('generative_logic', () => {
  beforeEach(() => {});

  it('parseRel: simple', () => {
    const { relName, args } = parseRel(
      'squishes _x _y:animal _z:animal|squishable'
    );
    expect(relName).toEqual('squishes');
    expect(args[0].varName).toEqual('_x');
    expect(args[0].varTypes).toEqual(new Set(''));
    expect(args[1].varName).toEqual('_y');
    expect(args[1].varTypes).toEqual(new Set(['animal']));
    expect(args[2].varName).toEqual('_y');
    expect(args[2].varTypes).toEqual(new Set(['animal', 'squishable']));
  });

  it('stringifyTypes: invariant to set construction', () => {
    const typeSet1 = new Set(['c', 'a', 'b']);
    const typeSet2 = new Set(['a', 'b', 'c']);
    const typeSet3 = new Set(['c', 'b', 'a']);
    expect(stringifyTypes(typeSet1)).toEqual('a|b|c');
    expect(stringifyTypes(typeSet2)).toEqual('a|b|c');
    expect(stringifyTypes(typeSet3)).toEqual('a|b|c');
  });

  it('stringifyRel: orders types', () => {
    const rel = parseRel('squishes _x _y:animal _z:c|a|b');
    expect(stringifyRelation(rel)).toEqual('squishes _x _y:animal _z:a|b|c');
  });

  it('makeTypeDef', () => {
    const typeDef = initTypeDef({
      A: ['a1', 'a2'],
      B: ['b1', 'b2'],
      '1': ['a1', 'b1'],
    });
    expect(typeDef.get('A')).toEqual(new Set(['a1', 'a2']));
    expect(typeDef.get('B')).toEqual(new Set(['b1', 'b2']));
    expect(typeDef.get('1')).toEqual(new Set(['a1', 'b1']));
  });

  it('subtypeOfTypeset', () => {
    const typeDef = initTypeDef({
      A: ['a1', 'a2'],
      B: ['b1', 'b2'],
      '1': ['a1', 'b1'],
      AB: ['A', 'B'],
    });
    expect(subtypeOfTypeset(typeDef, 'A', new Set('A'))).toEqual(true);
    expect(subtypeOfTypeset(typeDef, 'A', new Set('AB'))).toEqual(true);
    expect(subtypeOfTypeset(typeDef, 'A', new Set('A'))).toEqual(true);
    expect(subtypeOfTypeset(typeDef, 'A', new Set('B'))).toEqual(false);
    expect(subtypeOfTypeset(typeDef, 'a1', new Set('AB'))).toEqual(true);
    expect(subtypeOfTypeset(typeDef, 'a1', new Set('A'))).toEqual(true);
    expect(subtypeOfTypeset(typeDef, 'a1', new Set('B'))).toEqual(false);
  });

  it('typeIsSubsetOf', () => {
    const typeDef = initTypeDef({
      A: ['a1', 'a2'],
      B: ['b1', 'b2'],
      '1': ['a1', 'b1'],
      AB: ['A', 'B'],
    });
    expect(
      typeSetIsSubsetOf(typeDef, new Set(['A', '1']), new Set(['A', '1']))
    ).toBeTrue();
    expect(
      typeSetIsSubsetOf(typeDef, new Set(['A']), new Set(['AB']))
    ).toBeTrue();
    expect(
      typeSetIsSubsetOf(typeDef, new Set(['A']), new Set(['AB', 'B']))
    ).toBeTrue();
    expect(
      typeSetIsSubsetOf(typeDef, new Set(['A']), new Set(['a1', 'a2']))
    ).toBeTrue();
    expect(
      typeSetIsSubsetOf(typeDef, new Set(['a1', 'a2']), new Set(['A']))
    ).toBeTrue();
    expect(
      typeSetIsSubsetOf(typeDef, new Set(['a1', 'a2']), new Set(['AB']))
    ).toBeTrue();
    expect(
      typeSetIsSubsetOf(typeDef, new Set(['a1', 'a2']), new Set(['AB', '1']))
    ).toBeTrue();
    expect(
      typeSetIsSubsetOf(typeDef, new Set(['B', 'A']), new Set(['AB']))
    ).toBeTrue();
    expect(
      typeSetIsSubsetOf(typeDef, new Set(['AB']), new Set(['A', 'B']))
    ).toBeTrue();
  });

  it('typeIntersectSet', () => {
    const typeDef = initTypeDef({
      A: ['a1', 'a2'],
      B: ['b1', 'b2'],
      '1': ['a1', 'b1'],
      AB: ['A', 'B'],
    });
    expect(typeIntersectSet(typeDef, '1', new Set(['A', 'B']))).toEqual(
      new Set(['1'])
    );
    expect(typeIntersectSet(typeDef, '1', new Set(['AB']))).toEqual(
      new Set(['1'])
    );
    expect(typeIntersectSet(typeDef, 'a1', new Set(['A', '1']))).toEqual(
      new Set(['a1'])
    );
    expect(typeIntersectSet(typeDef, 'A', new Set(['AB']))).toEqual(
      new Set(['A'])
    );
  });

  it('typeIntersection', () => {
    const typeDef = initTypeDef({
      A: ['a1', 'a2'],
      B: ['b1', 'b2'],
      '1': ['a1', 'b1'],
      AB: ['A', 'B'],
    });
    expect(
      typesetIntersection(typeDef, new Set(['A', 'B']), new Set(['A', 'B']))
    ).toEqual(new Set(['A', 'B']));
    expect(
      typesetIntersection(typeDef, new Set(['A', 'B']), new Set(['AB']))
    ).toEqual(new Set(['AB']));
    expect(
      typesetIntersection(typeDef, new Set(['AB']), new Set(['A', 'B']))
    ).toEqual(new Set(['AB']));
    expect(
      typesetIntersection(typeDef, new Set(['1']), new Set(['A', 'B']))
    ).toEqual(new Set(['1']));
    expect(
      typesetIntersection(typeDef, new Set(['b1', 'b2']), new Set(['A', 'B']))
    ).toEqual(new Set(['B']));
  });
});
