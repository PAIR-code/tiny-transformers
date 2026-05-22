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
import { FreshNames } from '../names/simple_fresh_names';
import { TypeConstructor, createTypeContext, extendTypeContext, constr, variable, inferType, typeCheck } from './v2_logic';

describe('v2_logic of peano natural numbers', () => {
  beforeEach(() => {});

  it('simple construction', () => {
    const suc: TypeConstructor = {
      constructorName: 'suc',
      createdTypeName: 'nat',
      arguments: { num: 'nat' },
    };
    const zero: TypeConstructor = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };

    const ctxt = createTypeContext([suc, zero]);

    expect(ctxt).toEqual({
      types: {
        nat: {
          constructors: {
            suc: suc,
            '0': zero,
          },
        },
      },
    });
  });

  it('throws error if type has no base case (direct self-loop)', () => {
    const bad: TypeConstructor = {
      constructorName: 'badConstr',
      createdTypeName: 'bad',
      arguments: { recursive: 'bad' },
    };

    expect(() => createTypeContext([bad])).toThrowError(
      /have no base case/
    );
  });

  it('throws error if types have no base case (mutual recursion loop)', () => {
    const a: TypeConstructor = {
      constructorName: 'aConstr',
      createdTypeName: 'A',
      arguments: { toB: 'B' },
    };
    const b: TypeConstructor = {
      constructorName: 'bConstr',
      createdTypeName: 'B',
      arguments: { toA: 'A' },
    };

    expect(() => createTypeContext([a, b])).toThrowError(
      /have no base case/
    );
  });

  it('succeeds with mutual recursion that has a base case', () => {
    const a: TypeConstructor = {
      constructorName: 'aConstr',
      createdTypeName: 'A',
      arguments: { toB: 'B' },
    };
    const bConstr: TypeConstructor = {
      constructorName: 'bConstr',
      createdTypeName: 'B',
      arguments: { toA: 'A' },
    };
    const bBase: TypeConstructor = {
      constructorName: 'bBase',
      createdTypeName: 'B',
      arguments: {},
    };

    const ctxt = createTypeContext([a, bConstr, bBase]);
    expect(ctxt.types['A']).toBeDefined();
    expect(ctxt.types['B']).toBeDefined();
  });

  it('compositionally extends a valid context with new valid types', () => {
    const zero: TypeConstructor = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };
    const ctxt = createTypeContext([zero]);

    // Let's add a new type that depends on nat
    const listNil: TypeConstructor = {
      constructorName: 'nil',
      createdTypeName: 'natList',
      arguments: {},
    };
    const listCons: TypeConstructor = {
      constructorName: 'cons',
      createdTypeName: 'natList',
      arguments: { head: 'nat', tail: 'natList' },
    };

    const extended = extendTypeContext(ctxt, [listNil, listCons]);
    expect(extended.types['nat']).toBeDefined();
    expect(extended.types['natList']).toBeDefined();
  });

  it('refuses to extend context with invalid type, leaving it unchanged', () => {
    const zero: TypeConstructor = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };
    const ctxt = createTypeContext([zero]);

    const bad: TypeConstructor = {
      constructorName: 'badConstr',
      createdTypeName: 'bad',
      arguments: { recursive: 'bad' },
    };

    expect(() => extendTypeContext(ctxt, [bad])).toThrowError(
      /have no base case/
    );
    // Verify ctxt wasn't contaminated
    expect(ctxt.types['bad']).toBeUndefined();
  });

  describe('term creation and type checking/inference', () => {
    const zero: TypeConstructor = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };
    const suc: TypeConstructor = {
      constructorName: 'suc',
      createdTypeName: 'nat',
      arguments: { num: 'nat' },
    };
    const listNil: TypeConstructor = {
      constructorName: 'nil',
      createdTypeName: 'natList',
      arguments: {},
    };
    const listCons: TypeConstructor = {
      constructorName: 'cons',
      createdTypeName: 'natList',
      arguments: { head: 'nat', tail: 'natList' },
    };

    const ctxt = createTypeContext([zero, suc, listNil, listCons]);

    it('infers type of simple constructor term', () => {
      const term = constr('0');
      expect(inferType(ctxt, term)).toBe('nat');
    });

    it('infers type of complex recursive constructor term', () => {
      const term = constr('cons', [
        constr('suc', [constr('0')]),
        constr('nil'),
      ]);
      expect(inferType(ctxt, term)).toBe('natList');
    });

    it('typeCheck succeeds on correct terms', () => {
      const term = constr('cons', [
        constr('suc', [constr('0')]),
        constr('nil'),
      ]);
      expect(() => typeCheck(ctxt, term, 'natList')).not.toThrow();
    });

    it('typeCheck throws on type mismatch in argument', () => {
      // Passing 'nil' (natList) instead of a 'nat' for 'head' of 'cons'
      const badTerm = constr('cons', [
        constr('nil'),
        constr('nil'),
      ]);
      expect(() => typeCheck(ctxt, badTerm, 'natList')).toThrowError(
        /Type mismatch/
      );
    });

    it('infers type of variable from varTypes env', () => {
      const term = variable('x');
      expect(inferType(ctxt, term, { x: 'nat' })).toBe('nat');
    });

    it('typeCheck succeeds on variable with correct type', () => {
      const term = variable('x');
      expect(() => typeCheck(ctxt, term, 'nat', { x: 'nat' })).not.toThrow();
    });

    it('typeCheck throws on variable with mismatched type', () => {
      const term = variable('x');
      expect(() => typeCheck(ctxt, term, 'natList', { x: 'nat' })).toThrowError(
        /Type mismatch/
      );
    });

    it('typeCheck throws on missing variables', () => {
      const term = variable('y');
      expect(() => typeCheck(ctxt, term, 'nat')).toThrowError(
        /has no declared type/
      );
    });

    it('throws error for unknown constructors', () => {
      const term = constr('unknown');
      expect(() => inferType(ctxt, term)).toThrowError(
        /Unknown constructor/
      );
    });

    it('handles overloaded constructors based on expected type', () => {
      // Suppose we have constructor 'c' in two different types
      const c1: TypeConstructor = {
        constructorName: 'c',
        createdTypeName: 'T1',
        arguments: {},
      };
      const c2: TypeConstructor = {
        constructorName: 'c',
        createdTypeName: 'T2',
        arguments: {},
      };
      const multiCtxt = createTypeContext([c1, c2]);

      const term = constr('c');
      // inferType should throw an Ambiguous constructor error
      expect(() => inferType(multiCtxt, term)).toThrowError(
        /Ambiguous constructor name/
      );

      // typeCheck should succeed by resolving 'c' based on expected type!
      expect(() => typeCheck(multiCtxt, term, 'T1')).not.toThrow();
      expect(() => typeCheck(multiCtxt, term, 'T2')).not.toThrow();
    });
  });
});

