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

import { TinyWorldTask, TinyWorldTaskConfig, sepToken } from './tiny_worlds';
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
  // If a monkey just jumped over something, they are not so likely to jump again right away.
  // '[... jumps-over _x _y ...:3] ==> jumps-over _x _y *= 0.1',
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

const impactRegexp = new RegExp(
  /\s*(?<rel>\S*)\s*(?<op>(\+\=|\=))\s*(?<val>\S*)\s*/
);
type ImpactMatches = { rel: string; op: '+=' | '='; val: string };

const relRegexp = new RegExp(/\s*(?<relName>\S*)\s+(?<args>(\_\S*\s+)*)/);
type RelMatch = { relName: string; args: string[] };

function parseRel(rel: string) {
  const matches = rel.match(relRegexp);
  return matches;
}

function parseRule(rule: string) {
  const conditionsAndConclusion = rule.split(/\s*\=\=\>\s*/);
  let conditions = undefined;
  let conclusion = undefined;
  if (conditionsAndConclusion.length > 1) {
    [conditions, conclusion] = conditionsAndConclusion;
  } else {
    conclusion = conditionsAndConclusion[0];
  }
  const { rel, op, val } = conclusion.match(impactRegexp)!
    .groups as ImpactMatches;
}

function ruleParser(rules: string[], context: string) {
  const observations = context.split(sepToken);
}

// ('is _x monkey => jumps-over _x _y += 1');
// ('is _x monkey => jumps-over _x rock += 1');
// ('is _x monkey => jumps-over _x flower += 1');
// ('is _x monkey => jumps-over _x tree += 0.1');

// class RVar {
//   constructor(name: string) {}
// }

// const rules = [
//   // some probability is introducing a new object
//   {
//     context: {
//       notPresent: [
//         {
//           relation: 'is',
//           arguments: [{ varbind: 'X' }, { varbind: 'Y' }],
//         },
//       ],
//       present: [],
//     },
//     add: {
//       relation: 'is',
//       arguments: [
//         { kind: 'newObjectName', varbind: 'X' },
//         { kind: 'object', objPostfixMatch: '', varbind: 'Y' },
//       ],
//     },
//     scoreMerge: { addToBaseScore: 1 },
//   },
//   // small probability of repeating an observation
//   {
//     context: {
//       notPresent: [],
//       present: [
//         {
//           relation: 'is',
//           arguments: [{ varbind: 'X' }, { varbind: 'Y' }],
//         },
//       ],
//     },
//     add: {
//       relation: 'is',
//       arguments: [
//         { kind: 'object', objPostfixMatch: '', varbind: 'X' },
//         { kind: 'object', objPostfixMatch: '', varbind: 'Y' },
//       ],
//     },
//     scoreMerge: { addToBaseScore: 0.1 },
//   },
// ];

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

describe('tiny_world_task', () => {
  beforeEach(() => {});

  it('genRandExample: DecisionBoundaryTask', () => {
    const rel = parseRel('squishes _x _y:animal');
    console.log(rel);
    expect(rel).not.toBeNull();

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
  });
});
