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
  Story,
  VarNames,
  applyRules,
  initStory,
  isUnboundVarName,
  nextRelDistrStats,
} from './stories';
import {
  parseRel,
  initTypeDef,
  initRelationMap,
  universalType,
  TypeDef,
  flattenType,
} from './relations';
import { parseRule } from './rules';
import { stringifyUnifyState } from './unif_state';

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

describe('stories', () => {
  const animalTypes = ['cat', 'monkey', 'elephant'] as const;
  const inanimateTypes = ['flower', 'rock', 'tree'] as const;
  const allTypes = [
    'animal',
    ...animalTypes,
    'inanimate',
    ...inanimateTypes,
    'squishable',
    universalType, // unspecified type
  ] as const;
  // "& {}" is a trick to get typescript errors to use the type name instead
  // of the full list of underlying union of string literals.
  type TypeName = (typeof allTypes)[number] & {};

  const types = initTypeDef({
    animal: [...animalTypes],
    inanimate: [...inanimateTypes],
    squishable: ['cat', 'monkey', 'flower'],
  }) as TypeDef<TypeName>;

  const allRelations = ['jumpsOver', 'runsAway', 'squishes', 'is'] as const;
  // "& {}" is a trick to get typescript errors to use the type name instead
  // of the full list of underlying union of string literals.
  type RelName = (typeof allRelations)[number] & {};

  const relations = initRelationMap<RelName, TypeName>({
    jumpsOver: ['animal', universalType],
    runsAway: ['animal'],
    is: [universalType],
    squishes: ['animal', 'squishable'],
  });

  beforeEach(() => {});

  it('Story with relations', () => {
    const rel = parseRel<TypeName, VarNames, RelName>('jumpsOver _m:monkey _f:flower');
    const s = initStory(types, relations);
    s.extendScene([rel]);
    expect(s.names.config.usedNameSet).toContain('_m');
    expect(s.names.config.usedNameSet).toContain('_f');
    expect(s.varTypes.get('_m')).toEqual(new Set(['monkey']));
    expect(s.varTypes.get('_f')).toEqual(new Set(['flower']));
  });

  it('Story creation fails, story clash', () => {
    const rel2 = parseRel<TypeName, VarNames, RelName>('jumpsOver _m:rock _f:flower');
    expect(function () {
      const s = initStory(types, relations);
      s.extendScene([rel2]);
      // console.log(c);
    }).toThrowError(''); // Assert
  });

  it('Story.unify', () => {
    const s = initStory(types, relations);
    const unifyState = s.newUnifyState();
    const unifyFailed = s.unify(
      {
        relName: 'squishes',
        args: [
          { varName: '?x', varTypes: new Set([universalType]) },
          { varName: '?y', varTypes: new Set([universalType]) },
        ],
      },
      {
        relName: 'squishes',
        args: [
          { varName: '_a', varTypes: new Set(['cat']) },
          { varName: '_b', varTypes: new Set([universalType]) },
        ],
      },
      unifyState
    );
    expect(unifyFailed).toEqual(null);
    const varSubsts = unifyState.varSubsts;
    expect(varSubsts.get('?x')).toEqual('_a');
    expect(varSubsts.get('?y')).toEqual('_b');
    const varTypes = unifyState.varTypes;
    expect(varTypes.get('?x')).toEqual(flattenType(types, 'cat'));
    expect(varTypes.get('?y')).toEqual(flattenType(types, 'squishable'));
    expect(varTypes.get('_a')).toEqual(flattenType(types, 'cat'));
    expect(varTypes.get('_b')).toEqual(flattenType(types, 'squishable'));
  });

  it('matchRule: simple match with a more general type in the rule', () => {
    const rule = parseRule<TypeName, VarNames, RelName>(`
      S(squishes ?x ?y | jumpsOver ?x:animal ?y) *= 1
    `);
    const rel = parseRel<TypeName, VarNames, RelName>('jumpsOver _m:monkey _f:flower');
    const s = initStory(types, relations);
    s.extendScene([rel]);
    const ruleMatches = s.matchRule(rule);
    expect(ruleMatches.length).toEqual(1);
  });

  it('matchRule: simple match', () => {
    const rule = parseRule<TypeName, VarNames, RelName>(`
      S(squishes ?x ?y | jumpsOver ?x ?y) *= 1
    `);
    const rel = parseRel<TypeName, VarNames, RelName>('jumpsOver _m:monkey _f:flower');
    const s = initStory(types, relations);
    s.extendScene([rel]);
    const ruleMatches = s.matchRule(rule);
    expect(ruleMatches.length).toEqual(1);
  });

  it('matchRule: no match', () => {
    const rule = parseRule<TypeName, VarNames, RelName>(`
      S(squishes ?x ?y | jumpsOver ?x ?y) *= 1
    `);
    const rel = parseRel<TypeName, VarNames, RelName>('squishes _m:monkey _f:flower');
    const s = initStory(types, relations);
    s.extendScene([rel]);
    const ruleMatches = s.matchRule(rule);
    expect(ruleMatches.length).toEqual(0);
  });

  it('matchRule: simple match', () => {
    const rule = parseRule<TypeName, VarNames, RelName>(`
      S(squishes ?x ?y | jumpsOver ?x ?y) *= 1
    `);
    const rel = parseRel<TypeName, VarNames, RelName>('jumpsOver _m:monkey _f:flower');
    const s = initStory(types, relations);
    s.extendScene([rel]);
    const ruleMatches = s.matchRule(rule);
    expect(ruleMatches.length).toEqual(1);
  });

  it('applyRuleMatch: simple match', () => {
    const rule = parseRule<TypeName, VarNames, RelName>(`
      S(squishes ?x ?y | jumpsOver ?x ?y) *= 1
    `);
    const rel = parseRel<TypeName, VarNames, RelName>('jumpsOver _m:monkey _f:flower');
    const s: Story<TypeName, VarNames, RelName> = new Story(
      types,
      relations,
      new FreshNames(),
      new Map<VarNames, Set<TypeName>>(),
      isUnboundVarName
    );
    s.extendScene([rel]);
    const ruleMatches = s.matchRule(rule);
    const s2 = s.applyRuleMatch(ruleMatches[0]);
    expect(s2.relSeq.length).toEqual(2);
    expect(s2.relSeq[1].relName).toEqual('squishes');
    expect(s2.relSeq[1].args[0].varName).toEqual('_m');
    expect(s2.relSeq[1].args[0].varTypes).toEqual(new Set(['monkey']));
    expect(s2.relSeq[1].args[1].varName).toEqual('_f');
    expect(s2.relSeq[1].args[1].varTypes).toEqual(new Set(['flower']));
  });

  it('matchRule: bad new real: no such relation', () => {
    const rule = parseRule<TypeName, VarNames, RelName>(`
      S(foosquishes ?x ?y | jumpsOver ?x ?y) *= 1
    `);
    const rel = parseRel<TypeName, VarNames, RelName>('jumpsOver _m:monkey _f:flower');
    const s = initStory(types, relations);
    s.extendScene([rel]);
    expect(() => {
      s.matchRule(rule);
    }).toThrowError('UnifyFailure:relNameMissingFromStory');
    // expect(ruleMatches.length).toEqual(1);
  });

  it('matchRule: bad new real: wrong arg count', () => {
    const rule = parseRule<TypeName, VarNames, RelName>(`
      S(squishes ?x v y | jumpsOver ?x ?y) *= 1
    `);
    const rel = parseRel<TypeName, VarNames, RelName>('jumpsOver _m:monkey _f:flower');
    const s = initStory(types, relations);
    s.extendScene([rel]);
    expect(() => {
      s.matchRule(rule);
    }).toThrowError('UnifyFailure:relNameStoryArityMismatch');
    // expect(ruleMatches.length).toEqual(1);
  });

  it('matchRule and applyRuleMatch: new var introduced, no conditions', () => {
    const rule = parseRule<TypeName, VarNames, RelName>(`
      S(is ?x) *= 1
    `);
    const rel = parseRel<TypeName, VarNames, RelName>('is _a:monkey');
    const s = initStory(types, relations);
    s.extendScene([rel]);
    const ruleMatches = s.matchRule(rule);
    expect(ruleMatches.length).toEqual(1);
    const s2 = s.applyRuleMatch(ruleMatches[0]);
    expect(s2.relSeq.length).toEqual(2);
    expect(s2.relSeq[1].relName).toEqual('is');
    expect(s2.relSeq[1].args[0].varName).toEqual('_b');
    expect(s2.relSeq[1].args[0].varTypes).toEqual(flattenType(types, universalType));
  });

  it('applyRuleMatch: new vars', () => {
    const rule = parseRule<TypeName, VarNames, RelName>(`
      S(squishes ?x ?z | jumpsOver ?x ?y) *= 1
    `);
    const rel = parseRel<TypeName, VarNames, RelName>('jumpsOver _m:monkey _f:flower');
    const s = initStory(types, relations);
    s.extendScene([rel]);

    const ruleMatches = s.matchRule(rule);
    const c2 = s.applyRuleMatch(ruleMatches[0]);
    expect(c2.relSeq.length).toEqual(2);
    expect(c2.relSeq[1].relName).toEqual('squishes');
    expect(c2.relSeq[1].args[0].varName).toEqual('_m');
    expect(c2.relSeq[1].args[0].varTypes).toEqual(flattenType(types, 'monkey'));
    expect(c2.relSeq[1].args[1].varName).toEqual('_a');
    expect(c2.relSeq[1].args[1].varTypes).toEqual(flattenType(types, 'squishable'));
  });

  it('Minimal rule distribution calculation: additive only', () => {
    const rule1 = 'S(squishes ?x ?y | jumpsOver ?x:animal ?y:flower) += 1';
    const rule2 = 'S(squishes ?x ?y | jumpsOver ?x:monkey ?y:flower) += 5';
    const rules = [rule1, rule2].map((r) => parseRule<TypeName, VarNames, RelName>(r));

    const scene = ['jumpsOver _m:monkey _f:flower', 'jumpsOver _c:cat _f:flower'].map((s) =>
      parseRel<TypeName, VarNames, RelName>(s)
    );

    const s = initStory(types, relations);
    s.extendScene(scene);

    const nextRelPossibilities = nextRelDistrStats(applyRules(rules, s));
    expect([...nextRelPossibilities.keys()].length).toEqual(2);

    expect(nextRelPossibilities.get('squishes _m:monkey _f:flower')?.totalScore).toEqual(6);
    expect(nextRelPossibilities.get('squishes _m:monkey _f:flower')?.prob).toEqual(6 / 7);
    expect(nextRelPossibilities.get('squishes _c:cat _f:flower')?.totalScore).toEqual(1);
    expect(nextRelPossibilities.get('squishes _c:cat _f:flower')?.prob).toEqual(1 / 7);
  });

  // it('Rule distribution calculation: additive and multiplicative', () => {
  //   const rule1 = 'S(runsAway ?x | jumpsOver ?x ?y) += 1';
  //   const rule2 = 'S(runsAway ?x | jumpsOver ?y ?x) *= 0';
  //   const rule3 = 'S(runsAway ?x | runsAway ?x) *= 0';
  //   const rules = [rule1, rule2, rule3].map((r) =>
  //     parseRule<TypeNames, VarNames, RelNames>(r)
  //   );

  //   const scene = [
  //     'jumpsOver _m:monkey _f:flower',
  //     'jumpsOver _c:cat _f:flower',
  //   ].map((s) => parseRel<TypeNames, VarNames, RelNames>(s));

  //   const s: Story<TypeNames, VarNames, RelNames> = new Story(
  //     types,
  //     relations,
  //     new FreshNames(),
  //     new Map<VarNames, TypeNames>(),
  //     isUnboundVarName
  //   );
  //   s.extendScene(scene);

  //   const nextRelPossibilities = nextRelDistrStats(applyRules(rules, s));

  //   expect([...nextRelPossibilities.keys()].length).toEqual(2);
  //   expect(
  //     nextRelPossibilities.get('squishes _m:monkey _f:flower')?.totalScore
  //   ).toEqual(1);
  //   expect(
  //     nextRelPossibilities.get('squishes _m:monkey _f:flower')?.prob
  //   ).toEqual(1);
  //   expect(
  //     nextRelPossibilities.get('squishes _c:cat _f:flower')?.totalScore
  //   ).toEqual(0);
  //   expect(nextRelPossibilities.get('squishes _c:cat _f:flower')?.prob).toEqual(
  //     0
  //   );
  // });

  it('Minimal rule distribution calculation: additive and multiplicative', () => {
    const rule1 = 'S(squishes ?x ?y | jumpsOver ?x ?y) += 1';
    const rule2 = 'S(squishes ?x ?y | jumpsOver ?x:cat ?y:flower) *= 0';
    const rules = [rule1, rule2].map((r) => parseRule<TypeName, VarNames, RelName>(r));

    const scene = ['jumpsOver _m:monkey _f:flower', 'jumpsOver _c:cat _f:flower'].map((s) =>
      parseRel<TypeName, VarNames, RelName>(s)
    );

    const s = initStory(types, relations);
    s.extendScene(scene);

    const nextRelPossibilities = nextRelDistrStats(applyRules(rules, s));
    // console.log(
    //   'nextRelEval',
    //   JSON.stringify([...nextRelPossibilities], null, 2)
    // );

    expect([...nextRelPossibilities.keys()].length).toEqual(2);
    expect(nextRelPossibilities.get('squishes _m:monkey _f:flower')?.totalScore).toEqual(1);
    expect(nextRelPossibilities.get('squishes _m:monkey _f:flower')?.prob).toEqual(1);
    expect(nextRelPossibilities.get('squishes _c:cat _f:flower')?.totalScore).toEqual(0);
    expect(nextRelPossibilities.get('squishes _c:cat _f:flower')?.prob).toEqual(0);
  });

  it('Negative rules & nothing else to be said', () => {
    const rule1 = 'S(is ?x:cat | runsAway ?x, -is ?x:cat) += 1';
    const rules = [rule1].map((r) => parseRule<TypeName, VarNames, RelName>(r));

    const scene = ['runsAway _c:cat'].map((s) => parseRel<TypeName, VarNames, RelName>(s));

    const s = initStory(types, relations);
    s.extendScene(scene);

    const ruleApps = applyRules(rules, s);
    expect([...ruleApps.keys()]).toEqual(['is _c:cat']);
    const nextStory = [...ruleApps.values()][0][0].story;
    const newRel = nextStory.relSeq[1];
    expect(newRel.relName).toEqual('is');
    expect(newRel.args[0].varName).toEqual('_c');
    expect(newRel.args[0].varTypes).toEqual(new Set(['cat']));

    const ruleApps2 = applyRules(rules, nextStory);
    expect([...ruleApps2.keys()]).toEqual([]);
  });

  it('Making a new example domain using helpers', () => {
    const types = initTypeDef({
      animal: ['cat', 'monkey', 'elephant'],
      inanimate: ['rock', 'tree', 'flower'],
      squishable: ['cat', 'monkey', 'flower'],
    });

    const allRelations2 = ['jumps', 'runsAway', 'squishes', 'is'] as const;
    // "& {}" is a trick to get typescript errors to use the type name instead
    // of the full list of underlying union of string literals.
    type RelName2 = (typeof allRelations2)[number] & {};

    const relationMap = initRelationMap<RelName2, TypeName>({
      is: [universalType],
      runsAway: ['animal'],
      squishes: ['animal', 'squishable'],
      jumps: ['animal'],
    });
    const baseStoryStrs: string[] = ['is _a:cat'];
    const ruleStrs: string[] = [
      'S(is ?x:cat) += 1',
      'S(is ?x | is ?y) *= 0.5',
      'S(jumps ?x | is ?x:animal) += 5',
      'S(squishes ?x ?y | jumps ?x:cat, is ?y) += 1',
    ];

    const story = initStory(types, relationMap);
    const scene = baseStoryStrs.map((rStr) => parseRel<TypeName, VarNames, RelName2>(rStr));
    story.extendScene(scene);
    const rules = ruleStrs.map((rStr) => parseRule<TypeName, VarNames, RelName2>(rStr));
    const matches = story.matchRule(rules[2]);
    expect(matches.length).toBe(1);
  });
});
