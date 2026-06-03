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
import { seq, tokenOf } from 'mini-parse';
import { ConjunctionData, BindingDef, DisjunctionDef, Context, createContext, extendContext, constr, variable, escaped, EscapedValue, Term, inferType, typeCheck, parseContext, printContext, parseTerm, printTerm, getBaseType, TermKind, TypeKind, evaluateTerm, solveEquation, TypeChecker, unify, matchTypes } from './logic';

describe('v2_logic of peano natural numbers', () => {
  beforeEach(() => {});

  it('simple construction', () => {
    const suc: ConjunctionData = {
      constructorName: 'suc',
      createdTypeName: 'nat',
      arguments: { num: 'nat' },
    };
    const zero: ConjunctionData = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };

    const ctxt = createContext([suc, zero]);

    expect(ctxt.getRawData()).toEqual({
      types: {
        nat: {
          kind: TypeKind.Disjunction,
          sumTypeName: 'nat',
          constructors: {
            suc: {
              kind: TypeKind.Conjunction,
              constructorName: 'suc',
              productTypeName: 'nat_suc',
              arguments: {
                num: { kind: TermKind.Literal, literalName: 'nat', unNamedArgs: [], namedArgs: {} },
              },
              argOrder: undefined,
            },
            '0': {
              kind: TypeKind.Conjunction,
              constructorName: '0',
              productTypeName: 'nat_0',
              arguments: {},
              argOrder: undefined,
            },
          },
        },
      },
      constructors: {
        suc: {
          kind: TypeKind.Conjunction,
          constructorName: 'suc',
          productTypeName: 'nat_suc',
          arguments: {
            num: { kind: TermKind.Literal, literalName: 'nat', unNamedArgs: [], namedArgs: {} },
          },
          argOrder: undefined,
        },
        '0': {
          kind: TypeKind.Conjunction,
          constructorName: '0',
          productTypeName: 'nat_0',
          arguments: {},
          argOrder: undefined,
        },
      },
      linearResources: {},
      variables: {},
      functions: {},
      actions: {},
    });
  });

  it('throws error if type has no base case (direct self-loop)', () => {
    const bad: ConjunctionData = {
      constructorName: 'badConstr',
      createdTypeName: 'bad',
      arguments: { recursive: 'bad' },
    };

    expect(() => createContext([bad])).toThrowError(
      /have no base case/
    );
  });

  it('throws error if types have no base case (mutual recursion loop)', () => {
    const a: ConjunctionData = {
      constructorName: 'aConstr',
      createdTypeName: 'A',
      arguments: { toB: 'B' },
    };
    const b: ConjunctionData = {
      constructorName: 'bConstr',
      createdTypeName: 'B',
      arguments: { toA: 'A' },
    };

    expect(() => createContext([a, b])).toThrowError(
      /have no base case/
    );
  });

  it('succeeds with mutual recursion that has a base case', () => {
    const a: ConjunctionData = {
      constructorName: 'aConstr',
      createdTypeName: 'A',
      arguments: { toB: 'B' },
    };
    const bConstr: ConjunctionData = {
      constructorName: 'bConstr',
      createdTypeName: 'B',
      arguments: { toA: 'A' },
    };
    const bBase: ConjunctionData = {
      constructorName: 'bBase',
      createdTypeName: 'B',
      arguments: {},
    };

    const ctxt = createContext([a, bConstr, bBase]);
    expect(ctxt.types['A']).toBeDefined();
    expect(ctxt.types['B']).toBeDefined();
  });

  it('compositionally extends a valid context with new valid types', () => {
    const zero: ConjunctionData = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };
    const ctxt = createContext([zero]);

    // Let's add a new type that depends on nat
    const listNil: ConjunctionData = {
      constructorName: 'nil',
      createdTypeName: 'natList',
      arguments: {},
    };
    const listCons: ConjunctionData = {
      constructorName: 'cons',
      createdTypeName: 'natList',
      arguments: { head: 'nat', tail: 'natList' },
    };

    const extended = extendContext(ctxt, [listNil, listCons]);
    expect(extended.types['nat']).toBeDefined();
    expect(extended.types['natList']).toBeDefined();
  });

  it('refuses to extend context with invalid type, leaving it unchanged', () => {
    const zero: ConjunctionData = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };
    const ctxt = createContext([zero]);

    const bad: ConjunctionData = {
      constructorName: 'badConstr',
      createdTypeName: 'bad',
      arguments: { recursive: 'bad' },
    };

    expect(() => extendContext(ctxt, [bad])).toThrowError(
      /have no base case/
    );
    // Verify ctxt wasn't contaminated
    expect(ctxt.types['bad']).toBeUndefined();
  });

  describe('term creation and type checking/inference', () => {
    const zero: ConjunctionData = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };
    const suc: ConjunctionData = {
      constructorName: 'suc',
      createdTypeName: 'nat',
      arguments: { num: 'nat' },
    };
    const listNil: ConjunctionData = {
      constructorName: 'nil',
      createdTypeName: 'natList',
      arguments: {},
    };
    const listCons: ConjunctionData = {
      constructorName: 'cons',
      createdTypeName: 'natList',
      arguments: { head: 'nat', tail: 'natList' },
    };

    const ctxt = createContext([zero, suc, listNil, listCons]);

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

    it('refuses to define overloaded constructors due to literal clash', () => {
      const c1: ConjunctionData = {
        constructorName: 'c',
        createdTypeName: 'T1',
        arguments: {},
      };
      const c2: ConjunctionData = {
        constructorName: 'c',
        createdTypeName: 'T2',
        arguments: {},
      };
      expect(() => createContext([c1, c2])).toThrowError(
        /Constructor literal 'c' already defined/
      );
    });
  });

  describe('TypeChecker Class direct usage', () => {
    const zero: ConjunctionData = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };
    const suc: ConjunctionData = {
      constructorName: 'suc',
      createdTypeName: 'nat',
      arguments: { num: 'nat' },
    };
    const ctxt = createContext([zero, suc]);

    it('instantiates and performs type inference directly', () => {
      const checker = new TypeChecker(ctxt, { x: 'nat' });
      expect(checker.infer(variable('x'))).toBe('nat');
      expect(checker.infer(constr('0'))).toBe('nat');
      expect(checker.infer(constr('suc', [variable('x')]))).toBe('nat');
    });

    it('performs strict checking directly', () => {
      const checker = new TypeChecker(ctxt, { x: 'nat' });
      expect(() => checker.check(variable('x'), parseTerm('nat', ctxt))).not.toThrow();
      expect(() => checker.check(constr('suc', [constr('0')]), parseTerm('nat', ctxt))).not.toThrow();
      expect(() => checker.check(variable('x'), parseTerm('natList', ctxt))).toThrow();
    });
  });

  describe('Logical Context Parser and Printer (Linear & Intuitionistic)', () => {
    it('parses and prints Context correctly (roundtrip)', () => {
      const src = [
        'type nat = 0 | suc(n: nat);',
        'type natList = cons(h: nat, t: natList) | nil;',
        'type tree = leaf | node(left: tree, right: tree, val: nat);',
      ].join('\n');

      const ctxt = parseContext(src);

      // Check that parsed context is well-formed and has correct types
      expect(ctxt.types['nat']).toBeDefined();
      expect(ctxt.types['natList']).toBeDefined();
      expect(ctxt.types['tree']).toBeDefined();

      // Check specific constructor definitions with non-prefixed args
      const cons = (ctxt.types['natList'] as DisjunctionDef).constructors['cons'];
      expect(cons.argOrder).toEqual(['h', 't']);
      expect(cons.arguments).toEqual({
        h: { kind: TermKind.Literal, literalName: 'nat', unNamedArgs: [], namedArgs: {} },
        t: { kind: TermKind.Literal, literalName: 'natList', unNamedArgs: [], namedArgs: {} },
      });

      const node = (ctxt.types['tree'] as DisjunctionDef).constructors['node'];
      expect(node.argOrder).toEqual(['left', 'right', 'val']);
      expect(node.arguments).toEqual({
        left: { kind: TermKind.Literal, literalName: 'tree', unNamedArgs: [], namedArgs: {} },
        right: { kind: TermKind.Literal, literalName: 'tree', unNamedArgs: [], namedArgs: {} },
        val: { kind: TermKind.Literal, literalName: 'nat', unNamedArgs: [], namedArgs: {} },
      });

      // Print back and compare (Note: printed output types are sorted alphabetically by typeName and constructorName)
      const printed = printContext(ctxt);
      const expectedPrinted = [
        'type nat = 0 | suc(n: nat);',
        'type natList = cons(h: nat, t: natList) | nil;',
        'type tree = leaf | node(left: tree, right: tree, val: nat);',
      ].join('\n');
      expect(printed).toBe(expectedPrinted);

      // Roundtrip: parse printed again and ensure equality
      const ctxt2 = parseContext(printed);
      expect(ctxt2).toEqual(ctxt);
    });

    it('handles unified syntax with type definitions, term definitions, and linear variables', () => {
      const src = [
        'type nat = 0 | suc(n: nat);',
        'let 2 = suc(suc(0));',
        '_x: 2;',
      ].join('\n');

      const ctxt = parseContext(src);

      // Check type definitions
      expect(ctxt.types['nat']).toBeDefined();

      // Check term definitions / shortcuts
      expect(ctxt.termDefinitions['2']).toBeDefined();
      expect(ctxt.termDefinitions['2'].typ).toBe('nat');

      // Check variables
      expect(ctxt.linearResources['_x']).toBe('2');

      // Verify getBaseType resolution
      expect(getBaseType(ctxt, '2')).toBe('nat');
      expect(getBaseType(ctxt, 'nat')).toBe('nat');

      // Check roundtrip printing
      const printed = printContext(ctxt);
      expect(printed).toBe(src);
    });

    it('parses and prints Terms correctly (roundtrip)', () => {
      const ctxtSrc = [
        'type nat = 0 | suc(n: nat);',
        'type natList = nil | cons(h: nat, t: natList);',
        'type tree = leaf | node(left: tree, val: nat, right: tree);',
      ].join('\n');
      const ctxt = parseContext(ctxtSrc);

      const testCases = [
        { termSrc: '0', printed: '0' },
        { termSrc: 'suc(0)', printed: 'suc(0)' },
        { termSrc: 'suc(suc(0))', printed: 'suc(suc(0))' },
        { termSrc: 'cons(suc(0), nil)', printed: 'cons(suc(0), nil)' },
        { termSrc: 'node{ left = leaf, val = suc(0), right = leaf }', printed: 'node{ left = leaf, val = suc(0), right = leaf }' },
        { termSrc: '?x', printed: '?x' }, // variable
        { termSrc: 'cons(suc(?x), nil)', printed: 'cons(suc(?x), nil)' }, // variable & nested
        { termSrc: 'node{ left = ?left, val = suc(?v), right = ?right }', printed: 'node{ ?left, val = suc(?v), ?right }' }, // verbose input, concise output
        { termSrc: 'node{ ?left, val = suc(?v), ?right }', printed: 'node{ ?left, val = suc(?v), ?right }' }, // concise input, concise output
      ];

      for (const tc of testCases) {
        const parsed = parseTerm(tc.termSrc, ctxt);
        const printed = printTerm(parsed);
        expect(printed).toBe(tc.printed);

        // Parse again and ensure they are identical Terms
        const parsed2 = parseTerm(printed, ctxt);
        expect(parsed2).toEqual(parsed);
      }
    });

    it('prints verbose terms when requested', () => {
      const ctxtSrc = [
        'type nat = 0 | suc(n: nat);',
        'type tree = leaf | node(left: tree, val: nat, right: tree);',
      ].join('\n');
      const ctxt = parseContext(ctxtSrc);

      const term = parseTerm('node{ ?left, val = suc(?v), ?right }', ctxt);

      // Concise is default
      expect(printTerm(term)).toBe('node{ ?left, val = suc(?v), ?right }');

      // Verbose option
      expect(printTerm(term, { verbose: true })).toBe('node{ left = ?left, val = suc(?v), right = ?right }');
    });

    it('parses, typechecks, and prints parameterised types and implicitly introduces free type variables', () => {
      const src = [
        "type list<'x> = cons(h: 'x, t: list<'x>) | nil;",
        '_l: list<?y>;',
      ].join('\n');

      const ctxt = parseContext(src);

      // Verify roundtrip printing (which includes the implicitly introduced ?y: *)
      const printed = printContext(ctxt);
      const expectedPrinted = [
        "type list<'x> = cons(h: 'x, t: list<'x>) | nil;",
        '_l: list<?y>;',
        '?y: *;',
      ].join('\n');
      expect(printed).toBe(expectedPrinted);

      // Verify type definitions
      expect(ctxt.types['list']).toBeDefined();
      const listDef = ctxt.types['list'] as BindingDef;
      expect(listDef.paramOrder).toEqual(["'x"]);
      expect(listDef.params).toEqual({ "'x": constr('*') });

      const disj = listDef.boundType as DisjunctionDef;
      // Verify h and t constructors are defined with generic Term-based type references
      const cons = disj.constructors['cons'];
      expect(cons.arguments['h']).toEqual({ kind: TermKind.Literal, literalName: "'x", unNamedArgs: [], namedArgs: {} });

      // cons t argument is list<'x> represented as a ConstrTerm
      expect(cons.arguments['t']).toEqual({
        kind: TermKind.Literal,
        literalName: 'list',
        unNamedArgs: [{ kind: TermKind.Literal, literalName: "'x", unNamedArgs: [], namedArgs: {} }],
        namedArgs: {},
      });

      // Check that ?y was implicitly introduced as a variable of type *!
      expect(ctxt.variables['y']).toEqual(constr('*'));

      // Check that ?l was declared with type list(?y)
      expect(ctxt.linearResources['_l']).toBe('list<?y>');

      // Verify typeCheck of parameterised terms:
      // cons(suc(0), nil) should typeCheck against list(nat)!
      const natCtxtSrc = 'type nat = 0 | suc(n: nat);';
      const fullCtxt = parseContext(natCtxtSrc, ctxt);

      const term = parseTerm('cons(suc(0), nil)', fullCtxt);
      expect(() => typeCheck(fullCtxt, term, 'list(nat)')).not.toThrow();

      // typeCheck cons(suc(0), nil) against list(natList) should fail because of h (suc(0) has type nat, not natList)!
      expect(() => typeCheck(fullCtxt, term, 'list(natList)')).toThrowError(
        /Type mismatch/
      );

      // Verify print of full context containing 'nat'
      const fullPrinted = printContext(fullCtxt);
      const expectedFullPrinted = [
        "type list<'x> = cons(h: 'x, t: list<'x>) | nil;",
        'type nat = 0 | suc(n: nat);',
        '_l: list<?y>;',
        '?y: *;',
      ].join('\n');
      expect(fullPrinted).toBe(expectedFullPrinted);
    });

    it('validates programmatic record naming and prevents sum/constructor literal clashes', () => {
      const ctxt = parseContext([
        "type list<'x> = cons(h: 'x, t: list<'x>) | nil;",
      ].join('\n'));

      // 1. Assert programmatic record product names for constructors
      const listDef = ctxt.getRawData().types['list'];
      const disj = (listDef.kind === 'Binding' ? listDef.boundType : listDef) as DisjunctionDef;
      expect(disj.constructors['cons'].productTypeName).toBe('list_cons');
      expect(disj.constructors['nil'].productTypeName).toBe('list_nil');

      // 2. Assert constructor literals registered directly in context
      expect(ctxt.getRawData().constructors['cons']).toBeDefined();
      expect(ctxt.getRawData().constructors['nil']).toBeDefined();

      // 3. Check sum type clash: attempting to define 'list' again throws
      const duplicateSum = [
        "type list<'a> = empty | cons2(h: 'a, t: list<'a>);"
      ].join('\n');
      expect(() => parseContext(duplicateSum, ctxt)).toThrowError(
        /Type literal 'list' already defined in the context/
      );

      // 4. Check constructor literal clash: defining another type with clashing constructor name 'nil' throws
      const duplicateConstr = [
        "type natList = nil | cons2(h: nat, t: natList);"
      ].join('\n');
      expect(() => parseContext(duplicateConstr, ctxt)).toThrowError(
        /Constructor literal 'nil' already defined in the context/
      );
    });

    it('parses, prints, and reduces intuitionistic functions and solves equations', () => {
      const src = [
        'type nat = 0 | suc(n: nat);',
        'fun add(suc(?x), ?y) = suc(add(?x, ?y)) | fun add(0, ?y) = ?y;',
      ].join('\n');

      const ctxt = parseContext(src);

      // 1. Assert printContext outputs the functions correctly
      const printed = printContext(ctxt);
      expect(printed).toContain('fun add(suc(?x), ?y) = suc(add(?x, ?y)) | fun add(0, ?y) = ?y;');

      // 2. Evaluate term add(suc(0), suc(0))
      // Should reduce to suc(suc(0)) (which is 2)
      const testTerm = parseTerm('add(suc(0), suc(0))', ctxt);
      const reduced = evaluateTerm(ctxt, testTerm);
      expect(printTerm(reduced)).toBe('suc(suc(0))');

      // 3. Solve equation add(suc(0), suc(0)) = ?x
      // Should conclude ?x is suc(suc(0))!
      const eqTerm = parseTerm('= (add(suc(0), suc(0)), ?x)', ctxt);
      const solutions = solveEquation(ctxt, eqTerm);
      expect(solutions['x']).toBeDefined();
      expect(printTerm(solutions['x'])).toBe('suc(suc(0))');
    });

    it('throws on invalid syntax', () => {
      expect(() => parseContext('type nat = ;')).toThrow();
      expect(() => parseTerm('cons(0, nil', new Set(['cons', 'nil', '0']))).toThrow();
    });
  });

  describe('set-theoretic subtyping / union types', () => {
    it('parses nested/sub-union type definitions and matches types correctly', () => {
      const src = [
        'type animal = cat | monkey | elephant;',
        'type inanimate = flower | rock | tree;',
        'type item = animal | inanimate;',
      ].join('\n');

      const ctxt = parseContext(src);

      // cat is an animal
      expect(() => typeCheck(ctxt, parseTerm('cat', ctxt), 'animal')).not.toThrow();
      // cat is also an item
      expect(() => typeCheck(ctxt, parseTerm('cat', ctxt), 'item')).not.toThrow();
      // flower is an inanimate
      expect(() => typeCheck(ctxt, parseTerm('flower', ctxt), 'inanimate')).not.toThrow();
      // flower is also an item
      expect(() => typeCheck(ctxt, parseTerm('flower', ctxt), 'item')).not.toThrow();

      // flower is not an animal
      expect(() => typeCheck(ctxt, parseTerm('flower', ctxt), 'animal')).toThrow();
    });

    it('throws error if sub-unions are defined cyclically without a base case', () => {
      const src = [
        'type B = BConstr(toA: A);',
        'type A = B;',
      ].join('\n');

      expect(() => parseContext(src)).toThrowError(
        /have no base case/
      );
    });

    it('throws error if concrete constructor term does not match the union type', () => {
      const src = [
        'type animal = cat | monkey | elephant;',
        'type inanimate = flower | rock | tree;',
        'type item = animal | inanimate;',
        'type box = makeBox(content: animal);',
      ].join('\n');

      const ctxt = parseContext(src);

      // Passing inanimate (rock) to makeBox which expects animal should fail
      expect(() => typeCheck(ctxt, parseTerm('makeBox(rock)', ctxt), 'box')).toThrowError(
        /Type mismatch/
      );
    });
  });

  describe('escaped TS/JS values and operations', () => {
    class TSVal extends EscapedValue {
      constructor(public val: number | string, public op?: string, public left?: TSVal, public right?: TSVal) {
        super();
      }

      toString(): string {
        if (this.op && this.left && this.right) {
          return `${this.left.toString()}_${this.op}_${this.right.toString()}`;
        }
        return String(this.val);
      }

      equals(other: EscapedValue): boolean {
        if (!(other instanceof TSVal)) return false;
        if (this.op !== other.op) return false;
        if (this.op) {
          return this.left!.equals(other.left!) && this.right!.equals(other.right!);
        }
        return this.val === other.val;
      }
    }

    const zero: ConjunctionData = {
      constructorName: '0',
      createdTypeName: 'nat',
      arguments: {},
    };
    const ctxt = createContext([zero]);

    it('supports escaped terms wrapping TS values and checks equality', () => {
      const t1 = escaped(new TSVal(42));
      const t2 = escaped(new TSVal(42));
      const t3 = escaped(new TSVal(7));

      expect(printTerm(t1)).toBe('42');
      expect(typeCheck(ctxt, t1, t2)).toBeUndefined(); // matches since values are equal
      expect(() => typeCheck(ctxt, t1, t3)).toThrowError(/Type mismatch/);
    });

    it('unifies escaped terms and handles variables', () => {
      const formal = variable('x');
      const actual = escaped(new TSVal(42));
      const subst: { [name: string]: Term } = {};

      unify(ctxt, formal, actual, subst);
      expect(subst['x']).toEqual(actual);
    });

    it('handles composite TS operations and nested matching', () => {
      const num1 = new TSVal(10);
      const num2 = new TSVal(20);
      const op = escaped(new TSVal('', 'plus', num1, num2));

      expect(printTerm(op)).toBe('10_plus_20');

      const opSame = escaped(new TSVal('', 'plus', num1, num2));
      const opDiff = escaped(new TSVal('', 'plus', num1, new TSVal(99)));

      expect(() => typeCheck(ctxt, op, opSame)).not.toThrow();
      expect(() => typeCheck(ctxt, op, opDiff)).toThrow();
    });

    it('supports pure TS functions and evaluates them correctly', () => {
      const tsCtxt = Context.empty();
      // Define a TS function "double" that doubles a Peano number (represented as numeric Escaped TS value)
      tsCtxt.defineTSFunction('double', (unNamedArgs) => {
        const arg = unNamedArgs[0];
        if (arg && arg.kind === TermKind.Escaped && arg.value instanceof TSVal) {
          return escaped(new TSVal((arg.value.val as number) * 2));
        }
        return arg;
      });

      const term = constr('double', [escaped(new TSVal(21))]);
      const res = evaluateTerm(tsCtxt, term);
      expect(printTerm(res)).toBe('42');
    });

    it('supports custom parsing of type multiplication and checks equality', () => {
      const parserCtxt = Context.empty();

      // Define MultiplicationType
      class MultVal extends EscapedValue {
        static override readonly parserFactory = (termParser: any, simpleTermParser: any) => {
          return seq(
            simpleTermParser,
            tokenOf('symbol', ['*']),
            termParser
          ).map(([left, _, right]) => escaped(new MultVal(left as Term, right as Term)));
        };

        constructor(public left: Term, public right: Term) {
          super();
        }
        toString() {
          return `${printTerm(this.left)}*${printTerm(this.right)}`;
        }
        equals(other: EscapedValue): boolean {
          if (!(other instanceof MultVal)) return false;
          // Value comparison or modulo equivalence
          return matchTypes(parserCtxt, this.left, other.left) && matchTypes(parserCtxt, this.right, other.right);
        }
      }

      // Register the escape kind directly to Context
      parserCtxt.registerEscapeKind(MultVal);

      const parsed = parseTerm('nat * list(nat)', parserCtxt);
      expect(parsed.kind).toBe(TermKind.Escaped);
      expect((parsed as any).value).toBeInstanceOf(MultVal);
      expect(printTerm(parsed)).toBe('nat*list(nat)');

      const parsed2 = parseTerm('nat * list(nat)', parserCtxt);
      expect(() => typeCheck(parserCtxt, parsed, parsed2)).not.toThrow();

      const parsedDiff = parseTerm('nat * nat', parserCtxt);
      expect(() => typeCheck(parserCtxt, parsed, parsedDiff)).toThrow();
    });
  });
});
