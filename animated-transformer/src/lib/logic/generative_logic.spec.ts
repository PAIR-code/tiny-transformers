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
import {
  Context,
  Relation,
  UnifyState,
  applyRules,
  nextRelDistrStats,
  parseRel,
  parseRule,
  stringifyRule,
} from './generative_logic';

// const example_TinyWorldTaskConfig: TinyWorldTaskConfig<
//   ExampleObjects,
//   ExampleRelations
// > = {
//   name: 'example-tiny-world',
//   maxInputLen: 20,
//   maxOutputLen: 10,
//   seed: 0,
//   objectTokens: [...exampleObjects],
//   relationTokenArgs: relArgs,
// };

describe('generative_logic', () => {
  // "& {}" is a trick to get typescript errors to use the type name instead
  // of the full list of underlying union of string literals.
  type VarNames = `_${string}` | `?${string}`;
  function isUnboundVarName(v: string): boolean {
    // console.log(v, v[0] === '?');
    return v[0] === '?';
  }

  const animalTypes = ['cat', 'monkey', 'elephant'] as const;
  const inanimateTypes = ['flower', 'rock', 'tree'] as const;
  const allTypes = [
    'animal',
    ...animalTypes,
    'inanimate',
    ...inanimateTypes,
    'squishable',
    '', // unspecified type
  ] as const;
  // "& {}" is a trick to get typescript errors to use the type name instead
  // of the full list of underlying union of string literals.
  type TypeNames = (typeof allTypes)[number] & {};

  const types = new Map<TypeNames, Set<TypeNames>>();
  types.set('', new Set(allTypes));
  types.set('animal', new Set(animalTypes));
  types.set('inanimate', new Set(inanimateTypes));
  types.set('squishable', new Set([...animalTypes, 'flower', 'tree']));
  allTypes.forEach((t) => {
    if (!types.get(t)) {
      types.set(t, new Set());
    }
  });

  const allRelations = ['jumps-over', 'runs-away', 'squishes', 'is'] as const;
  // "& {}" is a trick to get typescript errors to use the type name instead
  // of the full list of underlying union of string literals.
  type RelNames = (typeof allRelations)[number] & {};

  const relations = new Map<RelNames, TypeNames[]>();
  relations.set('jumps-over', ['animal', '']);
  relations.set('runs-away', ['animal']);
  relations.set('is', ['']);
  relations.set('squishes', ['animal', 'squishable']);

  beforeEach(() => {});

  it('parseRel', () => {
    const { relName, args } = parseRel('squishes _x _y:animal');
    expect(relName).toEqual('squishes');
    expect(args[0].varName).toEqual('_x');
    expect(args[0].varType).toEqual('');
    expect(args[1].varName).toEqual('_y');
    expect(args[1].varType).toEqual('animal');
  });

  it('parseRule: no conditions', () => {
    const {
      rel,
      op,
      score,
      posConditions: conditions,
    } = parseRule('S(squishes _x _y:animal) += 1');
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0].varName).toEqual('_x');
    expect(rel.args[0].varType).toEqual(''); // unspecified
    expect(rel.args[1].varName).toEqual('_y');
    expect(rel.args[1].varType).toEqual('animal');
    expect(op).toEqual('+=');
    expect(score).toEqual(1.0);
    expect(conditions).toEqual([]);
  });

  it('parseRule: one condition', () => {
    const {
      rel,
      op,
      score,
      posConditions: conditions,
    } = parseRule('S(squishes _x _y | jumps-over _x:monkey _y:flower) += 1');
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0].varName).toEqual('_x');
    expect(rel.args[0].varType).toEqual('');
    expect(rel.args[1].varName).toEqual('_y');
    expect(rel.args[1].varType).toEqual('');
    expect(op).toEqual('+=');
    expect(score).toEqual(1.0);
    expect(conditions.length).toEqual(1);
    expect(conditions[0].relName).toEqual('jumps-over');
    expect(conditions[0].args[0]).toEqual({ varName: '_x', varType: 'monkey' });
    expect(conditions[0].args[1]).toEqual({ varName: '_y', varType: 'flower' });
  });

  it('parseRule: one condition, no types', () => {
    const {
      rel,
      op,
      score,
      posConditions: conditions,
    } = parseRule('S(squishes ?x ?y | jumps-over ?x ?y) += 1');
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0].varName).toEqual('?x');
    expect(rel.args[0].varType).toEqual('');
    expect(rel.args[1].varName).toEqual('?y');
    expect(rel.args[1].varType).toEqual('');
    expect(op).toEqual('+=');
    expect(score).toEqual(1.0);
    expect(conditions.length).toEqual(1);
    expect(conditions[0].relName).toEqual('jumps-over');
    expect(conditions[0].args[0]).toEqual({ varName: '?x', varType: '' });
    expect(conditions[0].args[1]).toEqual({ varName: '?y', varType: '' });
  });

  // TODO: maybe no varType can mean any time, and we can skip the explicit type of all types?
  it('parseRule: 3 conditions', () => {
    const {
      rel,
      op,
      score,
      posConditions: conditions,
    } = parseRule(`
    S(squishes _x _y 
    | jumps-over _x _y, jumps-over _x _y, jumps-over _x _y) *= 0
    `);
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0]).toEqual({ varName: '_x', varType: '' });
    expect(rel.args[1]).toEqual({ varName: '_y', varType: '' });
    expect(op).toEqual('*=');
    expect(score).toEqual(0);
    expect(conditions.length).toEqual(3);
    expect(conditions[0].relName).toEqual('jumps-over');
    expect(conditions[0].args[0]).toEqual({ varName: '_x', varType: '' });
    expect(conditions[0].args[1]).toEqual({ varName: '_y', varType: '' });
    expect(conditions[1].relName).toEqual('jumps-over');
    expect(conditions[1].args[0]).toEqual({ varName: '_x', varType: '' });
    expect(conditions[1].args[1]).toEqual({ varName: '_y', varType: '' });
    expect(conditions[2].relName).toEqual('jumps-over');
    expect(conditions[2].args[0]).toEqual({ varName: '_x', varType: '' });
    expect(conditions[2].args[1]).toEqual({ varName: '_y', varType: '' });
  });

  // TODO: maybe no varType can mean any time, and we can skip the explicit type of all types?
  it('parseRule: 3 conditions and one neg', () => {
    const { rel, op, score, posConditions, negConditions } = parseRule(`
    S(squishes _x _y 
    | jumps-over _x _y, jumps-over _x _y, -is _y, jumps-over _x _y) *= 0
    `);
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0]).toEqual({ varName: '_x', varType: '' });
    expect(rel.args[1]).toEqual({ varName: '_y', varType: '' });
    expect(op).toEqual('*=');
    expect(score).toEqual(0);
    expect(posConditions.length).toEqual(3);
    expect(posConditions[0].relName).toEqual('jumps-over');
    expect(posConditions[0].args[0]).toEqual({ varName: '_x', varType: '' });
    expect(posConditions[0].args[1]).toEqual({ varName: '_y', varType: '' });
    expect(posConditions[1].relName).toEqual('jumps-over');
    expect(posConditions[1].args[0]).toEqual({ varName: '_x', varType: '' });
    expect(posConditions[1].args[1]).toEqual({ varName: '_y', varType: '' });
    expect(posConditions[2].relName).toEqual('jumps-over');
    expect(posConditions[2].args[0]).toEqual({ varName: '_x', varType: '' });
    expect(posConditions[2].args[1]).toEqual({ varName: '_y', varType: '' });
    expect(negConditions.length).toEqual(1);
    expect(negConditions[0].relName).toEqual('is');
    expect(negConditions[0].args[0]).toEqual({ varName: '_y', varType: '' });
  });

  // TODO: maybe no varType can mean any time, and we can skip the explicit type of all types?
  it('print and parseRule symmetry', () => {
    const initRuleStr = `S(squishes _x _y | jumps-over _x _y, jumps-over _x _y, jumps-over _x _y) *= 0`;
    const rule = parseRule(initRuleStr);
    const parsedRuleStr = stringifyRule(rule);
    expect(parsedRuleStr).toEqual(initRuleStr);
  });

  it('Context with relations', () => {
    const rel = parseRel<TypeNames, VarNames, RelNames>(
      'jumps-over _m:monkey _f:flower'
    );
    const c: Context<TypeNames, VarNames, RelNames> = new Context(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      [rel],
      isUnboundVarName
    );
    expect(c.names.config.usedNameSet).toContain('_m');
    expect(c.names.config.usedNameSet).toContain('_f');
    expect(c.varTypes.get('_m')).toEqual('monkey');
    expect(c.varTypes.get('_f')).toEqual('flower');
  });

  it('Context creation fails, context clash', () => {
    const rel2 = parseRel<TypeNames, VarNames, RelNames>(
      'jumps-over _m:rock _f:flower'
    );
    expect(function () {
      const c = new Context(
        types,
        relations,
        new FreshNames(),
        new Map<VarNames, TypeNames>(),
        [rel2],
        isUnboundVarName
      );
      // console.log(c);
    }).toThrowError(''); // Assert
  });

  it('Context.unify', () => {
    const c = new Context(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      [] as Relation<TypeNames, VarNames, RelNames>[],
      isUnboundVarName
    );
    const unifyState = c.newUnifyState();
    const unifyFailed = c.unify(
      {
        relName: 'squishes',
        args: [
          { varName: '?x', varType: '' },
          { varName: '?y', varType: '' },
        ],
      },
      {
        relName: 'squishes',
        args: [
          { varName: '_a', varType: 'cat' },
          { varName: '_b', varType: '' },
        ],
      },
      unifyState
    );

    expect(unifyFailed).toEqual(null);
    const varSubsts = unifyState.varSubsts;
    expect(varSubsts.get('?x')).toEqual('_a');
    expect(varSubsts.get('?y')).toEqual('_b');
    const varTypes = unifyState.varTypes;
    expect(varTypes.get('?x')).toEqual('cat');
    expect(varTypes.get('?y')).toEqual('squishable');
    expect(varTypes.get('_a')).toEqual('cat');
    expect(varTypes.get('_b')).toEqual('squishable');
  });

  it('matchRule: simple match', () => {
    const rule = parseRule<TypeNames, VarNames, RelNames>(`
      S(squishes ?x ?y | jumps-over ?x ?y) *= 1
    `);
    const rel = parseRel<TypeNames, VarNames, RelNames>(
      'jumps-over _m:monkey _f:flower'
    );
    const c: Context<TypeNames, VarNames, RelNames> = new Context(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      [rel],
      isUnboundVarName
    );
    const ruleMatches = c.matchRule(rule);
    expect(ruleMatches.length).toEqual(1);
  });

  it('matchRule: no match', () => {
    const rule = parseRule<TypeNames, VarNames, RelNames>(`
      S(squishes ?x ?y | jumps-over ?x ?y) *= 1
    `);
    const rel = parseRel<TypeNames, VarNames, RelNames>(
      'squishes _m:monkey _f:flower'
    );
    const c: Context<TypeNames, VarNames, RelNames> = new Context(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      [rel],
      isUnboundVarName
    );
    const ruleMatches = c.matchRule(rule);
    expect(ruleMatches.length).toEqual(0);
  });

  it('matchRule: simple match', () => {
    const rule = parseRule<TypeNames, VarNames, RelNames>(`
      S(squishes ?x ?y | jumps-over ?x ?y) *= 1
    `);
    const rel = parseRel<TypeNames, VarNames, RelNames>(
      'jumps-over _m:monkey _f:flower'
    );
    const c: Context<TypeNames, VarNames, RelNames> = new Context(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      [rel],
      isUnboundVarName
    );
    const ruleMatches = c.matchRule(rule);
    expect(ruleMatches.length).toEqual(1);
  });

  it('applyRuleMatch: simple match', () => {
    const rule = parseRule<TypeNames, VarNames, RelNames>(`
      S(squishes ?x ?y | jumps-over ?x ?y) *= 1
    `);
    const rel = parseRel<TypeNames, VarNames, RelNames>(
      'jumps-over _m:monkey _f:flower'
    );
    const c: Context<TypeNames, VarNames, RelNames> = new Context(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      [rel],
      isUnboundVarName
    );
    const ruleMatches = c.matchRule(rule);
    const c2 = c.applyRuleMatch(ruleMatches[0]);
    expect(c2.scene.length).toEqual(2);
    expect(c2.scene[1].relName).toEqual('squishes');
    expect(c2.scene[1].args[0].varName).toEqual('_m');
    expect(c2.scene[1].args[0].varType).toEqual('monkey');
    expect(c2.scene[1].args[1].varName).toEqual('_f');
    expect(c2.scene[1].args[1].varType).toEqual('flower');
  });

  it('applyRuleMatch: new vars', () => {
    const rule = parseRule<TypeNames, VarNames, RelNames>(`
      S(squishes ?x ?z | jumps-over ?x ?y) *= 1
    `);
    const rel = parseRel<TypeNames, VarNames, RelNames>(
      'jumps-over _m:monkey _f:flower'
    );
    const c: Context<TypeNames, VarNames, RelNames> = new Context(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      [rel],
      isUnboundVarName
    );

    const ruleMatches = c.matchRule(rule);
    const c2 = c.applyRuleMatch(ruleMatches[0]);
    expect(c2.scene.length).toEqual(2);
    expect(c2.scene[1].relName).toEqual('squishes');
    expect(c2.scene[1].args[0].varName).toEqual('_m');
    expect(c2.scene[1].args[0].varType).toEqual('monkey');
    expect(c2.scene[1].args[1].varName).toEqual('_a');
    expect(c2.scene[1].args[1].varType).toEqual('squishable');
  });

  it('Minimal rule distribution calculation: additive only', () => {
    const rule1 = 'S(squishes ?x ?y | jumps-over ?x:animal ?y:flower) += 1';
    const rule2 = 'S(squishes ?x ?y | jumps-over ?x:monkey ?y:flower) += 5';
    const rules = [rule1, rule2].map((r) =>
      parseRule<TypeNames, VarNames, RelNames>(r)
    );

    const context = [
      'jumps-over _m:monkey _f:flower',
      'jumps-over _c:cat _f:flower',
    ].map((s) => parseRel<TypeNames, VarNames, RelNames>(s));

    const c: Context<TypeNames, VarNames, RelNames> = new Context(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      context,
      isUnboundVarName
    );

    const nextRelPossibilities = nextRelDistrStats(applyRules(rules, c));
    expect([...nextRelPossibilities.keys()].length).toEqual(2);

    expect(
      nextRelPossibilities.get('squishes _m:monkey _f:flower')?.totalScore
    ).toEqual(6);
    expect(
      nextRelPossibilities.get('squishes _m:monkey _f:flower')?.prob
    ).toEqual(6 / 7);
    expect(
      nextRelPossibilities.get('squishes _c:cat _f:flower')?.totalScore
    ).toEqual(1);
    expect(nextRelPossibilities.get('squishes _c:cat _f:flower')?.prob).toEqual(
      1 / 7
    );
  });

  it('Minimal rule distribution calculation: additive and multiplicative', () => {
    const rule1 = 'S(squishes ?x ?y | jumps-over ?x ?y) += 1';
    const rule2 = 'S(squishes ?x ?y | jumps-over ?x:cat ?y:flower) *= 0';
    const rules = [rule1, rule2].map((r) =>
      parseRule<TypeNames, VarNames, RelNames>(r)
    );

    const context = [
      'jumps-over _m:monkey _f:flower',
      'jumps-over _c:cat _f:flower',
    ].map((s) => parseRel<TypeNames, VarNames, RelNames>(s));

    const c: Context<TypeNames, VarNames, RelNames> = new Context(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      context,
      isUnboundVarName
    );

    const nextRelPossibilities = nextRelDistrStats(applyRules(rules, c));
    // console.log(
    //   'nextRelEval',
    //   JSON.stringify([...nextRelPossibilities], null, 2)
    // );

    expect([...nextRelPossibilities.keys()].length).toEqual(2);
    expect(
      nextRelPossibilities.get('squishes _m:monkey _f:flower')?.totalScore
    ).toEqual(1);
    expect(
      nextRelPossibilities.get('squishes _m:monkey _f:flower')?.prob
    ).toEqual(1);
    expect(
      nextRelPossibilities.get('squishes _c:cat _f:flower')?.totalScore
    ).toEqual(0);
    expect(nextRelPossibilities.get('squishes _c:cat _f:flower')?.prob).toEqual(
      0
    );
  });

  it('Negative rules & nothing else to be said', () => {
    const rule1 = 'S(is ?x:cat | runs-away ?x, -is ?x:cat) += 1';
    const rules = [rule1].map((r) =>
      parseRule<TypeNames, VarNames, RelNames>(r)
    );

    const context = ['runs-away _c:cat'].map((s) =>
      parseRel<TypeNames, VarNames, RelNames>(s)
    );

    const c: Context<TypeNames, VarNames, RelNames> = new Context(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      context,
      isUnboundVarName
    );

    const ruleApps = applyRules(rules, c);
    expect([...ruleApps.keys()]).toEqual(['is _c:cat']);
    const nextContext = [...ruleApps.values()][0][0].context;
    const newRel = nextContext.scene[1];
    expect(newRel.relName).toEqual('is');
    expect(newRel.args[0].varName).toEqual('_c');
    expect(newRel.args[0].varType).toEqual('cat');

    const ruleApps2 = applyRules(rules, nextContext);
    expect([...ruleApps2.keys()]).toEqual([]);
  });
});
