export type RelArgument<TypeNames, VarNames> = {
  varName: VarNames;
  varType: TypeNames;
};

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

const relRegexp = new RegExp(
  /\s*(?<relName>\S*)\s+(?<argsString>((\_|\?)\S+\s*)*)/
);
type RelMatch = { relName: string; argsString: string };
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
