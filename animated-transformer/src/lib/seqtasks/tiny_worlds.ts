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
//  Core types
// ============================================================================== //
export type RuleOp = '+=' | '=';

export type RelArgument<Types, Vars> = { varName: Vars; varType: Types };

export type Relation<TypeNames, VarNames, RelNames> = {
  relName: RelNames;
  args: RelArgument<TypeNames, VarNames>[];
};

// An assumption about rules is that the no two conditions are identical.
// (Such a rule can be reduced to a version where there is only such condition).
export type Rule<Types, Vars, Relations> = {
  rel: Relation<Types, Vars, Relations>;
  op: RuleOp;
  score: number;
  conditions: Relation<Types, Vars, Relations>[];
};

// ============================================================================== //
//  Unification State & Failure
// ============================================================================== //
// When relations don't unify, why that might be the case.
export type UnifyFailure =
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

export type UnifyState<Types, Vars> = {
  kind: 'UnifyState';
  varTypes: Map<Vars, Types>;
  varSubsts: Map<Vars, Vars>;
};

export function forkUnifyState<TypeNames, VarNames>(
  s: UnifyState<TypeNames, VarNames>
): UnifyState<TypeNames, VarNames> {
  let unifyState: UnifyState<TypeNames, VarNames> = {
    kind: 'UnifyState',
    varTypes: new Map(s.varTypes),
    varSubsts: new Map<VarNames, VarNames>(s.varSubsts),
  };
  return unifyState;
}

export type RuleMatch<TypeNames, VarNames, RelNames> = {
  rule: Rule<TypeNames, VarNames, RelNames>;
  contextBeforeRule: Relation<TypeNames, VarNames, RelNames>[];
  // Each position in the list corresponds to a condition in the rule.
  // The number in the list is an index in into the matching relation
  // in the context to that condition of the rule.
  condToContextRelIdx: number[];
  unifState: UnifyState<TypeNames, VarNames>;
};

export function forkRuleMatch<TypeNames, VarNames, RelNames>(
  m: RuleMatch<TypeNames, VarNames, RelNames>
): RuleMatch<TypeNames, VarNames, RelNames> {
  return {
    ...m,
    condToContextRelIdx: [...m.condToContextRelIdx],
    unifState: forkUnifyState(m.unifState),
  };
}

export type RelationToAdd<TypeNames, VarNames, RelNames> = {
  newRel: Relation<TypeNames, VarNames, RelNames>;
  rule: Rule<TypeNames, VarNames, RelNames>;
  match: RuleMatch<TypeNames, VarNames, RelNames>;
  score: number;
};

// ============================================================================== //
//  Rule Parser
// ============================================================================== //

// Old rule shaped expressions.
// const impactRegexp = new RegExp(
//   /\s*(?<relString>[^\+\=]*)\s*(?<op>(\+\=|\=))\s*(?<scoreString>\S+)\s*/
// );

const impactRegexp = new RegExp(
  /^\s*S\((?<conclAndConditionsStr>[^\)]+)\)\s*(?<op>(\+\=|\*\=))\s*(?<scoreString>\S+)\s*$/
);
type ImpactMatches = {
  conclAndConditionsStr: string;
  op: RuleOp;
  scoreString: string;
};
const relRegexp = new RegExp(
  /\s*(?<relName>\S*)\s+(?<argsString>((\_|\*)\S+\s*)*)/
);
type RelMatch = { relName: string; argsString: string };
const conditionsSplitRegexp = new RegExp(/\s*,\s*/);
const argsSplitRegexp = new RegExp(/\s+/);
const argumentRegexp = new RegExp(
  /(?<varName>\_[^ \t\r\n\f\:]+)(\:(?<varType>\S+))?/
);

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
        argMatch.varType = '*' as Types; // empty string is the type of all types.
      }
      return argMatch;
    })
    .filter((a) => a !== null) as RelArgument<Types, Vars>[];
  return { relName, args } as Relation<Types, Vars, Relations>;
}

export function parseRule<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
>(ruleStr: string): Rule<TypeNames, VarNames, RelNames> {
  const conclMatch = ruleStr.match(impactRegexp);
  if (!conclMatch) {
    throw new Error(`rule: '${ruleStr}' isn't valid, it lacks a score.`);
  }
  const { conclAndConditionsStr, op, scoreString } =
    conclMatch.groups as ImpactMatches;
  const conclAndConditionStr = conclAndConditionsStr.split(/\s*\|\s*/);
  if (conclAndConditionStr.length <= 1 && conclAndConditionStr.length >= 2) {
    throw new Error(
      `rule: '${ruleStr}', S(...) must have at most one | to separate conclusions and conditions: '${conclAndConditionStr}'`
    );
  }
  const rel = parseRel<TypeNames, VarNames, RelNames>(conclAndConditionStr[0]);
  const conditions =
    conclAndConditionStr.length === 1
      ? []
      : conclAndConditionStr[1]
          .split(',')
          .filter((s) => s.length > 0)
          .map((s) => parseRel<TypeNames, VarNames, RelNames>(s));
  const score = parseFloat(scoreString);
  return { rel, op, score, conditions };
}

// ============================================================================== //
// Logic without probabilities.
// ============================================================================== //

// TODO: should failurekinds be Enum?

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
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
> {
  constructor(
    // The type hierarchy.
    public types: Map<TypeNames, Set<TypeNames>>,
    // Mapping from Relation to the list of most general type for each argument.
    public relations: Map<RelNames, TypeNames[]>,

    // TODO: probably we want to generalise bindings and context into a single named set:
    // proof terms of LL.
    //
    // The list of atomic objects (variables)
    public varTypes: Map<VarNames, TypeNames>,
    // The list of relations
    public context: Relation<TypeNames, VarNames, RelNames>[]
  ) {}

  subtypeOf(subType: TypeNames, superType: TypeNames): boolean {
    const subtypeSet = this.types.get(superType);
    if (!subtypeSet) {
      console.log(this.types);
      throw new Error(
        `No such supertype in the set of types: '${superType}' when trying to check subtypes ('${subType}')`
      );
    }
    return subtypeSet.has(subType);
  }

  unifyArgumentWithContext(
    a: RelArgument<TypeNames, VarNames>,
    unifyState: UnifyState<TypeNames, VarNames>,
    relType: TypeNames, // The type of this argument in the relation
    argumentNumber: number = -1 // indicates that no argument was provided.
  ): UnifyFailure | undefined {
    const prevBoundType = unifyState.varTypes.get(a.varName);
    if (
      prevBoundType &&
      // If it's the same type...
      (a.varType === prevBoundType ||
        // or this relation treats the type as more general,
        // that's also true, but doesn't change the binding.
        this.subtypeOf(prevBoundType, a.varType))
    ) {
      return;
    }
    // If this type is more specific, we can match, and narrow the type.
    if (!prevBoundType || this.subtypeOf(a.varType, prevBoundType)) {
      let mostSpecificTypeYet = a.varType;
      if (this.subtypeOf(relType, a.varType)) {
        mostSpecificTypeYet = relType;
      }
      unifyState.varTypes.set(a.varName, mostSpecificTypeYet);
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
    r: Relation<TypeNames, VarNames, RelNames>,
    unifyState: UnifyState<TypeNames, VarNames>
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
    r1: Relation<TypeNames, VarNames, RelNames>,
    r2: Relation<TypeNames, VarNames, RelNames>,
    unifyState: UnifyState<TypeNames, VarNames>
  ): UnifyFailure | null {
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
        unifyState.varSubsts.get(r1.args[i].varName) || r1.args[i].varName;
      const v2Name =
        unifyState.varSubsts.get(r2.args[i].varName) || r2.args[i].varName;

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
      unifyState.varSubsts.set(v1Name, v2Name);
      if (r1.args[i].varName !== v1Name) {
        unifyState.varSubsts.set(r1.args[i].varName, v2Name);
      }
    }

    return null;
  }

  newUnifyState(): UnifyState<TypeNames, VarNames> {
    let unifyState: UnifyState<TypeNames, VarNames> = {
      kind: 'UnifyState',
      varTypes: new Map(this.varTypes),
      varSubsts: new Map<VarNames, VarNames>(),
    };
    return unifyState;
  }

  matchRule(
    rule: Rule<TypeNames, VarNames, RelNames>
  ): RuleMatch<TypeNames, VarNames, RelNames>[] {
    const initialMatches = [
      {
        rule: rule,
        contextBeforeRule: this.context,
        // Each position in the list corresponds to a condition in the rule.
        // The number in the list is an index in into the matching relation
        // in the context to that condition of the rule.
        condToContextRelIdx: [],
        unifState: this.newUnifyState(),
      } as RuleMatch<TypeNames, VarNames, RelNames>,
    ];

    const finalMatches = rule.conditions.reduce<
      RuleMatch<TypeNames, VarNames, RelNames>[]
    >((ruleMatches, condRel) => {
      const nextMatches: RuleMatch<TypeNames, VarNames, RelNames>[] = [];
      ruleMatches.forEach((match) => {
        this.context.forEach((contextRel, contextRelIdx) => {
          // TODO: make more efficient: only fork the unify state when needed.
          // e.g. fail as much as possible before working.
          const newMatch = forkRuleMatch(match);
          const unifyFailure = this.unify(
            condRel,
            contextRel,
            newMatch.unifState
          );
          if (!unifyFailure) {
            newMatch.condToContextRelIdx.push(contextRelIdx);
            nextMatches.push(newMatch);
          }
        });
      });
      return nextMatches;
    }, initialMatches);

    return finalMatches;
  }

  //   applyRuleMatch(
  //     match: RuleMatch<TypeNames, VarNames, RelNames>
  //   ): Context<TypeNames, VarNames, RelNames> {

  //     const newVarTypes = new Map(this.varTypes);
  //     match.unifState.varTypes.forEach((value,key) => newVarTypes.set(key,value));

  //     match.rule.rel

  //     return new Context(
  //       this.types,
  //       this.relations,
  //       newVarTypes,
  //       newContext
  //     );

  //   }
}

// for(ord('a')

// class FreshNames {
//   constructor(prefix: string, startId: number, chars = ['a'])
// }

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
