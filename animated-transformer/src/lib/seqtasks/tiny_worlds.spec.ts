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

import { Context, parseRel, parseRule } from '../logic/generative_logic';
import { FreshNames } from '../names/simple_fresh_names';
import { TinyWorldTask, TinyWorldTaskConfig, nextRelEval } from './tiny_worlds';
import { Example } from './util';

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

describe('tiny_worlds', () => {
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

  const allRelations = ['jumps-over', 'runs-away', 'squishes'] as const;
  // "& {}" is a trick to get typescript errors to use the type name instead
  // of the full list of underlying union of string literals.
  type RelNames = (typeof allRelations)[number] & {};

  const relations = new Map<RelNames, TypeNames[]>();
  relations.set('jumps-over', ['animal', '']);
  relations.set('runs-away', ['animal']);
  relations.set('squishes', ['animal', 'squishable']);

  beforeEach(() => {});

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

    const nextRelPossibilities = nextRelEval(rules, c);
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

    const nextRelPossibilities = nextRelEval(rules, c);
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

  // it('true', () => {
  //   const rules = [
  //     // Monkeys jump over stuff a lot
  //     'S(jumps-over ?x:monkey ?y) += 5',
  //     // Monkeys might squish flowers
  //     'S(squishes ?x ?y | jumps-over ?x:monkey ?y:flower) += 2',
  //     // Monkeys might squish cats, but less likley
  //     'S(squishes ?x ?y | jumps-over ?x:monkey ?y:cat) += 1',
  //     // cats jump over stuff
  //     'S(jumps-over ?x:cat ?y) += 2',
  //     // cats only very occationally squish flowers
  //     'S(squishes ?x ?y | jumps-over ?x:cat ?y:flower) += 1',
  //     // Elephants never jump over animals
  //     'S(jumps-over ?x:elephant ?y:animal) *= 0',
  //     // Cats sometimes run away when jumped over
  //     'S(runs-away ?y | jumps-over ?x ?y:cat)  += 2',
  //     // Squished animals can't run away anymore
  //     'S(runs-away ?y | squishes ?x ?y:animal) *= 0',
  //     // Animals that ran away can't get squished, be jumped over, or jump-over.
  //     'S(squishes ?x ?y | runs-away ?y:animal) *= 0',
  //     'S(jumps-over ?x ?y | runs-away ?y:animal) *= 0',
  //     'S(jumps-over ?x ?y | runs-away ?x:animal) *= 0',
  //   ].map((r) => parseRule<TypeNames, VarNames, RelNames>(r));

  //   const rel = parseRel<TypeNames, VarNames, RelNames>(
  //     'jumps-over _m:monkey _f:flower'
  //   );

  //   const c: Context<TypeNames, VarNames, RelNames> = new Context(
  //     types,
  //     relations,
  //     new FreshNames(),
  //     new Map<VarNames, TypeNames>(),
  //     [rel],
  //     isUnboundVarName
  //   );

  //   const distr = nextRelDistr(rules, c);
  //   console.log(JSON.stringify(distr, null, 2));

  //   expect(true).toEqual(true);
  // });
});
