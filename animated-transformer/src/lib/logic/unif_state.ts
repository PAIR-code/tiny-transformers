import { RelArgument, Relation } from './relations';
import { Rule } from './rules';

export type UnifyState<Types, Vars> = {
  kind: 'UnifyState';
  // Maps a variable name to the set of alternative possible valid types for that variable.
  varTypes: Map<Vars, Set<Types>>;
  // Substitutions for variable names.
  varSubsts: Map<Vars, Vars>;
};

export function emptyUnifState<TypeNames, VarNames>(): UnifyState<
  TypeNames,
  VarNames
> {
  let unifyState: UnifyState<TypeNames, VarNames> = {
    kind: 'UnifyState',
    varTypes: new Map<VarNames, Set<TypeNames>>(),
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

export function applyUnifSubstToRel<TypeNames, VarNames, RelNames>(
  unifState: UnifyState<TypeNames, VarNames>,
  rel: Relation<TypeNames, VarNames, RelNames>
): Relation<TypeNames, VarNames, RelNames> {
  const args = rel.args.map((a) => {
    return {
      varName: unifState.varSubsts.get(a.varName) || a.varName,
      varTypes: unifState.varTypes.get(a.varName) || a.varTypes,
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
