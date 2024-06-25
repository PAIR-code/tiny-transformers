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
import { TinyWorldTask, TinyWorldTaskConfig } from './tiny_worlds';
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
  beforeEach(() => {});

  it('true', () => {
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

    expect(true).toEqual(true);
  });
});
