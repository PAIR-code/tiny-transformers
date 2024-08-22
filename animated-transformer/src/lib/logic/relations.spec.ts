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
  extendTypesWithDecendent,
  initTypeDef,
  parseRel,
  stringifyMapToSet,
  stringifyRelation,
  stringifyTypes,
  typesetIntersection,
  typeSetIsSubsetOf,
  universalType,
} from './relations';

describe('relations', () => {
  beforeEach(() => {});

  it('parseRel: simple', () => {
    const { relName, args } = parseRel('squishes _x _y:animal _z:animal|squishable');
    expect(relName).toEqual('squishes');
    expect(args[0].varName).toEqual('_x');
    expect(args[0].varTypes).toEqual(new Set([universalType]));
    expect(args[1].varName).toEqual('_y');
    expect(args[1].varTypes).toEqual(new Set(['animal']));
    expect(args[2].varName).toEqual('_z');
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

  it('initTypeDef: empty', () => {
    const types = initTypeDef({});
    expect(types.decendent.size).toEqual(1);
    expect(types.decendent.get('*')).toEqual(new Set());
    expect(types.ancestor.size).toEqual(1);
    expect(types.ancestor.get('*')).toEqual(new Set());
    expect(types.children.size).toEqual(1);
    expect(types.children.get('*')).toEqual(new Set());
    expect(types.parents.size).toEqual(1);
    expect(types.parents.get('*')).toEqual(new Set());
  });

  it('initTypeDef: basic', () => {
    const { decendent } = initTypeDef({
      animal: ['cat', 'monkey', 'elephant'],
      inanimate: ['rock', 'tree', 'flower'],
      squishable: ['cat', 'monkey', 'flower'],
    });
    expect(decendent.get(universalType)!.size).toBe(9);
    expect(decendent.get('animal')).toEqual(new Set(['cat', 'monkey', 'elephant']));
  });

  it('extendTypesWithDecendent', () => {
    const types = initTypeDef({});
    const current = {
      type: universalType,
      decendents: types.decendent.get(universalType)!,
      ancestors: types.decendent.get(universalType)!,
    };
    let typeName = 'A';
    extendTypesWithDecendent(current, typeName, types);

    expect(types.ancestor.get('A')).toEqual(new Set([universalType]));
    current.type = typeName;
    current.decendents = types.decendent.get(typeName)!;
    current.ancestors = types.ancestor.get(typeName)!;

    typeName = 'a1';
    extendTypesWithDecendent(current, typeName, types);
    typeName = 'a2';
    extendTypesWithDecendent(current, typeName, types);
    expect(types.decendent.get('A')).toEqual(new Set(['a1', 'a2']));
    expect(types.ancestor.get('a1')).toEqual(new Set(['A', universalType]));
    expect(types.ancestor.get('a2')).toEqual(new Set(['A', universalType]));

    current.type = universalType;
    current.decendents = types.decendent.get(current.type)!;
    current.ancestors = types.ancestor.get(current.type)!;

    typeName = 'B';
    extendTypesWithDecendent(current, typeName, types);
    current.type = typeName;
    current.decendents = types.decendent.get(typeName)!;
    current.ancestors = types.ancestor.get(typeName)!;
    typeName = 'b1';
    extendTypesWithDecendent(current, typeName, types);
    typeName = 'b2';
    extendTypesWithDecendent(current, typeName, types);
    expect(types.decendent.get('B')).toEqual(new Set(['b1', 'b2']));
    expect(types.ancestor.get('b1')).toEqual(new Set(['B', universalType]));
    expect(types.ancestor.get('b2')).toEqual(new Set(['B', universalType]));

    current.type = universalType;
    current.decendents = types.decendent.get(current.type)!;
    current.ancestors = types.ancestor.get(current.type)!;
    typeName = '1';
    extendTypesWithDecendent(current, typeName, types);

    current.type = typeName;
    current.decendents = types.decendent.get(typeName)!;
    current.ancestors = types.ancestor.get(typeName)!;
    typeName = 'a1';
    extendTypesWithDecendent(current, typeName, types);
    expect(types.decendent.get('1')).toEqual(new Set(['a1']));
    expect(types.ancestor.get('a1')).toEqual(new Set(['A', '1', universalType]));
    expect(types.ancestor.get('a2')).toEqual(new Set(['A', universalType]));
    typeName = 'b1';
    extendTypesWithDecendent(current, typeName, types);
    expect(types.decendent.get('1')).toEqual(new Set(['a1', 'b1']));
  });

  it('makeTypeDef', () => {
    const types = initTypeDef({
      A: ['a1', 'a2'],
      B: ['b1', 'b2'],
      '1': ['a1', 'b1'],
    });
    expect(types.decendent.get('A')).toEqual(new Set(['a1', 'a2']));
    expect(types.decendent.get('B')).toEqual(new Set(['b1', 'b2']));
    expect(types.decendent.get('1')).toEqual(new Set(['a1', 'b1']));
    expect(types.ancestor.get('a1')).toEqual(new Set(['A', '1', universalType]));
    expect(types.ancestor.get('A')).toEqual(new Set([universalType]));
    expect(types.ancestor.get('b2')).toEqual(new Set(['B', universalType]));
  });

  // it('nonStrictSubtypeOfTypeset', () => {
  //   const { subtypeMap, supertypeMap } = initTypeDef({
  //     A: ['a1', 'a2'],
  //     B: ['b1', 'b2'],
  //     '1': ['a1', 'b1'],
  //     AB: ['A', 'B'],
  //   });
  //   expect(nonStrictSubtypeOfTypeset(subtypeMap, 'A', new Set('A'))).toEqual(true);
  //   expect(nonStrictSubtypeOfTypeset(subtypeMap, 'A', new Set('AB'))).toEqual(true);
  //   expect(nonStrictSubtypeOfTypeset(subtypeMap, 'A', new Set('A'))).toEqual(true);
  //   expect(nonStrictSubtypeOfTypeset(subtypeMap, 'A', new Set('B'))).toEqual(false);
  //   expect(nonStrictSubtypeOfTypeset(subtypeMap, 'a1', new Set('AB'))).toEqual(true);
  //   expect(nonStrictSubtypeOfTypeset(subtypeMap, 'a1', new Set('A'))).toEqual(true);
  //   expect(nonStrictSubtypeOfTypeset(subtypeMap, 'a1', new Set('B'))).toEqual(false);
  // });

  it('typeSetIsSubsetOf', () => {
    const { decendent } = initTypeDef({
      A: ['a1', 'a2'],
      B: ['b1', 'b2'],
      '1': ['a1', 'b1'],
      AB: ['A', 'B'],
    });
    // expect(typeSetIsSubsetOf(decendentMap, new Set(['A', '1']), new Set(['A', '1']))).toBeTrue();
    // expect(typeSetIsSubsetOf(decendentMap, new Set(['A']), new Set(['AB']))).toBeTrue();
    // expect(typeSetIsSubsetOf(decendentMap, new Set(['A']), new Set(['AB', 'B']))).toBeTrue();
    // expect(typeSetIsSubsetOf(decendentMap, new Set(['A']), new Set(['a1', 'a2']))).toBeTrue();
    expect(typeSetIsSubsetOf(decendent, new Set(['a1', 'a2']), new Set(['A']))).toBeTrue();
    // expect(typeSetIsSubsetOf(decendentMap, new Set(['a1', 'a2']), new Set(['AB']))).toBeTrue();
    // expect(typeSetIsSubsetOf(decendentMap, new Set(['a1', 'a2']), new Set(['AB', '1']))).toBeTrue();
    // expect(typeSetIsSubsetOf(decendentMap, new Set(['B', 'A']), new Set(['AB']))).toBeTrue();
    // expect(typeSetIsSubsetOf(decendentMap, new Set(['AB']), new Set(['A', 'B']))).toBeTrue();
  });

  // fit('nonStrictTypeIsInSet', () => {
  //   const { subtypeMap } = initTypeDef({
  //     A: ['a1', 'a2'],
  //     B: ['b1', 'b2'],
  //     '1': ['a1', 'b1'],
  //     AB: ['A', 'B'],
  //   });
  //   expect(nonStrictTypeIsInSet(subtypeMap, '1', new Set(['A', 'B']))).toEqual(
  //     new Set(['a1', 'b1'])
  //   );
  //   expect(nonStrictTypeIsInSet(subtypeMap, '1', new Set(['AB']))).toEqual(new Set(['a1', 'b1']));
  //   expect(nonStrictTypeIsInSet(subtypeMap, 'a1', new Set(['A', '1']))).toEqual(new Set(['a1']));
  //   expect(nonStrictTypeIsInSet(subtypeMap, 'A', new Set(['AB']))).toEqual(new Set(['A']));
  // });

  it('typeIntersection', () => {
    const types = initTypeDef({
      A: ['a1', 'a2'],
      B: ['b1', 'b2'],
      '1': ['a1', 'b1'],
      AB: ['A', 'B'],
    });
    expect(typesetIntersection(types, new Set(['A', 'B']), new Set(['A', 'B']))).toEqual(
      new Set(['a1', 'a2', 'b1', 'b2'])
    );
    expect(typesetIntersection(types, new Set(['A', 'B']), new Set(['AB']))).toEqual(
      new Set(['a1', 'a2', 'b1', 'b2'])
    );
    expect(typesetIntersection(types, new Set(['AB']), new Set(['A', 'B']))).toEqual(
      new Set(['a1', 'a2', 'b1', 'b2'])
    );
    expect(typesetIntersection(types, new Set(['1']), new Set(['A', 'B']))).toEqual(
      new Set(['a1', 'b1'])
    );
    expect(typesetIntersection(types, new Set(['b1', 'b2']), new Set(['A', 'B']))).toEqual(
      new Set(['b1', 'b2'])
    );
  });
});
