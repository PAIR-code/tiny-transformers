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
import {
  applyUnifSubstToRel,
  emptyUnifState,
  forkUnifyState,
  UnifyState,
  forkRuleMatch,
  RuleMatch,
} from './unif_state';
import {
  parseRel,
  RelArgument,
  Relation,
  stringifyRelation,
} from './relations';
import { Rule, stringifyRule } from './rules';

// ============================================================================== //
//  Unification State & Failure
// ============================================================================== //
// When relations don't unify, why that might be the case.
export type UnifyFailure =
  // Relations might have different names.
  | { kind: 'UnifyFailure:relNameClash'; relName1: string; relName2: string }
  | { kind: 'UnifyFailure:relNameMissingFromStory'; relName: string }
  | {
      kind: 'UnifyFailure:relNameStoryArityMismatch';
      relName: string;
      storyArity: number;
      instanceArity: number;
    }
  // A given relation is not consistent with the story
  | {
      kind: 'UnifyFailure:argStoryTypeClash';
      argumentNumber: number;
      storyVarTypes: string;
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

export type RelationToAdd<TypeNames, VarNames, RelNames> = {
  newRel: Relation<TypeNames, VarNames, RelNames>;
  rule: Rule<TypeNames, VarNames, RelNames>;
  match: RuleMatch<TypeNames, VarNames, RelNames>;
  score: number;
};

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

// A note on memory management for Story:
//
// We treat Stories as functional objects, meaning if we want to edit a Story,
// and guarentee not to edit others, we need to copy the Story objects top
// down to the edited part, and return a new copy.
//
// TODO: make a deep-copy function so it's easier to be safe?
export class Story<
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

    // TODO: probably we want to generalise bindings and story into a single named set:
    // proof terms of LL.
    //
    // The list of atomic objects (variables)
    public names: FreshNames,
    public varTypes: Map<VarNames, TypeNames>,
    // The list of relations in the scene
    // True when the name corresponds to a name in a rule and not to an name in
    // the story (we use a separate name class for rules to make it faster to do
    // matching; this avoid needing to rewrite rule-var names before matching).
    // e.g. ?x = var in a rule. _x = var in a relation in the story.
    public isUnboundVarName: (v: VarNames) => boolean
  ) {
    this.names = new FreshNames();
    this.names.addNames(types.keys());
    this.names.addNames(relations.keys());
    this.names.addNames(varTypes.keys());
  }

  // In place update of the current story.
  extendScene(rels: Relation<TypeNames, VarNames, RelNames>[]) {
    const unifyState = this.newUnifyState();
    rels.forEach((r, i) => {
      const unifyFailed = this.unifyRelationWithContext(r, unifyState);
      if (unifyFailed) {
        console.warn(
          `can't create Story with the specified relation. Unif state:`,
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
    const instantiatedRels = rels.map((rel) =>
      applyUnifSubstToRel(unifyState, rel)
    );
    this.scene = [...this.scene, ...instantiatedRels];
  }

  lastSceneRel(): Relation<TypeNames, VarNames, RelNames> | null {
    return this.scene.length > 1 ? this.scene[this.scene.length] : null;
  }

  subtypeOfSuperType(subType: TypeNames, superType: TypeNames): boolean {
    const subtypeSet = this.types.get(superType);
    if (!subtypeSet) {
      console.warn(this.types);
      throw new Error(
        `No such supertype in the set of types: '${superType}' when trying to check subtypes ('${subType}')`
      );
    }
    return subtypeSet.has(subType);
  }

  typeIntersection(ty1: TypeNames, ty2: TypeNames): Set<TypeNames> {
    if (ty1 === ty2) {
      return new Set([ty1]);
    }
    const ty1Subset = this.types.get(ty1);
    if (!ty1Subset) {
      console.warn(this.types);
      throw new Error(`No such type in the set of types: '${ty1}'.`);
    }
    if (ty1Subset.has(ty2)) {
      return new Set([ty2]);
    }
    const ty2Subset = this.types.get(ty2);
    if (!ty2Subset) {
      console.warn(this.types);
      throw new Error(`No such type in the set of types: '${ty2}'.`);
    }
    if (ty2Subset.has(ty1)) {
      return new Set([ty1]);
    }
    return ty1Subset.intersection(ty2Subset);
  }

  unifyRelationArgumentWithContext(
    a: RelArgument<TypeNames, VarNames>,
    unifyState: UnifyState<TypeNames, VarNames>,
    relType: TypeNames, // The type of this argument in the relation
    argumentNumber: number = -1 // indicates that no argument was provided.
  ): UnifyFailure | undefined {
    console.log(
      'unifyRelationArgumentWithState: init varTypes',
      unifyState.varTypes,
      a
    );

    // Check the argument is consistent with Relation's corresponding argument type...
    let varType = a.varType;
    if (varType === '') {
      varType = relType;
    } else if (
      varType !== relType &&
      !this.subtypeOfSuperType(varType, relType)
    ) {
      // Else if the variable type is specificed, and it is not a subtype of what
      // the relation allows, unification fails.
      // console.error({
      //   kind: 'UnifyFailure:argRelationTypeClash',
      //   argumentNumber: argumentNumber,
      //   relationVarType: relType,
      //   argType: a.varType,
      // });
      // throw new Error('UnifyFailure:argRelationTypeClash');
      return {
        kind: 'UnifyFailure:argRelationTypeClash',
        argumentNumber: argumentNumber,
        relationVarType: relType,
        argType: a.varType,
      };
    }

    // If this doesn't change the previously known type for this var...
    const prevBoundType = unifyState.varTypes.get(a.varName);

    // If not previously bound, this is a new binding...
    if (!prevBoundType) {
      unifyState.varTypes.set(a.varName, varType);
      return;
    }

    // If current binding is the same, or tighter already...
    if (
      varType === prevBoundType || // same as before
      // or this relation treats the type as more general,
      // that's also true, but doesn't change the binding.
      this.subtypeOfSuperType(prevBoundType, varType)
    ) {
      return;
    }

    // If this type is more specific than previously, set the type.
    // Note: adding `!prevBoundType || ` to start of the condition
    if (this.subtypeOfSuperType(varType, prevBoundType)) {
      unifyState.varTypes.set(a.varName, varType);
      return;
    }

    // console.log({
    //   kind: 'UnifyFailure:argStoryTypeClash',
    //   argumentNumber: argumentNumber,
    //   storyVarTypes: prevBoundType,
    //   argType: a.varType,
    // });

    return {
      kind: 'UnifyFailure:argStoryTypeClash',
      argumentNumber: argumentNumber,
      storyVarTypes: prevBoundType,
      argType: a.varType,
    };

    // else if (!prevBoundType) {
    //   unifyState.varTypes.set(a.varName, varType);
    //   return;
    // } else {
    //   return {
    //     kind: 'UnifyFailure:argStoryTypeClash',
    //     argumentNumber: argumentNumber,
    //     storyVarTypes: prevBoundType,
    //     argType: a.varType,
    //   };
    // }
  }

  unifyRelationWithContext(
    r: Relation<TypeNames, VarNames, RelNames>,
    unifyState: UnifyState<TypeNames, VarNames>
  ): UnifyFailure | undefined {
    const relTypes = this.relations.get(r.relName);

    if (!relTypes) {
      throw new Error('UnifyFailure:relNameMissingFromStory');
      // return {
      //   kind: 'UnifyFailure:relNameMissingFromStory',
      //   relName: r.relName,
      // };
    }

    if (relTypes.length !== r.args.length) {
      throw new Error('UnifyFailure:relNameStoryArityMismatch');
      // return {
      //   kind: 'UnifyFailure:relNameStoryArityMismatch',
      //   relName: r.relName,
      //   storyArity: relTypes.length,
      //   instanceArity: r.args.length,
      // };
    }

    for (let i = 0; i < r.args.length; i++) {
      const unifyFailure = this.unifyRelationArgumentWithContext(
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
    const unify1Failure = this.unifyRelationWithContext(r1, unifyState);
    if (unify1Failure) {
      // console.log('unify1Failure: r1', r1);
      // console.log('unify1Failure: unifState', unify1Failure);
      return unify1Failure;
    }
    const unify2Failure = this.unifyRelationWithContext(r2, unifyState);
    if (unify2Failure) {
      // console.log('unify1Failure: r2', r2);
      // console.log('unify1Failure: unifState', unify1Failure);
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
        if (this.subtypeOfSuperType(v1Type, v2Type)) {
          unifyState.varTypes.set(v2Name, v1Type);
        } else if (this.subtypeOfSuperType(v2Type, v1Type)) {
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

  // Make sure the rule's relation match the types and argument-counts of the story's context.
  // Return an initial unification state with the rule's variables having appropriately general types.
  unifyRuleWithContext(
    rule: Rule<TypeNames, VarNames, RelNames>
  ): UnifyState<TypeNames, VarNames> | null {
    const initMatchUnifState = this.newUnifyState();
    const unifFailure = this.unifyRelationWithContext(
      rule.rel,
      initMatchUnifState
    );
    if (unifFailure) {
      console.warn(unifFailure);
      return null;
    }
    for (const posCondition of rule.posConditions) {
      const unifFailure = this.unifyRelationWithContext(
        posCondition,
        initMatchUnifState
      );
      if (unifFailure) {
        console.warn(unifFailure);
        // The types not longer match
        // console.warn('surprising unification failure on rule concl', unifFailure);
        return null;
      }
    }

    for (const negCondition of rule.negConditions) {
      const unifFailure = this.unifyRelationWithContext(
        negCondition,
        initMatchUnifState
      );
      if (unifFailure) {
        console.warn(unifFailure);
        // The types not longer match
        // console.warn('surprising unification failure on rule concl', unifFailure);
        return null;
      }
    }
    return initMatchUnifState;
  }

  matchRule(
    rule: Rule<TypeNames, VarNames, RelNames>
  ): RuleMatch<TypeNames, VarNames, RelNames>[] {
    const maybeInitMatchUnifState = this.unifyRuleWithContext(rule);
    if (!maybeInitMatchUnifState) {
      // console.error(`Rule's relations are malformed for this context ${stringifyRule(rule)}`);
      throw new Error(
        `Rule's relations are malformed for this context ${stringifyRule(rule)}`
      );
      // The types not longer match
      // console.warn('surprising unification failure on rule concl', unifFailure);
      // return [];
    }

    const initialMatches = [
      {
        rule: rule,
        sceneBeforeRule: this.scene,
        // Each position in the list corresponds to a positive condition of
        // the rule.
        // The number in the list is an index in into the matching relation
        // in the story to that condition of the rule.
        condToStoryRelIdx: [],
        unifState: maybeInitMatchUnifState,
      } as RuleMatch<TypeNames, VarNames, RelNames>,
    ];

    // Always match positive conditions first. (Negative filter these down,
    // and it would not be the same if you match negative first: the negative
    // condition might fail universally, but succeed after a positive condition
    // is matched).
    //
    // TODO: make more efficient: only fork the unify state when needed.
    // e.g. fail as much as possible before working.
    const finalMatches = rule.posConditions.reduce<
      RuleMatch<TypeNames, VarNames, RelNames>[]
    >((ruleMatches, condRel) => {
      const nextMatches: RuleMatch<TypeNames, VarNames, RelNames>[] = [];
      ruleMatches.forEach((match) => {
        // TODO: make more efficient: only fork the unify state when needed.
        // e.g. fail as much as possible before working.
        this.scene.forEach((storyRel, storyRelIdx) => {
          // TODO: make more efficient: only fork the unify state when needed.
          // e.g. fail as much as possible before working.
          const newMatch = forkRuleMatch(match);
          const unifyFailure = this.unify(
            condRel,
            storyRel,
            newMatch.unifState
          );
          if (!unifyFailure) {
            newMatch.condToStoryRelIdx.push(storyRelIdx);
            nextMatches.push(newMatch);
          } else {
            console.log('matchRule: unifFailure', {
              condRel,
              storyRel,
              unifState: newMatch.unifState,
            });
          }
        });
      });
      return nextMatches;
    }, initialMatches);

    return finalMatches.filter((match) => {
      // every neg condition must fail to match every story rel:
      // = if any neg condition matches any story rel, this rule
      // is not applicable.
      for (const negRuleRel of rule.negConditions) {
        for (const storyRel of this.scene) {
          const newMatch = forkRuleMatch(match);
          const unifyFailure = this.unify(
            negRuleRel,
            storyRel,
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

  // Top level copy of a story; forking it.
  fork(): Story<TypeNames, VarNames, RelNames> {
    const c = new Story(
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
  ): Story<TypeNames, VarNames, RelNames> {
    const newStory = this.fork();

    // Names of locally introduced variables.
    // Note: match.unifState us assumed to be initialised from the current story.
    const freshNameUnif = forkUnifyState(match.unifState);

    // Apply the type-narrowings, and provide new names for introduced variables,
    // and also record their types in the new story.
    match.unifState.varTypes.forEach((vType, vName) => {
      if (this.isUnboundVarName(vName)) {
        if (!match.unifState.varSubsts.has(vName)) {
          const newLocalName = newStory.names.makeAndAddNextName() as VarNames;
          freshNameUnif.varSubsts.set(vName, newLocalName);
          freshNameUnif.varTypes.set(newLocalName, vType);
          newStory.varTypes.set(newLocalName, vType);
        }
        // Else the variable is substituted for an exsiting known name.
      } else {
        // The name is not a var, but it may have a narrower type.
        newStory.varTypes.set(vName, vType);
      }
    });

    const matchedRelation = applyUnifSubstToRel(freshNameUnif, match.rule.rel);
    newStory.scene.push(matchedRelation);

    return newStory;
  }
}

export type RuleApp<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
> = {
  rule: Rule<TypeNames, VarNames, RelNames>;
  story: Story<TypeNames, VarNames, RelNames>;
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
  story: Story<TypeNames, VarNames, RelNames>,
  ruleApps: Map<string, RuleApp<TypeNames, VarNames, RelNames>[]>
): void {
  story.matchRule(rule).map((m) => {
    const newStory = story.applyRuleMatch(m);
    const newRel = newStory.scene[newStory.scene.length - 1];
    const newRelStr = stringifyRelation(newRel);
    const prevRuleApps = ruleApps.get(newRelStr) || [];
    prevRuleApps.push({ story: newStory, rule, newRel: newRel });
    ruleApps.set(newRelStr, prevRuleApps);
  });
}

// Output map is added-relation-string to rule application
export function applyRules<
  TypeNames extends string,
  VarNames extends string,
  RelNames extends string
>(
  rules: Rule<TypeNames, VarNames, RelNames>[],
  story: Story<TypeNames, VarNames, RelNames>
): Map<string, RuleApp<TypeNames, VarNames, RelNames>[]> {
  const nextRuleApps = new Map<
    string, // string version of the new relation.
    RuleApp<TypeNames, VarNames, RelNames>[]
  >();
  for (const r of rules) {
    addRuleApps(r, story, nextRuleApps);
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
  return v[0] === '?';
}

export function initStory<TypeNames extends string, RelNames extends string>(
  typeMap: Map<TypeNames, Set<TypeNames>>,
  relationMap: Map<RelNames, TypeNames[]>
) {
  return new Story(
    typeMap,
    relationMap,
    new FreshNames(), // Updated by the story updates
    new Map<VarNames, TypeNames>(), // Updated by the story updates
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
  curStory: Story<TypeNames, VarNames, RelNames>,
  rules: Rule<TypeNames, VarNames, RelNames>[]
): {
  story: Story<TypeNames, VarNames, RelNames>;
  rel: Relation<TypeNames, VarNames, RelNames>;
} | null {
  const ruleApps = applyRules(rules, curStory);
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
  return { story: ruleApp.story, rel: ruleApp.newRel };
}
