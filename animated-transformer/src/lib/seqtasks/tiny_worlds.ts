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

// ============================================================================== //
//  Rule Parser
// ============================================================================== //
const impactRegexp = new RegExp(
  /\s*(?<relString>[^\+\=]*)\s*(?<op>(\+\=|\=))\s*(?<scoreString>\S+)\s*/
);
type RuleOp = '+=' | '=';
type ImpactMatches = { relString: string; op: RuleOp; scoreString: string };
const relRegexp = new RegExp(/\s*(?<relName>\S*)\s+(?<argsString>(\_\S+\s*)*)/);
type RelMatch = { relName: string; argsString: string };

const conditionsSplitRegexp = new RegExp(/\s*,\s*/);

const argsSplitRegexp = new RegExp(/\s+/);
const argumentRegexp = new RegExp(
  /(?<varName>\_[^ \t\r\n\f\:]+)(\:(?<varType>\S+))?/
);
type RelArgument = { varName: string; varType: string };
type Relation = { relName: string; args: RelArgument[] };

type Rule = {
  rel: Relation;
  op: RuleOp;
  score: number;
  conditions: Relation[];
};
// function parseRelArgs(argsString: string): ArgMatch[] {

// }

export function parseRel(relString: string): Relation {
  const match = relString.match(relRegexp)?.groups as RelMatch;
  if (!match) {
    throw new Error(`'${relString}' does not match a relation.`);
  }
  const { relName, argsString } = match;
  const argList = argsString.split(argsSplitRegexp);
  const args = argList
    .map((a) => {
      if (a === '') {
        return null;
      }
      const argMatch = a.match(argumentRegexp)?.groups as RelArgument;
      if (!argMatch) {
        console.warn(`'${a}' does not match the argumentRegexp.`);
        return null;
      }
      if (argMatch.varType === undefined) {
        argMatch.varType = '';
      }
      return argMatch;
    })
    .filter((a) => a !== null) as RelArgument[];
  return { relName, args };
}

export function parseRule(rule: string): Rule {
  const conditionsAndConclusion = rule.split(/\s*\=\=\>\s*/);
  let conditionsStr = undefined;
  let conclusionStr = undefined;
  let conditions: Relation[] = [];
  if (conditionsAndConclusion.length > 1) {
    [conditionsStr, conclusionStr] = conditionsAndConclusion;
    const conditionRelations = conditionsStr.split(conditionsSplitRegexp);
    conditions = conditionRelations
      .filter((s) => s.length > 0)
      .map((s) => parseRel(s));
  } else {
    conclusionStr = conditionsAndConclusion[0];
  }
  const conclMatch = conclusionStr.match(impactRegexp);
  if (!conclMatch) {
    throw new Error(
      `conclusionStr:, '${conclusionStr}' isn't a valid conclusion`
    );
  }
  const { relString, op, scoreString } = conclMatch.groups as ImpactMatches;
  const rel = parseRel(relString);
  const score = parseFloat(scoreString);
  return { rel, op, score, conditions };
}

// ============================================================================== //
//  Tiny World Task Configs
// ============================================================================== //

export const sepToken = ', ';
export type SepToken = typeof sepToken;
export const sepVocab: SepToken[] = [sepToken];

export interface TinyWorldTaskConfig<
  ObjVocab extends string,
  RelVocab extends string
> extends BasicRandSeededTaskConfig {
  // obj vocab used a suffix-type trick: the ':' separated siffix of the object is it's type.
  // FORALL x s.t. objTokens.has(x) && x_type = x.split(':').pop().join(':') ==> objTokens.has(x_type)
  objectTokens: ObjVocab[];
  taxonomy: Map<ObjVocab, Set<ObjVocab>>;
  // Relation to argument matching is done by suffix matching.
  relationArgTypes: Map<RelVocab, ObjVocab[]>;
  rules: Rule[];
  baseContext: Relation[];
}

// ============================================================================== //
//  Tiny Worlds Task
// ============================================================================== //

export class TinyWorldTask<ObjVocab extends string, RelVocab extends string>
  implements BasicLmTask
{
  // TODO: consider doing programatically in the constructor?
  public name: string;
  public baseVocab: string[];
  public random: RandomStream;
  private exampleId = 0;

  constructor(public config: TinyWorldTaskConfig<ObjVocab, RelVocab>) {
    this.name = config.name;
    this.random = new RandomStream(config.seed);

    this.baseVocab = [
      ...sepVocab,
      ...config.objectTokens,
      ...config.relationArgTypes.keys(),
    ];
  }

  genRandExample(): Example {
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
