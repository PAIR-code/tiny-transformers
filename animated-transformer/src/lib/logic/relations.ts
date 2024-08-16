export type TypeHierarchy = string[] | { [name: string]: TypeHierarchy };

// returns the set of all types.
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

export function makeTypeDef(
  typeHierarchy: TypeHierarchy
): Map<string, Set<string>> {
  const typeMap = new Map<string, Set<string>>();
  const allTypes = addToTypeMap(typeHierarchy, typeMap);
  typeMap.set('', allTypes);
  return typeMap;
}

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

// Look at every supertype, and check if it's the same, or if it's a subtype of it.
export function subtypeOfTypeset<TypeName>(
  typeDefs: Map<TypeName, Set<TypeName>>,
  subType: TypeName,
  superTypes: Set<TypeName>
): boolean {
  for (const superType of superTypes) {
    if (subType === superType) {
      return true;
    } else {
      const superTypesSet = typeDefs.get(superType);
      if (!superTypesSet) {
        throw new Error(
          `typeDefs need to have all types, but don't have the supertype ${superTypes}.`
        );
      }
      if (superTypesSet.has(subType)) {
        return true;
      }
      // Else keep looking...
    }
  }
  return false;
}

// Every subtype is in a superType.
export function typeSetIsSubsetOf<TypeName>(
  typeDefs: Map<TypeName, Set<TypeName>>,
  superTypes: Set<TypeName>,
  subTypes: Set<TypeName>
): boolean {
  for (const subType of subTypes) {
    if (!subtypeOfTypeset(typeDefs, subType, superTypes)) {
      return false;
    }
  }
  return true;
}

// Property:
// * If tys2 is not redundant (has an element that is a member of anothers' definition),
// Then the result should also not be redundant
// * Returns a maximally general set description.
//
// TODO: make an efficient tree representation so that trees can be directly merged.
export function typeIntersectSet<TypeName>(
  // A map from types to every type in it.
  typeDefs: Map<TypeName, Set<TypeName>>,
  ty: TypeName,
  tys2: Set<TypeName>
): Set<TypeName> {
  if (tys2.has(ty)) {
    return new Set<TypeName>([ty]);
  } else {
    const tys1 = typeDefs.get(ty);
    const missingTys1 = new Set(tys1);
    if (!tys1) {
      throw new Error(`typeDefs needs to have all types, but lacks ${ty}.`);
    }
    for (const ty2 of tys2) {
      if (tys1.has(ty2)) {
        missingTys1.delete(ty2);
      } else {
        const ty2types = typeDefs.get(ty2);
        if (!ty2types) {
          throw new Error(
            `typeDefs needs to have all types, but lacks subtypes for ${ty2}.`
          );
        }
        // Note: we don't need to recurse further because ty2types contains all
        // subtypes of recursively.
        for (const typ2subtype of ty2types) {
          if (tys1.has(typ2subtype)) {
            missingTys1.delete(typ2subtype);
          }
        }
      }
    }
    return tys1.difference(missingTys1);
  }
}

export function typeIntersection<TypeName>(
  // A map from types to every type in it.
  typeDefs: Map<TypeName, Set<TypeName>>,
  tys1: Set<TypeName>,
  tys2: Set<TypeName>
): Set<TypeName> {
  let allSubtypes = new Set<TypeName>();
  for (const ty1 of tys1) {
    const ty1s = typeIntersectSet(typeDefs, ty1, tys2);
    allSubtypes = allSubtypes.union(ty1s);
  }
  return allSubtypes;
}

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
    .map((a) => `${a.varName}${stringifyTypes(a.varTypes)}`)
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
      const varTypes = new Set<TypeName>(
        argMatch.varTypes.split('|') as Iterable<TypeName>
      );
      const varName = argMatch.varName as VarName;
      const relArgument: RelArgument<TypeName, VarName> = {
        varName,
        varTypes,
      };
      return relArgument;
    })
    .filter((a) => a !== null) as RelArgument<TypeName, VarName>[];
  return { relName, args } as Relation<TypeName, VarName, RelName>;
}
