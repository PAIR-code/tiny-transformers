export type RelArgumentMatch = {
  varName: string;
  // A set of possible types for the variable, in the form:
  // type1|type1|...|typeN
  varTypes: string;
};

export type RelArgument<TypeName, VarName> = {
  varName: VarName;
  // A set of possible types for the variable.
  varTypes: Set<TypeName>;
};

export type Relation<TypeName, VarName, RelName> = {
  relName: RelName;
  args: RelArgument<TypeName, VarName>[];
};

export function stringifyTypes<TypeName>(types: Set<TypeName>) {
  if (types.size === 0) {
    return '*never*';
  } else {
    const typesList = [...types].sort();
    if (typesList.length === 1) {
      const ty = typesList[0];
      return ty === '' ? '' : ':' + ty;
    } else {
      return `:${typesList.join('|')}`;
    }
  }
}

export function stringifyRelation<TypeName, VarName, RelName>(
  r: Relation<TypeName, VarName, RelName>
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
  /(?<varName>[\_\?][^ \t\r\n\f\:]+)(\:(?<varTypes>\S+))?/
);

export function parseRel<
  TypeName extends string,
  VarName extends string,
  RelName extends string
>(relString: string): Relation<TypeName, VarName, RelName> {
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
      const argMatch = a.match(argumentRegexp)?.groups as RelArgumentMatch;
      if (!argMatch) {
        console.warn(`'${a}' does not match the argumentRegexp.`);
        return null;
      }
      if (argMatch.varTypes === undefined) {
        argMatch.varTypes = '' as TypeName; // empty string is an unspecified type.
      }
      argMatch.varTypes.split('|');

      const relArgument: RelArgument<TypeName, VarName>;

      return {} as RelArgument;
    })
    .filter((a) => a !== null) as RelArgument<TypeName, VarName>[];
  return { relName, args } as Relation<TypeName, VarName, RelName>;
}
