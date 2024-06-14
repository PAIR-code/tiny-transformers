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
  Context,
  Relation,
  TinyWorldTask,
  TinyWorldTaskConfig,
  UnifyState,
  parseRel,
  parseRule,
  sepToken,
} from './tiny_worlds';
import { Example } from './util';

const exampleRelations = ['is', 'jumps-over', 'runs-away', 'squishes'];
type ExampleRelations = (typeof exampleRelations)[number];

// TODO: can we skip individual instances, e.g. c0, c1, etc, and just have the kinds?
// (instances being defined in the context?)
const exampleObjects = [
  //   'c0:cat:animal',
  //   'c1:cat:animal',
  //   'c2:cat:animal',
  //   'm0:monkey:animal',
  //   'm1:monkey:animal',
  //   'm2:monkey:animal',
  //   'e0:elephant:animal',
  //   'e1:elephant:animal',
  //   'e2:elephant:animal',
  'animal',
  'cat.animal',
  'monkey.animal',
  'elephant.animal',
  //   't0:tree:thing',
  //   't1:tree:thing',
  //   't2:tree:thing',
  //   'r0:rock:thing',
  //   'r1:rock:thing',
  //   'r2:rock:thing',
  //   'f0:flower:thing',
  //   'f1:flower:thing',
  //   'f2:flower:thing',
  'thing',
  'flower.thing',
  'rock.thing',
  'tree.thing',
  '', // the type of all objects, everything ends with an empty string;
] as const;

type ExampleObjects = (typeof exampleObjects)[number];

const relArgs = new Map<ExampleRelations, ExampleObjects[]>([
  ['is', ['', '']],
  ['jumps-over', ['animal', '']],
  ['runs-away', ['animal']],
  ['squishes', ['animal', '']],
]);

const rules = [
  // Monkeys jump over stuff a lot
  'jumps-over _x:monkey _y += 5',
  // Monkeys might squish flowers
  'jumps-over _x:monkey _y:flower ==> squishes _x _y += 1',
  // Monkeys might squish cats
  'jumps-over _x:monkey _y:cat ==> squishes _x _y += 0.5',
  // cats jump over stuff
  'jumps-over _x:cat _y += 1',
  // cats very occationally squish flowers
  'jumps-over _x:cat _y:flower ==> squishes _x _y += 0.1',
  // Elephants occationally jump over animals
  'jumps-over _x:elephant _y:animal += 0.1',
  // Cats sometimes run away when jumped over
  'jumps-over _x _y:cat ==> runs-away _y += 1',
  // Squished animals can't run away anymore
  'squishes _x _y:animal ==> runs-away _y = 0',
  // Animals that can away can't get squished or be jumped over.
  'runs-away _y:animal ==> squishes _x _y = 0',
  'runs-away _y:animal ==> jumps-over _x _y = 0',
];
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

fdescribe('tiny_world_task', () => {
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
    const { rel, op, score, conditions } = parseRule(
      'squishes _x _y:animal += 1'
    );
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0].varName).toEqual('_x');
    expect(rel.args[0].varType).toEqual('');
    expect(rel.args[1].varName).toEqual('_y');
    expect(rel.args[1].varType).toEqual('animal');
    expect(op).toEqual('+=');
    expect(score).toEqual(1.0);
    expect(conditions).toEqual([]);
  });

  it('parseRule: one conditions', () => {
    const { rel, op, score, conditions } = parseRule(
      'jumps-over _x:monkey _y:flower ==> squishes _x _y += 1'
    );
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

  it('parseRule: 3 conditions', () => {
    const { rel, op, score, conditions } = parseRule(`
    jumps-over _x _y,
    jumps-over _x _y,
    jumps-over _x _y,
    ==> squishes _x _y = 0
    `);
    expect(rel.relName).toEqual('squishes');
    expect(rel.args[0]).toEqual({ varName: '_x', varType: '' });
    expect(rel.args[1]).toEqual({ varName: '_y', varType: '' });
    expect(op).toEqual('=');
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

  fit('unification & contexts', () => {
    // "& {}" is a trick to get typescript errors to use the type name instead
    // of the full list of underlying union of string literals.
    type VarNames = `_${string}` | `?${string}`;

    const animalTypes = ['cat', 'monkey', 'elephant'] as const;
    const inanimateTypes = ['flower', 'rock', 'tree'] as const;
    const allTypes = [
      'animal',
      ...animalTypes,
      'inanimate',
      ...inanimateTypes,
      'squishable',
      '*',
    ] as const;
    // "& {}" is a trick to get typescript errors to use the type name instead
    // of the full list of underlying union of string literals.
    type TypeNames = (typeof allTypes)[number] & {};

    const types = new Map<TypeNames, Set<TypeNames>>();
    types.set('*', new Set(allTypes));
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
    type RelationNames = (typeof allRelations)[number] & {};

    const relations = new Map<RelationNames, TypeNames[]>();
    relations.set('jumps-over', ['animal', '*']);
    relations.set('runs-away', ['animal']);
    relations.set('squishes', ['animal', 'squishable']);

    const c = new Context(
      types,
      relations,
      new Map<VarNames, TypeNames>(),
      [] as Relation<TypeNames, VarNames, RelationNames>[]
    );
    const unifyState = c.newUnifyState();
    const unifyFailed = c.unify(
      {
        relName: 'squishes',
        args: [
          { varName: '?x', varType: '*' },
          { varName: '?y', varType: '*' },
        ],
      },
      {
        relName: 'squishes',
        args: [
          { varName: '_a', varType: 'cat' },
          { varName: '_b', varType: '*' },
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

  // it('genRandExample: DecisionBoundaryTask', () => {
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
  // const task = new TinyWorldTask(example_TinyWorldTaskConfig);

  // let example: Example;
  // example = task.genRandExample();

  // expect(example.secret).toEqual(['2']);
  // expect(example.input).toEqual(['5', 'F', '4', 'F', '3']);
  // expect(example.output).toEqual(['F']);

  // example = task.genRandExample();
  // expect(example.secret).toEqual(['2']);
  // expect(example.input).toEqual(['3', 'F', '2', 'T', '1']);
  // expect(example.output).toEqual(['T']);

  // example = task.genRandExample();
  // expect(example.secret).toEqual(['3']);
  // expect(example.input).toEqual(['3', 'T', '3', 'T', '4']);
  // expect(example.output).toEqual(['F']);

  // example = task.genRandExample();
  // expect(example.secret).toEqual(['4']);
  // expect(example.input).toEqual(['1', 'T', '3', 'T', '4']);
  // expect(example.output).toEqual(['T']);

  // example = task.genRandExample();
  // expect(example.secret).toEqual(['3']);
  // expect(example.input).toEqual(['1', 'T', '4', 'F', '5']);
  // expect(example.output).toEqual(['F']);
  // });
});
