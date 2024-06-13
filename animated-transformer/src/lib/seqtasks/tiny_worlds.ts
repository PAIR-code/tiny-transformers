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
type RelArgument<Types, Vars> = { varName: Vars; varType: Types };
type Relation<Types, Vars, Relations> = {
  relName: Relations;
  args: RelArgument<Types, Vars>[];
};

type Rule<Types, Vars, Relations> = {
  rel: Relation<Types, Vars, Relations>;
  op: RuleOp;
  score: number;
  conditions: Relation<Types, Vars, Relations>[];
};
// function parseRelArgs(argsString: string): ArgMatch[] {

// }

export function parseRel<
  Types extends string,
  Vars extends string,
  Relations extends string
>(relString: string): Relation<Types, Vars, Relations> {
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
      const argMatch = a.match(argumentRegexp)?.groups as RelArgument<
        Types,
        Vars
      >;
      if (!argMatch) {
        console.warn(`'${a}' does not match the argumentRegexp.`);
        return null;
      }
      if (argMatch.varType === undefined) {
        argMatch.varType = '' as Types; // empty string is the type of all types.
      }
      return argMatch;
    })
    .filter((a) => a !== null) as RelArgument<Types, Vars>[];
  return { relName, args } as Relation<Types, Vars, Relations>;
}

export function parseRule<
  Types extends string,
  Vars extends string,
  Relations extends string
>(rule: string): Rule<Types, Vars, Relations> {
  const conditionsAndConclusion = rule.split(/\s*\=\=\>\s*/);
  let conditionsStr = undefined;
  let conclusionStr = undefined;
  let conditions: Relation<Types, Vars, Relations>[] = [];
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
  const rel = parseRel<Types, Vars, Relations>(relString);
  const score = parseFloat(scoreString);
  return { rel, op, score, conditions };
}

// ============================================================================== //
// Logic without probabilities.
// ============================================================================== //

// TODO: should failurekinds be Enum?

// When relations don't unify, why that might be the case.
type UnifyFailure =
  // Relations might have different names.
  | { kind: 'UnifyFailure:relNameClash'; relName1: string; relName2: string }
  | { kind: 'UnifyFailure:relNameContextClash'; relName: string }
  // A given relation is not consistent with the context
  | {
      kind: 'UnifyFailure:argContextTypeClash';
      argumentNumber: number;
      contextVarTypes: string;
      argType: string;
    }
  // Or relations might have an argument with a type that does not match.
  | {
      kind: 'UnifyFailure:relRelTypeClashArg';
      argumentNumber: number;
      arg1Type: string;
      arg2Type: string;
    };

type UnifyState<Types, Vars> = {
  kind: 'UnifyState';
  varTypes: Map<Vars, Types>;
  varRewrites: Map<Vars, Vars>;
};

// function subtype<Types>(
//   types: Map<Types, Set<Types>>,
//   superType: Types,
//   subType: Types
// ): boolean {
//   const subtypeSet = types.get(superType);
//   if (!subtypeSet) {
//     throw new Error(`No such subtype: '${subType}' in '${superType}'`);
//   }
//   return subtypeSet.has(subType);
// }

export class Context<
  Types extends string | '',
  Vars extends string,
  Relations extends string
> {
  constructor(
    // The type hierarchy.
    public types: Map<Types, Set<Types>>,
    // Mapping from Relation to the list of most general type for each argument.
    public relations: Map<Relations, Types[]>,

    // TODO: probably we want to generalise bindings and context into a single named set:
    // proof terms of LL.
    //
    // The list of atomic objects (variables)
    public varTypes: Map<Vars, Types>,
    // The list of relations
    public context: Relation<Types, Vars, Relations>[]
  ) {}

  subtypeOf(subType: Types, superType: Types): boolean {
    const subtypeSet = this.types.get(superType);
    if (!subtypeSet) {
      throw new Error(`No such subtype: '${subType}' in '${superType}'`);
    }
    return subtypeSet.has(subType);
  }

  unifyArgumentWithContext(
    a: RelArgument<Types, Vars>,
    unifyState: UnifyState<Types, Vars>,
    relType = '' as Types, // The type of this argument in the relation
    argumentNumber: number = -1 // indicates that no argument was provided.
  ): UnifyFailure | undefined {
    const prevBoundType = unifyState.varTypes.get(a.varName) || relType;

    if (
      // If it's the same type...
      a.varType === prevBoundType ||
      // or this relation treats the type as more general,
      // that's also true, but doesn't change the binding.
      this.subtypeOf(prevBoundType, a.varType)
    ) {
      return;
    }
    // If this type is more specific, we can match, and narrow the type.
    if (this.subtypeOf(a.varType, prevBoundType)) {
      unifyState.varTypes.set(a.varName, a.varType);
      return;
    } else {
      return {
        kind: 'UnifyFailure:argContextTypeClash',
        argumentNumber: argumentNumber,
        contextVarTypes: prevBoundType,
        argType: a.varType,
      };
    }
  }

  unifyRelationWithContext(
    r: Relation<Types, Vars, Relations>,
    unifyState: UnifyState<Types, Vars>
  ): UnifyFailure | undefined {
    const relTypes = this.relations.get(r.relName);

    if (!relTypes) {
      return { kind: 'UnifyFailure:relNameContextClash', relName: r.relName };
    }

    for (let i = 0; i < r.args.length; i++) {
      const unifyFailure = this.unifyArgumentWithContext(
        r.args[i],
        unifyState,
        relTypes[i],
        i
      );
      if (unifyFailure) {
        return unifyFailure;
      }
    }
    return;
  }

  unify(
    r1: Relation<Types, Vars, Relations>,
    r2: Relation<Types, Vars, Relations>
  ): UnifyState<Types, Vars> | UnifyFailure {
    if (r1.relName !== r2.relName) {
      return {
        kind: 'UnifyFailure:relNameClash',
        relName1: r1.relName,
        relName2: r2.relName,
      };
    }
    if (r1.args.length !== r2.args.length) {
      throw new Error(
        `match: relation arguments don't have the same number of parameters` +
          ` (${r1.args.length} vs ${r2.args.length})`
      );
    }
    let unifyState: UnifyState<Types, Vars> = {
      kind: 'UnifyState',
      varTypes: new Map(this.varTypes),
      varRewrites: new Map<Vars, Vars>(),
    };
    const unify1Failure = this.unifyRelationWithContext(r1, unifyState);
    if (unify1Failure) {
      return unify1Failure;
    }
    const unify2Failure = this.unifyRelationWithContext(r2, unifyState);
    if (unify2Failure) {
      return unify2Failure;
    }

    for (let i = 0; i < r1.args.length; i++) {
      const v1Name =
        unifyState.varRewrites.get(r1.args[i].varName) || r1.args[i].varName;
      const v2Name =
        unifyState.varRewrites.get(r2.args[i].varName) || r2.args[i].varName;

      // If the names are the same, the types must be. Proof by induction & construction.
      if (v1Name === v2Name) {
        continue;
      }

      // Note: || type might not be needed. Need to think.
      const v1Type = unifyState.varTypes.get(v1Name) || r1.args[i].varType;
      const v2Type = unifyState.varTypes.get(v2Name) || r2.args[i].varType;
      if (v1Type !== v2Type) {
        // Make both have the narrower type, or if incompatible, fail.
        if (this.subtypeOf(v1Type, v2Type)) {
          unifyState.varTypes.set(v2Name, v1Type);
        } else if (this.subtypeOf(v2Type, v1Type)) {
          unifyState.varTypes.set(v1Name, v2Type);
        } else {
          return {
            kind: 'UnifyFailure:relRelTypeClashArg',
            argumentNumber: i,
            arg1Type: v1Type,
            arg2Type: v2Type,
          };
        }
      }

      // v1 gets replaced everywhere as v2 now.
      unifyState.varRewrites.set(v1Name, v2Name);
      if (r1.args[i].varName !== v1Name) {
        unifyState.varRewrites.set(r1.args[i].varName, v2Name);
      }
    }

    return unifyState;
  }
}

// ============================================================================== //
//  Tiny World Task Configs
// ============================================================================== //

export const sepToken = ', ';
export type SepToken = typeof sepToken;
export const sepVocab: SepToken[] = [sepToken];

export interface TinyWorldTaskConfig<
  Vars extends string,
  Types extends string,
  Relations extends string
> extends BasicRandSeededTaskConfig {
  context: Context<Types, Vars, Relations>;
  rules: Rule<Types, Vars, Relations>[];
}

// try to unify two relations

// ============================================================================== //
//  Tiny Worlds Task
// ============================================================================== //

export class TinyWorldTask<
  Types extends string,
  Vars extends string,
  Relations extends string
> implements BasicLmTask
{
  // TODO: consider doing programatically in the constructor?
  public name: string;
  public baseVocab: string[];
  public random: RandomStream;
  private exampleId = 0;

  constructor(public config: TinyWorldTaskConfig<Types, Vars, Relations>) {
    this.name = config.name;
    this.random = new RandomStream(config.seed);

    this.baseVocab = [
      ...sepVocab,
      ...config.context.types.keys(),
      ...config.context.relations.keys(),
    ];
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
