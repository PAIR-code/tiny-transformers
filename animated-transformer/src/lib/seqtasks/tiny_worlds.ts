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
import {
  BasicLmTask,
  BasicRandSeededTaskConfig,
  Example,
  randOfList,
  RandomStream,
} from './util';
import { FreshNames } from '../names/simple_fresh_names';
import { Context, Rule, stringifyRelation } from '../logic/generative_logic';

// ============================================================================== //
//  Tiny World Task Configs
// ============================================================================== //

export const sepToken = ', ';
export type SepToken = typeof sepToken;
export const sepVocab: SepToken[] = [sepToken];

export interface TinyWorldTaskConfig<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
> extends BasicRandSeededTaskConfig {
  context: Context<TypeNames, VarNames, RelNames>;
  rules: Rule<TypeNames, VarNames, RelNames>[];
}

// try to unify two relations

// ============================================================================== //
//  Tiny Worlds Task
// ============================================================================== //

type RuleApp<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
> = {
  rule: Rule<TypeNames, VarNames, RelNames>;
  context: Context<TypeNames, VarNames, RelNames>;
};

type RuleScore = {
  sum: number;
  mult: number;
};

export class TinyWorldTask<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
> implements BasicLmTask
{
  // TODO: consider doing programatically in the constructor?
  public name: string;
  public baseVocab: string[];
  public random: RandomStream;
  private exampleId = 0;

  constructor(
    public config: TinyWorldTaskConfig<TypeNames, VarNames, RelNames>
  ) {
    this.name = config.name;
    this.random = new RandomStream(config.seed);

    this.baseVocab = [
      ...sepVocab,
      ...config.context.types.keys(),
      ...config.context.relations.keys(),
    ];
  }

  nextRelDistr() {
    const nextRels = new Map<
      string, // string version of the new relation.
      RuleApp<TypeNames, VarNames, RelNames>[]
    >();

    // All possible matchings.
    this.config.rules.forEach((r) => {
      const c = this.config.context;
      c.matchRule(r).map((m) => {
        const c2 = c.applyRuleMatch(m);
        const newRel = c2.context[c2.context.length - 1];
        const newRelStr = stringifyRelation(newRel);
        const prevRuleApps = nextRels.get(newRelStr) || [];
        prevRuleApps.push({ context: c2, rule: r });
        nextRels.set(newRelStr, prevRuleApps);
      });
    });

    // Sum scores of all rule application that result in the same
    // new added relation.
    const finalDistr = new Map<string, number>();
    const initRuleScore: RuleScore = { sum: 0, mult: 1 };
    nextRels.forEach((value, relStrKey) => {
      const finalCalc = value.reduce<RuleScore>(
        (scoreCalc: RuleScore, ruleApp) => {
          let newMult = scoreCalc.mult;
          let newSum = scoreCalc.sum;
          if (ruleApp.rule.op === '*=') {
            newMult = scoreCalc.mult * ruleApp.rule.score;
          }
          if (ruleApp.rule.op === '+=') {
            newSum = scoreCalc.sum + ruleApp.rule.score;
          }
          return { sum: newSum, mult: newMult };
        },
        initRuleScore
      );

      // return the final string distribution.
      finalDistr.set(relStrKey, finalCalc.sum * finalCalc.mult);
    });

    return finalDistr;
  }

  genRandExample(): Example {
    // const context = [...this.config.baseContext];
    // const bindings = {};

    // // The secret token
    // const secretToken = randOfList(this.random, this.config.objectTokens);
    // // console.log('secretToken:', secretToken);

    // // Create random tokens such that we don't go over the max length:
    // // Each random token, t, will be followed by tokenToBoolFn(secretToken, t)
    // const numberOfRandomTokens = Math.floor((this.config.maxInputLen + 1) / 2);
    // const randomTokenIds = tf
    //   .randomUniform(
    //     [numberOfRandomTokens],
    //     0,
    //     this.config.objectTokens.length,
    //     'int32',
    //     this.random.random()
    //   )
    //   .arraySync() as number[];

    // const finalId = randomTokenIds.pop();
    // if (finalId === undefined) {
    //   throw new Error(`no input Id. maxInputLen: ${this.config.maxInputLen}`);
    // }

    // const input = randomTokenIds
    //   .map((i) => {
    //     const thisToken = this.config.objectTokens[i];
    //     return [
    //       thisToken,
    //       this.tokenToBoolFn(secretToken, thisToken) ? 'T' : 'F',
    //     ];
    //   })
    //   .flat();
    // const finalToken = this.config.objectTokens[finalId];
    // input.push(finalToken);

    // const target = [this.tokenToBoolFn(secretToken, finalToken) ? 'T' : 'F'];

    return {
      id: this.exampleId++,
      input: ['a', 'b'],
      output: ['a', 'b'],
      secret: ['secretToken'],
    };
  }

  *makeExamplesGenerator(): Generator<Example, undefined, undefined> {
    while (true) {
      yield this.genRandExample();
    }
  }
}
