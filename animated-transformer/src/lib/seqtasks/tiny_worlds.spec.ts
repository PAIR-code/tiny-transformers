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
import {
  TinyWorldTask,
  TinyWorldTaskConfig,
  nextRelDistr,
} from './tiny_worlds';
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

  // Ideas for fancier rules/variants
  //
  // If a monkey just jumped over something, they are not so likely to jump again right away.
  // '[... jumps-over _x _y ...:3] ==> jumps-over _x _y *= 0.1',
  //
  // Let actions/observations have names too.
  // '_e: (tries_to_jumps_over _x:monkey _y) ==> succeeds(_e) += 1',
  //
  // Should types be observations?, e.g. could we write:
  // '_x:cat ==> runs-away _x += 1'
  // i.e. that would be the same as: 'is _x cat ==> runs-away _x += 1'
  //
  // Should we allow an unbound syntax?
  // 'jumps-over monkey _y += 5' === 'jumps-over _x:monkey _y += 5' ?
  // Maybe this is just syntax, so we skip it? Or maybe this somehow says that one
  // *cannot* bind to the monkey, i.e. is says there was an unknown monkey who jumped over _y?

  it('true', () => {
    const rules = [
      // Monkeys jump over stuff a lot
      'S(jumps-over ?x:monkey ?y) += 5',
      // Monkeys might squish flowers
      'S(squishes ?x ?y | jumps-over ?x:monkey ?y:flower) += 2',
      // Monkeys might squish cats, but less likley
      'S(squishes ?x ?y | jumps-over ?x:monkey ?y:cat) += 1',
      // cats jump over stuff
      'S(jumps-over ?x:cat ?y) += 2',
      // cats only very occationally squish flowers
      'S(squishes ?x ?y | jumps-over ?x:cat ?y:flower) += 1',
      // Elephants never jump over animals
      'S(jumps-over ?x:elephant ?y:animal) *= 0',
      // Cats sometimes run away when jumped over
      'S(runs-away ?y | jumps-over ?x ?y:cat)  += 2',
      // Squished animals can't run away anymore
      'S(runs-away ?y | squishes ?x ?y:animal) *= 0',
      // Animals that ran away can't get squished, be jumped over, or jump-over.
      'S(squishes ?x ?y | runs-away ?y:animal) *= 0',
      'S(jumps-over ?x ?y | runs-away ?y:animal) *= 0',
      'S(jumps-over ?x ?y | runs-away ?x:animal) *= 0',
    ].map((r) => parseRule<TypeNames, VarNames, RelNames>(r));

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

    const distr = nextRelDistr(rules, c);
    console.log(distr);

    expect(true).toEqual(true);
  });
});
