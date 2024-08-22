import { RelArgument, Relation, stringifyMapToSet } from './relations';
import { Rule } from './rules';

export type UnifyState<TypeName, VarName> = {
  kind: 'UnifyState';
  // Maps a variable name to the set of alternative possible valid types for that variable.
  varTypes: Map<VarName, Set<TypeName>>;
  // Substitutions for variable names.
  varSubsts: Map<VarName, VarName>;
};

export function stringifyUnifyState<TypeName extends string, VarName extends string>(
  state: UnifyState<TypeName, VarName>
) {
  return `state.varTypes:
${stringifyMapToSet(state.varTypes)}
state.varSubsts:
${state.varSubsts.entries()}`;
}

export function emptyUnifState<TypeName, VarName>(): UnifyState<TypeName, VarName> {
  let unifyState: UnifyState<TypeName, VarName> = {
    kind: 'UnifyState',
    varTypes: new Map<VarName, Set<TypeName>>(),
    varSubsts: new Map<VarName, VarName>(),
  };
  return unifyState;
}

export function forkUnifyState<TypeName, VarName>(
  s: UnifyState<TypeName, VarName>
): UnifyState<TypeName, VarName> {
  let unifyState: UnifyState<TypeName, VarName> = {
    kind: 'UnifyState',
    varTypes: new Map(s.varTypes),
    varSubsts: new Map<VarName, VarName>(s.varSubsts),
  };
  return unifyState;
}

export function applyUnifSubstToRel<TypeName, VarName, RelName>(
  unifState: UnifyState<TypeName, VarName>,
  rel: Relation<TypeName, VarName, RelName>
): Relation<TypeName, VarName, RelName> {
  const args = rel.args.map((a) => {
    return {
      varName: unifState.varSubsts.get(a.varName) || a.varName,
      varTypes: unifState.varTypes.get(a.varName) || a.varTypes,
    } as RelArgument<TypeName, VarName>;
  });
  const newRel = { relName: rel.relName, args };
  return newRel;
}

export function applyUnifSubstToRule<TypeNames, VarNames, RelNames>(
  unifState: UnifyState<TypeNames, VarNames>,
  rule: Rule<TypeNames, VarNames, RelNames>
): Rule<TypeNames, VarNames, RelNames> {
  const rel = applyUnifSubstToRel(unifState, rule.rel);
  const posConditions = rule.posConditions.map((c) => applyUnifSubstToRel(unifState, c));
  const negConditions = rule.posConditions.map((c) => applyUnifSubstToRel(unifState, c));
  return { rel, posConditions, negConditions, op: rule.op, score: rule.score };
}

export type RuleMatch<TypeNames, VarNames, RelNames> = {
  rule: Rule<TypeNames, VarNames, RelNames>;
  sceneBeforeRule: Relation<TypeNames, VarNames, RelNames>[];
  // Each position in the list corresponds to a condition in the rule.
  // The number in the list is an index in into the matching relation
  // in the story to that condition of the rule.
  condToStoryRelIdx: number[];
  unifState: UnifyState<TypeNames, VarNames>;
};

export function forkRuleMatch<TypeNames, VarNames, RelNames>(
  m: RuleMatch<TypeNames, VarNames, RelNames>
): RuleMatch<TypeNames, VarNames, RelNames> {
  return {
    ...m,
    condToStoryRelIdx: [...m.condToStoryRelIdx],
    unifState: forkUnifyState(m.unifState),
  };
}
