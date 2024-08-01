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

import * as tf from '@tensorflow/tfjs';
import { BasicLmTask, BasicRandSeededTaskConfig, Example } from './util';
import { FreshNames } from '../names/simple_fresh_names';
import {
  addToTypeMap,
  applyRules,
  Context,
  nextRelDistrStats,
  parseRel,
  parseRule,
  Relation,
  RelRuleApps,
  Rule,
  RuleApp,
  sampleNextRel,
  stringifyRelation,
  TypeHierarchy,
} from '../logic/generative_logic';
import { SimpleJsTreesLib } from '../js_tree/js_tree';
import {
  RandomState,
  RandomStream,
  makeRandomStream,
} from '../state-iter/random';
import { StateIter } from '../state-iter/state-iter';

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

// ============================================================================== //
//  Tiny World Task Configs
// ============================================================================== //

export interface TinyWorldTaskConfig extends BasicRandSeededTaskConfig {
  typeHierarchy: TypeHierarchy;
  relationKinds: { [relName: string]: string[] };
  baseContext: string[];
  rules: string[];
  maxEntityLimit: number;
}

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
    is: [''],
    runsAway: ['animal'],
    squishes: ['animal', 'squishable'],
    jumps: ['animal'],
  },
  baseContext: [],
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
    //   'S(is ?x:?t<animal | runs-away ?x, -is ?x:?t) += 1',
    'S(is ?x:cat | runsAway ?x, -is ?x) += 1',

    // When an animal runs away, it can't squish anything, jump or run-away again.
    // NOTE: We could also use negative conditions on the positive action...
    //
    // TODO: below is a nice example of why we should use linear
    // types for conditions, not depend on past statements
    // (like we do below)... linear types could saves us from the frame problem!
    'S(jumps ?a | runsAway ?a:animal) *= 0',
    'S(squishes ?x ?a | runsAway ?a:animal) *= 0',
    'S(runsAway ?x ? a | runsAway ?x) *= 0',
    // Squished animals can't run away or jump anymore
    'S(runsAway ?y | squishes ?x ?y:animal) *= 0',
    'S(jumps ?y | squishes ?x ?y:animal) *= 0',
  ],
  maxEntityLimit: 6,
};

export const spaceSepToken = ' ';
export const relSepToken = ', ';
export const typeIsToken = ':';
export type SepToken = typeof relSepToken;
type VarNames = `_${string}` | `?${string}`;
function isUnboundVarName(v: string): boolean {
  // console.log(v, v[0] === '?');
  return v[0] === '?';
}
type TypeNames = string;
type RelNames = string;

// ============================================================================== //
//  Tiny World Task Configs
// ============================================================================== //

export class TinyWorldTask implements BasicLmTask {
  public initContext: Context<TypeNames, VarNames, RelNames>;
  public rules: Rule<TypeNames, VarNames, RelNames>[];
  public baseVocab: string[];
  private exampleId: number;
  public exampleIter: StateIter<RandomStream, Example>;
  public rns: RandomStream;

  constructor(public config: TinyWorldTaskConfig) {
    this.exampleId = 0;

    const typeMap = new Map<string, Set<string>>();
    const allTypes = addToTypeMap(this.config.typeHierarchy, typeMap);
    typeMap.set('', allTypes);

    const relationMap = new Map<string, string[]>();
    Object.keys(this.config.relationKinds).forEach((r) => {
      relationMap.set(r, this.config.relationKinds[r]);
    });

    const freshNames = new FreshNames();
    const varNames: string[] = [];
    for (let i = 0; i < this.config.maxEntityLimit; i++) {
      const n = freshNames.makeAndAddNextName();
      varNames.push(n);
    }

    this.baseVocab = [
      relSepToken,
      typeIsToken,
      ...Object.keys(relationMap),
      ...allTypes,
      ...varNames,
    ];

    this.initContext = new Context(
      typeMap,
      relationMap,
      new FreshNames(),
      new Map<VarNames, TypeNames>(),
      isUnboundVarName
    );
    this.initContext.extendScene(
      this.config.baseContext.map((r) => parseRel(r))
    );

    this.rules = this.config.rules.map((rStr) => parseRule(rStr));

    this.rns = makeRandomStream(config.seed);

    this.exampleIter = new StateIter(this.rns, (rns) => this.examplesGen(rns));
  }

  genRandExample(rng: RandomStream): Example {
    const generatedTokens: string[] = [];
    const totalTokens = this.config.maxInputLen + this.config.maxOutputLen;
    let curContext = this.initContext;
    while (generatedTokens.length < totalTokens) {
      const maybeNextContext = sampleNextRel(rng, curContext, this.rules);
      if (maybeNextContext) {
        if (generatedTokens.length > 0) {
          generatedTokens.push(relSepToken);
        }
        const rel = maybeNextContext.rel;
        const args = rel.args.flatMap((r) =>
          r.varType === '' || curContext.varTypes.get(r.varName) === r.varType
            ? [spaceSepToken, r.varName]
            : [spaceSepToken, r.varName, typeIsToken, r.varType]
        );
        curContext = maybeNextContext.context;
        const extraTokens = [rel.relName, ...args];
        let nextToken = extraTokens.shift();
        while (generatedTokens.length < totalTokens && nextToken) {
          generatedTokens.push(nextToken);
          nextToken = extraTokens.shift();
        }
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
