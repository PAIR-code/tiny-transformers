// ============================================================================== //
//  Core types

import { parseRel, Relation, stringifyRelation } from './relations';

// ============================================================================== //
export type RuleOp = '+=' | '*=';

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
const conditionsSplitRegexp = new RegExp(/\s*,\s*/);

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
