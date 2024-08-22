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

/* Tiny Worlds */

import { addBetweenEvery, BasicLmTask, BasicRandSeededTaskConfig, Example } from './util';
import { FreshNames } from '../names/simple_fresh_names';
import { Story, initStory, sampleNextRel } from '../logic/stories';
import { RandomState, RandomStream, makeRandomStream } from '../state-iter/random';
import { StateIter } from '../state-iter/state-iter';
import { parseRule, Rule } from '../logic/rules';
import {
  parseRel,
  Relation,
  TypeHierarchySpec,
  initRelationMap,
  initTypeDef,
  typesetEquality,
  universalType,
} from '../logic/relations';

// Ideas for fancier rules/variants
//
// If a monkey just jumped over something, they are not so likely to jump again right away.
// '[... jumpsOver _x _y ...:3] ==> jumpsOver _x _y *= 0.1',
//
// Let actions/observations have names too.
// '_e: (tries_to_jumps_over _x:monkey _y) ==> succeeds(_e) += 1',
//
// Should types be observations?, e.g. could we write:
// '_x:cat ==> runsAway _x += 1'
// i.e. that would be the same as: 'is _x cat ==> runsAway _x += 1'
//
// Should we allow an unbound syntax?
// 'jumpsOver monkey _y += 5' === 'jumpsOver _x:monkey _y += 5' ?
// Maybe this is just syntax, so we skip it? Or maybe this somehow says that one
// *cannot* bind to the monkey, i.e. is says there was an unknown monkey who jumped over _y?

// ============================================================================== //
//  Tiny World Task Configs
// ============================================================================== //

export interface TinyWorldTaskConfig extends BasicRandSeededTaskConfig {
  typeHierarchy: TypeHierarchySpec;
  relationKinds: { [relName: string]: string[] };
  // List of string representations of relations
  baseStory: string[];
  rules: string[];
  maxEntityLimit: number;
}

/* 
besyian world (version 1) 
tests if some zero-order and first order info could be correctly captured.
*/
export const bayesianV1TinyWorldTaskConfig: TinyWorldTaskConfig = {
  name: 'beysian (version 1) world. ',
  seed: 42,
  maxInputLen: 10,
  maxOutputLen: 10,
  typeHierarchy: {
    t0: ['i0', 'i1'],
  },
  relationKinds: {
    is: [''],
  },
  baseStory: [],
  rules: ['S(is ?x:i0) += 1', 'S(is ?x:i1) += 2'],
  maxEntityLimit: 6,
};

export const defaultTinyWorldTaskConfig: TinyWorldTaskConfig = {
  name: 'tiny synthetic world',
  seed: 0,
  maxInputLen: 10,
  maxOutputLen: 10,
  typeHierarchy: {
    animal: ['cat', 'monkey', 'elephant'],
    inanimate: ['rock', 'tree', 'flower'],
    squishable: ['cat', 'monkey', 'flower'],
  },
  relationKinds: {
    is: [universalType],
    runsAway: ['animal'],
    squishes: ['animal', 'squishable'],
    jumps: ['animal'],
  },
  baseStory: [],
  rules: [
    // TODO: We might want type-variables, save us from enumerating rules
    // for all of these...
    //
    // We might mention any new kind kind of thing (at any level of abstraction!)
    'S(is ?x:cat) += 1',
    'S(is ?x:monkey) += 2', // But stories of monkeys are the best and most common
    'S(is ?x:elephant) += 1',
    'S(is ?x:rock) += 1',
    'S(is ?x:tree) += 1',
    'S(is ?x:flower) += 1',
    'S(is ?x:animal) += 1',
    'S(is ?x:inanimate) += 1',
    'S(is ?x:squishable) += 1',
    'S(is ?x | is ?y) *= 0.5',

    // A mentioned animal might jump
    'S(jumps ?x | is ?x:animal) += 5',
    'S(jumps ?x | jumps ?x) += 0.2',

    // When they jump, monkeys and cats sometimes squish things, but monkeys more often
    //
    // TODO: we've like to express that you can squish one thing per jump.
    'S(squishes ?x ?y | jumps ?x:monkey, is ?y) += 2',
    'S(squishes ?x ?y | jumps ?x:cat, is ?y) += 1',
    'S(squishes ?x ?x | is ?x) *= 0',

    // Cats sometimes run away away when elephants jump
    'S(runsAway ?c | jumps ?e:elephant, is ?c:cat) += 2',
    // Any existing animal might run away at any time
    'S(runsAway ?x | is ?x) += 1',
    // A new never mentioned animal might run away
    'S(runsAway ?x) += 1',

    // We might note that an animal that ran away is a cat (if we didn't say it before)
    //
    // TODO: I'd like to be able to quantify over the type... e.g. but that means
    // implicitly defining a distinution over types, which I guess would be some kind of equal split?
    // And also, how do you manage many level of specificity? t?<..<animal and t?<=..<=animal
    //   'S(is ?x:?t<animal | runsAway ?x, -is ?x:?t) += 1',
    'S(is ?x:cat | runsAway ?x, -is ?x) += 1',

    // When an animal runs away, it can't squish anything, jump or run-away again.
    // NOTE: We could also use negative conditions on the positive action...
    //
    // TODO: below is a nice example of why we should use linear
    // types for conditions, not depend on past statements
    // (like we do below)... linear types could saves us from the frame problem!
    'S(jumps ?a | runsAway ?a:animal) *= 0',
    'S(squishes ?x ?a | runsAway ?a) *= 0',
    'S(runsAway ?x | runsAway ?x) *= 0',
    // Squished animals can't run away or jump anymore
    'S(runsAway ?y | squishes ?x ?y) *= 0',
    'S(jumps ?y | squishes ?x ?y) *= 0',
  ],
  maxEntityLimit: 6,
};

export const spaceSepToken = ' ';
export const relSepToken = ', ';
export const typeIsToken = ':';
export const typeOrToken = '|';
export type SepToken = typeof relSepToken;
export type VarName = `_${string}` | `?${string}`;
export type TypeName = string;
export type RelName = string;

// ============================================================================== //
//  Tiny World Task Configs
// ============================================================================== //

export class TinyWorldTask implements BasicLmTask {
  public initStory: Story<TypeName, VarName, RelName>;
  public rules: Rule<TypeName, VarName, RelName>[];
  public baseVocab: string[];
  private exampleId: number;
  public exampleIter: StateIter<RandomStream, Example>;
  public rns: RandomStream;

  constructor(public config: TinyWorldTaskConfig) {
    this.exampleId = 0;

    const typeDef = initTypeDef(this.config.typeHierarchy);
    const allTypes = [...typeDef.decendent.keys()];
    const relationMap = initRelationMap(this.config.relationKinds);

    const freshNames = new FreshNames();
    const varNames: string[] = [];
    for (let i = 0; i < this.config.maxEntityLimit; i++) {
      const n = freshNames.makeAndAddNextName();
      varNames.push(n);
    }

    this.baseVocab = [
      relSepToken,
      typeIsToken,
      typeOrToken,
      ...relationMap.keys(),
      ...allTypes,
      ...varNames,
    ];

    this.initStory = initStory(typeDef, relationMap);
    this.initStory.extendScene(this.config.baseStory.map((r) => parseRel(r)));

    this.rules = this.config.rules.map((rStr) => parseRule(rStr));

    this.rns = makeRandomStream(config.seed);

    this.exampleIter = new StateIter(this.rns, (rns) => this.examplesGen(rns));
  }

  nextRelTokens(
    prevStory: Story<TypeName, VarName, RelName>,
    curStory: Story<TypeName, VarName, RelName>,
    rel: Relation<TypeName, VarName, RelName>
  ) {
    const args = rel.args.flatMap((r, i) => {
      const prevStoryType = prevStory.varTypes.get(r.varName) || new Set();
      // skip outputing the type when not needed.
      if (
        r.varTypes.has(universalType) || // skip universal types always.
        // Skip is the type already existed and has not changed
        (prevStoryType && typesetEquality(curStory.types, prevStoryType, r.varTypes)) ||
        // Skip is it's the same as the relation's default top level type.
        (!prevStoryType &&
          typesetEquality(curStory.types, curStory.relations.get(rel.relName)![i], r.varTypes))
      ) {
        // console.log(`${r.varName} (in story): ${[...curStory.varTypes.get(r.varName)!]}`);
        // console.log(`${r.varName} (in prev story): ${[...prevStoryType]}`);
        // console.log(`${r.varName} (in rel): ${[...curStory.relations.get(rel.relName)![i]]}`);
        return [spaceSepToken, r.varName];
      } else {
        const typeTokens = addBetweenEvery([...r.varTypes].sort(), typeOrToken);
        return [spaceSepToken, r.varName, typeIsToken, ...typeTokens];
      }
    });
    return [rel.relName, ...args];
  }

  addNextRelTokens(maxTokens: number, generatedTokens: string[], extraTokens: string[]) {
    if (generatedTokens.length > 0) {
      generatedTokens.push(relSepToken);
    }
    let nextToken = extraTokens.shift();
    while (generatedTokens.length < maxTokens && nextToken) {
      generatedTokens.push(nextToken);
      nextToken = extraTokens.shift();
    }
  }

  genRandExample(rns: RandomStream): Example {
    const generatedTokens: string[] = [];
    const maxTokens = this.config.maxInputLen + this.config.maxOutputLen;
    let curStory = this.initStory;
    while (generatedTokens.length < maxTokens) {
      // console.log('genRandExample: rns.state.curSeedVal', rns.state.curSeedVal);
      const maybeNextStory = sampleNextRel(rns, curStory, this.rules);
      if (maybeNextStory) {
        const extraTokens = this.nextRelTokens(curStory, maybeNextStory.story, maybeNextStory.rel);
        // console.log('extraTokens', extraTokens.join(' '));
        this.addNextRelTokens(maxTokens, generatedTokens, extraTokens);
        curStory = maybeNextStory.story;
        // console.log('scene', curStory.relSeq);
        // console.log('varTypes', curStory.varTypes);
      } else {
        break;
      }
    }
    return {
      id: this.exampleId++,
      input: generatedTokens.slice(0, this.config.maxInputLen),
      output: generatedTokens.slice(this.config.maxInputLen),
      // secret: [],
    };
  }

  *examplesGen(rng: RandomStream): Iterator<Example> {
    while (true) {
      yield this.genRandExample(rng);
    }
  }
}
