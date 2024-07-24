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
import { stringify } from 'json5';
import { FreshNames } from '../names/simple_fresh_names';
import { RandomStream, makeRandomStream } from '../state-iter/random';

// ============================================================================== //
//  Core types
// ============================================================================== //
export type RuleOp = '+=' | '*=';

export type RelArgument<Types, Vars> = { varName: Vars; varType: Types };

export type Relation<TypeNames, VarNames, RelNames> = {
  relName: RelNames;
  args: RelArgument<TypeNames, VarNames>[];
};

export function stringifyRelation<TypeNames, VarNames, RelNames>(
  r: Relation<TypeNames, VarNames, RelNames>
) {
  const argsString = r.args
    .map((a) => `${a.varName}${a.varType === '' ? '' : ':' + a.varType}`)
    .join(' ');
  return `${r.relName} ${argsString}`;
}

// An assumption about rules is that the no two conditions are identical.
// (Such a rule can be reduced to a version where there is only such condition).
export type Rule<TypeNames, VarNames, RelNames> = {
  rel: Relation<TypeNames, VarNames, RelNames>;
  op: RuleOp;
  score: number;
  posConditions: Relation<TypeNames, VarNames, RelNames>[];
  negConditions: Relation<TypeNames, VarNames, RelNames>[];
};

export function stringifyRule<TypeNames, VarNames, RelNames>(
  r: Rule<TypeNames, VarNames, RelNames>
): string {
  const relStr = stringifyRelation(r.rel);
  const condSep =
    r.posConditions.length + r.negConditions.length > 0 ? ' | ' : '';
  const condsStr = r.posConditions.map(stringifyRelation).join(', ');
  const negCondsStr =
    r.negConditions.length === 0
      ? ''
      : ', -' + r.negConditions.map(stringifyRelation).join(', -');
  return `S(${relStr}${condSep}${condsStr}${negCondsStr}) ${r.op} ${r.score}`;
}

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
    }
  | {
      kind: 'UnifyFailure:argRelationTypeClash';
      argumentNumber: number;
      relationVarType: string;
      argType: string;
    };

export type UnifyState<Types, Vars> = {
  kind: 'UnifyState';
  varTypes: Map<Vars, Types>;
  varSubsts: Map<Vars, Vars>;
};

export function emptyUnifState<TypeNames, VarNames>(): UnifyState<
  TypeNames,
  VarNames
> {
  let unifyState: UnifyState<TypeNames, VarNames> = {
    kind: 'UnifyState',
    varTypes: new Map<VarNames, TypeNames>(),
    varSubsts: new Map<VarNames, VarNames>(),
  };
  return unifyState;
}

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
  /\s*(?<relName>\S*)\s+(?<argsString>((\_|\?)\S+\s*)*)/
);
type RelMatch = { relName: string; argsString: string };
const conditionsSplitRegexp = new RegExp(/\s*,\s*/);
const argsSplitRegexp = new RegExp(/\s+/);
const argumentRegexp = new RegExp(
  /(?<varName>[\_\?][^ \t\r\n\f\:]+)(\:(?<varType>\S+))?/
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
        argMatch.varType = '' as Types; // empty string is an unspecified type.
      }
      return argMatch;
    })
    .filter((a) => a !== null) as RelArgument<Types, Vars>[];
  return { relName, args } as Relation<Types, Vars, Relations>;
}

function isNegativeCondition(s: string): boolean {
  return s[0] === '-';
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
  const conclAndConditionStrs = conclAndConditionsStr.split(/\s*\|\s*/);
  if (conclAndConditionStrs.length <= 1 && conclAndConditionStrs.length >= 2) {
    throw new Error(
      `rule: '${ruleStr}', S(...) must have at most one | to separate conclusions and conditions: '${conclAndConditionStrs}'`
    );
  }
  const rel = parseRel<TypeNames, VarNames, RelNames>(conclAndConditionStrs[0]);
  const allConditionStrs =
    conclAndConditionStrs.length === 1
      ? []
      : conclAndConditionStrs[1]
          .split(conditionsSplitRegexp)
          .filter((s) => s.length > 0);

  const posConditions = allConditionStrs
    .filter((s) => !isNegativeCondition(s))
    .map((s) => parseRel<TypeNames, VarNames, RelNames>(s));
  const negConditions = allConditionStrs
    .filter(isNegativeCondition)
    .map((s) => parseRel<TypeNames, VarNames, RelNames>(s.slice(1)));
  const score = parseFloat(scoreString);
  return {
    rel,
    op,
    score,
    posConditions,
    negConditions,
  };
}

export function applyUnifSubstToRel<TypeNames, VarNames, RelNames>(
  unifState: UnifyState<TypeNames, VarNames>,
  rel: Relation<TypeNames, VarNames, RelNames>
): Relation<TypeNames, VarNames, RelNames> {
  const args = rel.args.map((a) => {
    return {
      varName: unifState.varSubsts.get(a.varName) || a.varName,
      varType: unifState.varTypes.get(a.varName) || a.varType,
    } as RelArgument<TypeNames, VarNames>;
  });
  const newRel = { relName: rel.relName, args };
  return newRel;
}

export function applyUnifSubstToRule<TypeNames, VarNames, RelNames>(
  unifState: UnifyState<TypeNames, VarNames>,
  rule: Rule<TypeNames, VarNames, RelNames>
): Rule<TypeNames, VarNames, RelNames> {
  const rel = applyUnifSubstToRel(unifState, rule.rel);
  const posConditions = rule.posConditions.map((c) =>
    applyUnifSubstToRel(unifState, c)
  );
  const negConditions = rule.posConditions.map((c) =>
    applyUnifSubstToRel(unifState, c)
  );
  return { rel, posConditions, negConditions, op: rule.op, score: rule.score };
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

// A note on memory management for Context:
//
// We treat Contexts as functional objects, meaning if we want to edit a Context,
// and guarentee not to edit others, we need to copy the context objects top
// down to the edited part, and return a new copy.
//
// TODO: make a deep-copy function so it's easier to be safe?
export class Context<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
> {
  public scene: Relation<TypeNames, VarNames, RelNames>[] = [];

  constructor(
    // The type hierarchy.
    public types: Map<TypeNames, Set<TypeNames>>,
    // Mapping from Relation to the list of most general type for each argument.
    public relations: Map<RelNames, TypeNames[]>,

    // TODO: probably we want to generalise bindings and context into a single named set:
    // proof terms of LL.
    //
    // The list of atomic objects (variables)
    public names: FreshNames,
    public varTypes: Map<VarNames, TypeNames>,
    // The list of relations in the scene
    // True when the name corresponds to a name in a rule and not to an name in
    // the context (we use a separate name class for rules to make it faster to do
    // matching; this avoid needing to rewrite rule-var names before matching).
    // e.g. ?x = var in a rule. _x = var in a relation in the context.
    public isUnboundVarName: (v: VarNames) => boolean
  ) {
    this.names = new FreshNames();
    this.names.addNames(types.keys());
    this.names.addNames(relations.keys());
    this.names.addNames(varTypes.keys());
  }

  // In place update of the current context.
  extendScene(rels: Relation<TypeNames, VarNames, RelNames>[]) {
    const unifyState = this.newUnifyState();
    rels.forEach((r, i) => {
      const unifyFailed = this.unifyRelationWithState(r, unifyState);
      if (unifyFailed) {
        console.warn(
          `can't create context with the specified relation. Unif state:`,
          r,
          unifyFailed
        );
        throw new Error(
          `${unifyFailed.kind} for relation (${i}): '${stringifyRelation(r)}'`
        );
      }
    });
    unifyState.varTypes.forEach((value, key) => {
      this.varTypes.set(key, value);
    });
    this.names.addNames(unifyState.varTypes.keys());
    this.scene = [...this.scene, ...rels];
  }

  lastSceneRel(): Relation<TypeNames, VarNames, RelNames> | null {
    return this.scene.length > 1 ? this.scene[this.scene.length] : null;
  }

  subtypeOf(subType: TypeNames, superType: TypeNames): boolean {
    const subtypeSet = this.types.get(superType);
    if (!subtypeSet) {
      console.warn(this.types);
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
    // Check consistent with Relation...
    let varType = a.varType;
    if (varType === '') {
      varType = relType;
    } else if (varType !== relType && !this.subtypeOf(varType, relType)) {
      // Else if the variable type is specificed, and it is not a subtype of what
      // the relation allows, unification fails.
      return {
        kind: 'UnifyFailure:argRelationTypeClash',
        argumentNumber: argumentNumber,
        relationVarType: relType,
        argType: a.varType,
      };
    }

    // If this doesn't change the previously known type for this var...
    const prevBoundType = unifyState.varTypes.get(a.varName);
    if (
      prevBoundType &&
      (varType === prevBoundType || // same as before
        // or this relation treats the type as more general,
        // that's also true, but doesn't change the binding.
        this.subtypeOf(prevBoundType, varType))
    ) {
      return;
    }

    // If this type is more specific than previously, set the type.
    if (!prevBoundType || this.subtypeOf(varType, prevBoundType)) {
      unifyState.varTypes.set(a.varName, varType);
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

  unifyRelationWithState(
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
          ` (${r1.relName}/${r1.args.length} vs ${r2.relName}/${r2.args.length})`
      );
    }
    const unify1Failure = this.unifyRelationWithState(r1, unifyState);
    if (unify1Failure) {
      return unify1Failure;
    }
    const unify2Failure = this.unifyRelationWithState(r2, unifyState);
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
    const initMatchUnifState = this.newUnifyState();
    const unifFailure = this.unifyRelationWithState(
      rule.rel,
      initMatchUnifState
    );
    if (unifFailure) {
      console.warn('surprising unification failure on rule concl', unifFailure);
      return [];
    }

    const initialMatches = [
      {
        rule: rule,
        contextBeforeRule: this.scene,
        // Each position in the list corresponds to a condition in the rule.
        // The number in the list is an index in into the matching relation
        // in the context to that condition of the rule.
        condToContextRelIdx: [],
        unifState: initMatchUnifState,
      } as RuleMatch<TypeNames, VarNames, RelNames>,
    ];
    // TODO: make more efficient: only fork the unify state when needed.
    // e.g. fail as much as possible before working.
    const finalMatches = rule.posConditions.reduce<
      RuleMatch<TypeNames, VarNames, RelNames>[]
    >((ruleMatches, condRel) => {
      const nextMatches: RuleMatch<TypeNames, VarNames, RelNames>[] = [];
      ruleMatches.forEach((match) => {
        // TODO: make more efficient: only fork the unify state when needed.
        // e.g. fail as much as possible before working.
        this.scene.forEach((contextRel, contextRelIdx) => {
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

    return finalMatches.filter((match) => {
      // every neg condition must fail to match every context rel:
      // = if any neg condition matches any context rel, this rule
      // is not applicable.
      for (const negRuleRel of rule.negConditions) {
        for (const contextRel of this.scene) {
          const newMatch = forkRuleMatch(match);
          const unifyFailure = this.unify(
            negRuleRel,
            contextRel,
            newMatch.unifState
          );
          if (!unifyFailure) {
            return false;
          }
        }
      }
      return true;
    });
  }

  // Top level copy of a context; forking it.
  fork(): Context<TypeNames, VarNames, RelNames> {
    const c = new Context(
      this.types,
      this.relations,
      this.names.fork(),
      new Map(this.varTypes),
      this.isUnboundVarName
    );
    c.scene = [...this.scene];
    return c;
  }

  applyRuleMatch(
    match: RuleMatch<TypeNames, VarNames, RelNames>
  ): Context<TypeNames, VarNames, RelNames> {
    const newContext = this.fork();

    // Names of locally introduced variables.
    const freshNameSubsts = emptyUnifState<TypeNames, VarNames>();

    // Apply the type-narrowings, and provide new names for introduced variables,
    // and also record their types in the new context.
    match.unifState.varTypes.forEach((vType, vName) => {
      if (
        this.isUnboundVarName(vName) &&
        !match.unifState.varSubsts.has(vName)
      ) {
        const newLocalName = newContext.names.makeAndAddNextName() as VarNames;
        freshNameSubsts.varSubsts.set(vName, newLocalName);
        freshNameSubsts.varTypes.set(newLocalName, vType);
        newContext.varTypes.set(newLocalName, vType);
      } else {
        newContext.varTypes.set(vName, vType);
      }
    });

    const matchedRelation = applyUnifSubstToRel(
      match.unifState,
      match.rule.rel
    );
    const freshNamesRelation = applyUnifSubstToRel(
      freshNameSubsts,
      matchedRelation
    );
    newContext.scene.push(freshNamesRelation);

    return newContext;
  }
}

export type RuleApp<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
> = {
  rule: Rule<TypeNames, VarNames, RelNames>;
  context: Context<TypeNames, VarNames, RelNames>;
  newRel: Relation<TypeNames, VarNames, RelNames>;
};

export type ScoreParts = {
  sum: number;
  mult: number;
};

export type RelRuleApps<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
> = {
  ruleScore: { sum: number; mult: number };
  totalScore: number;
  prob: number;
  rel: Relation<TypeNames, VarNames, RelNames>;
  ruleApps: RuleApp<TypeNames, VarNames, RelNames>[];
};

export function addRuleApps<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
>(
  rule: Rule<TypeNames, VarNames, RelNames>,
  context: Context<TypeNames, VarNames, RelNames>,
  ruleApps: Map<string, RuleApp<TypeNames, VarNames, RelNames>[]>
): void {
  context.matchRule(rule).map((m) => {
    const c2 = context.applyRuleMatch(m);
    const newRel = c2.scene[c2.scene.length - 1];
    const newRelStr = stringifyRelation(newRel);
    const prevRuleApps = ruleApps.get(newRelStr) || [];
    prevRuleApps.push({ context: c2, rule, newRel: newRel });
    ruleApps.set(newRelStr, prevRuleApps);
  });
}

export function applyRules<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
>(
  rules: Rule<TypeNames, VarNames, RelNames>[],
  context: Context<TypeNames, VarNames, RelNames>
): Map<string, RuleApp<TypeNames, VarNames, RelNames>[]> {
  const nextRuleApps = new Map<
    string, // string version of the new relation.
    RuleApp<TypeNames, VarNames, RelNames>[]
  >();
  for (const r of rules) {
    addRuleApps(r, context, nextRuleApps);
  }
  return nextRuleApps;
}

export function nextRelDistrStats<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
>(
  nextRuleApps: Map<string, RuleApp<TypeNames, VarNames, RelNames>[]>
): Map<string, RelRuleApps<TypeNames, VarNames, RelNames>> {
  // string = string form of introduced relation
  const finalDistr = new Map<
    string,
    RelRuleApps<TypeNames, VarNames, RelNames>
  >();

  let rel: Relation<TypeNames, VarNames, RelNames>;

  // Sum scores of all rule application that result in the same
  // new added relation.
  const initScoreParts: ScoreParts = { sum: 0, mult: 1 };
  nextRuleApps.forEach((ruleApps, relStrKey) => {
    const finalRuleScore = ruleApps.reduce<ScoreParts>(
      (scoreCalc: ScoreParts, ruleApp) => {
        rel = ruleApp.newRel;
        let newMult = scoreCalc.mult;
        let newSum = scoreCalc.sum;
        if (ruleApp.rule.op === '*=') {
          newMult = scoreCalc.mult * ruleApp.rule.score;
        } else if (ruleApp.rule.op === '+=') {
          newSum = scoreCalc.sum + ruleApp.rule.score;
        }
        return { sum: newSum, mult: newMult };
      },
      initScoreParts
    );
    // return the final string distribution.
    finalDistr.set(relStrKey, {
      ruleScore: finalRuleScore,
      totalScore: finalRuleScore.sum * finalRuleScore.mult,
      prob: -1,
      ruleApps,
      rel: rel,
    });
  });

  const allTotalScores = [...finalDistr.values()].reduce(
    (sum, v) => v.totalScore + sum,
    0
  );
  finalDistr.forEach((appInfo) => {
    appInfo.prob = appInfo.totalScore / allTotalScores;
  });

  return finalDistr;
}

// ============================================================================== //
//  Construction Helpers
// ============================================================================== //
export type VarNames = `_${string}` | `?${string}`;
export function isUnboundVarName(v: string): boolean {
  // console.log(v, v[0] === '?');
  return v[0] === '?';
}

export function initContext<TypeNames extends string, RelNames extends string>(
  typeMap: Map<TypeNames, Set<TypeNames>>,
  relationMap: Map<RelNames, TypeNames[]>
) {
  return new Context(
    typeMap,
    relationMap,
    new FreshNames(), // Updated by the context updates
    new Map<VarNames, TypeNames>(), // Updated by the context updates
    isUnboundVarName // Must match FreshNames.
  );
}

export type TypeHierarchy = string[] | { [name: string]: TypeHierarchy };

export function addToTypeMap(
  h: TypeHierarchy,
  m: Map<string, Set<string>>
): Set<string> {
  if (Array.isArray(h)) {
    h.forEach((t) => m.set(t, new Set()));
    return new Set(h);
  } else {
    const subTaxonomy = Object.keys(h);
    // let allSubTypes: string[] = [];
    const allSubTypes = new Set<string>();
    subTaxonomy.forEach((t) => {
      const subTypes = addToTypeMap(h[t], m);
      m.set(t, new Set(subTypes));
      subTypes.forEach((t) => allSubTypes.add(t));
      allSubTypes.add(t);
    });
    return allSubTypes;
  }
}

export function sampleNextRel<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
>(
  random: RandomStream,
  curContext: Context<TypeNames, VarNames, RelNames>,
  rules: Rule<TypeNames, VarNames, RelNames>[]
): {
  context: Context<TypeNames, VarNames, RelNames>;
  rel: Relation<TypeNames, VarNames, RelNames>;
} | null {
  const ruleApps = applyRules(rules, curContext);
  const distr = nextRelDistrStats(ruleApps);
  let nextRandValue = random.random();

  // TODO: is there a faster/smarter way to do random sampling...?
  let relRuleApps: RelRuleApps<TypeNames, VarNames, RelNames> | null = null;
  for (const v of distr) {
    relRuleApps = v[1];
    if (nextRandValue <= relRuleApps.prob) {
      break;
    }
    nextRandValue -= relRuleApps.prob;
  }
  // Note: numerical errors/rounding issues might result in
  // nextRandValue > ruleApp.prob for the last value, even if there
  // are values.
  // This should be very very rare, but to avoid strange surprises,
  // we attribute rounding error parts of the probability space to the
  // final rule.
  //
  // If not rules were present, this is still null, and we have to end
  // the sequence.
  if (!relRuleApps) {
    return null;
  }
  const ruleApp = relRuleApps.ruleApps[0];
  return { context: ruleApp.context, rel: ruleApp.newRel };
}
