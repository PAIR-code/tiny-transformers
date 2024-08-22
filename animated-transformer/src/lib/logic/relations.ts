import { Type } from '@angular/core';
import { filterSet } from '../seqtasks/util';

export type TypeHierarchySpec = string[] | { [name: string]: TypeHierarchySpec };

export type RelTypeArgsSpec<RelName extends string, TypeName extends string> = {
  [Key in RelName]: TypeName[];
};

export type TypeDef<TypeName> = {
  parents: Map<TypeName, Set<TypeName>>;
  children: Map<TypeName, Set<TypeName>>;
  ancestor: Map<TypeName, Set<TypeName>>;
  decendent: Map<TypeName, Set<TypeName>>;
};

export const universalType = '*';

export function invertMapToSet<A, B>(m: Map<A, Set<B>>): Map<B, Set<A>> {
  const coMap = new Map<B, Set<A>>();
  m.forEach((bSet, a) => {
    for (const b of bSet) {
      let aSet = coMap.get(b);
      if (!aSet) {
        aSet = new Set<A>();
        coMap.set(b, aSet);
      }
      aSet.add(a);
    }
  });
  return coMap;
}

export function stringifyMapToSet(mapToSet: Map<string, Set<string>>): string {
  return [...mapToSet.entries()]
    .map((x: [string, Set<string>]) => {
      const [s, ss] = x;
      return JSON.stringify(`${s}: ${[...ss]}`);
    })
    .join('\n');
}

export function extendTypesWithDecendent(
  current: {
    type: string;
    decendents: Set<string>; // the subset so far.
    ancestors: Set<string>;
  },
  newty: string,
  // The type hierarchy defined under the current type.
  // These are maps from a type to all it's (sub)children or (super)parents.
  types: TypeDef<string>
) {
  // Add child/parent
  const currentChildren = types.children.get(current.type);
  if (!currentChildren) {
    throw new Error(`${current.type} does not have an entry in the typedef children map.`);
  }
  currentChildren.add(newty);

  let newtyParents = types.parents.get(newty);
  if (!newtyParents) {
    newtyParents = new Set<string>([current.type]);
    types.parents.set(newty, newtyParents);
  }
  let newtyChildren = types.children.get(newty);
  if (!newtyChildren) {
    newtyChildren = new Set<string>([]);
    types.children.set(newty, newtyChildren);
  }

  // update ancestors.
  // Make sure that current and all its ancestors are super-types of newty.
  let newtyAncestors = types.ancestor.get(newty);
  if (!newtyAncestors) {
    newtyAncestors = new Set<string>();
    types.ancestor.set(newty, newtyAncestors);
  }
  newtyAncestors.add(current.type);
  current.ancestors.forEach((ancestor) => newtyAncestors.add(ancestor));

  // update decendents.
  // Make sure that all ancestors of newty have newty and all its decendents as
  // decendents too.
  let newtyDecendents = types.decendent.get(newty);
  // Make sure newty has an entry in the subtypes.
  if (!newtyDecendents) {
    newtyDecendents = new Set<string>();
    types.decendent.set(newty, newtyDecendents);
  }
  // Now add this and its decendents as decendents of all ancestors.
  newtyAncestors.forEach((ancestor) => {
    const ancestorDecendents = types.decendent.get(ancestor) as Set<string>;
    ancestorDecendents.add(newty);
    newtyDecendents!.forEach((newtyDecendent) => ancestorDecendents.add(newtyDecendent));
  });
}

// returns the set of all types.
// Assumes that currentType exists in the supertypeMap and subtypeMap.
export function extendTypeDef(
  current: {
    type: string;
    decendents: Set<string>; // the subset so far.
    ancestors: Set<string>; // the subset so far.
  },
  // The type hierarchy defined under the current type.
  currentTypeHierarchy: TypeHierarchySpec,
  // These are maps from a type to all it's (sub)children or (super)parents.
  types: TypeDef<string>
): void {
  if (Array.isArray(currentTypeHierarchy)) {
    currentTypeHierarchy.forEach((t) => {
      extendTypesWithDecendent(current, t, types);
    });
  } else {
    const subTypeNames = Object.keys(currentTypeHierarchy);
    subTypeNames.forEach((t) => {
      extendTypesWithDecendent(current, t, types);
      const decendents = types.decendent.get(t)!;
      const ancestors = types.ancestor.get(t)!;
      extendTypeDef({ type: t, decendents, ancestors }, currentTypeHierarchy[t], types);
    });
  }
}

export function initTypeDef(typeHierarchy: TypeHierarchySpec): TypeDef<string> {
  const current = {
    type: universalType,
    children: new Set<string>([]),
    parents: new Set<string>([]),
    decendents: new Set<string>([]),
    ancestors: new Set<string>([]),
  };
  const types = {
    children: new Map<string, Set<string>>([[universalType, current.children]]),
    parents: new Map<string, Set<string>>([[universalType, current.parents]]),
    ancestor: new Map<string, Set<string>>([[universalType, current.ancestors]]),
    decendent: new Map<string, Set<string>>([[universalType, current.decendents]]),
  };
  extendTypeDef(current, typeHierarchy, types);
  return types;
}

export type RelArgumentMatch = {
  varName: string;
  // A set of possible types for the variable, in the form:
  // type1|type1|...|typeN
  varTypesString: string;
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

// Flatten a set of types into the most ground types possible.
export function flattenType<TypeName>(
  typeDef: TypeDef<TypeName>,
  typeName: TypeName,
  onlyLeaves = true
): Set<TypeName> {
  const decendents = typeDef.decendent.get(typeName)!;
  if (decendents.size === 0) {
    return new Set([typeName]);
  } else {
    return onlyLeaves
      ? filterSet((name) => typeDef.decendent.get(name)!.size === 0, decendents)
      : decendents;
  }
}

// Flatten a set of types into the most ground types possible.
export function flattenTypeset<TypeName>(
  decendentMap: Map<TypeName, Set<TypeName>>,
  tyset: Set<TypeName>,
  onlyLeaves = true
): Set<TypeName> {
  const flattenedTypeset = new Set<TypeName>();
  tyset.forEach((ty) => {
    const tyDecendents = decendentMap.get(ty);
    if (!tyDecendents) {
      throw new Error(`typeDefs needs to have all types, but lacks ${ty}.`);
    }
    if (!onlyLeaves || tyDecendents.size === 0) {
      flattenedTypeset.add(ty);
    }
    tyDecendents.forEach((subty) => {
      if (!onlyLeaves || decendentMap.get(subty)!.size === 0) {
        flattenedTypeset.add(subty);
      }
    });
  });
  return flattenedTypeset;
}

// // Note: this implementation treats parent types as maybe containing more than their member.
// // Property:
// // * If tys2 is not redundant (has an element that is a member of anothers' definition),
// // Then the result should also not be redundant
// // * Returns a maximally general set description.
// //
// // TODO: make an efficient tree representation so that trees can be directly merged.
// export function nonStrictTypeIsInSet<TypeName>(
//   // A map from types to every type in it.
//   typeDefs: Map<TypeName, Set<TypeName>>,
//   ty: TypeName,
//   tys2: Set<TypeName>
// ): Set<TypeName> {
//   if (tys2.has(ty)) {
//     return new Set<TypeName>([ty]);
//   } else {
//     const tys1 = typeDefs.get(ty);
//     const missingTys1 = new Set(tys1);
//     if (!tys1) {
//       throw new Error(`typeDefs needs to have all types, but lacks ${ty}.`);
//     }
//     for (const ty2 of tys2) {
//       if (tys1.has(ty2)) {
//         missingTys1.delete(ty2);
//       } else {
//         const ty2types = typeDefs.get(ty2);
//         if (!ty2types) {
//           throw new Error(`typeDefs needs to have all types, but lacks subtypes for ${ty2}.`);
//         }
//         // Note: we don't need to recurse further because ty2types contains all
//         // subtypes of recursively.
//         for (const typ2subtype of ty2types) {
//           if (tys1.has(typ2subtype)) {
//             missingTys1.delete(typ2subtype);
//           }
//         }
//       }
//     }
//     return tys1.difference(missingTys1);
//   }
// }

// // Look at every supertype, and check if it's the same, or if it's a subtype of it.
// export function nonStrictSubtypeOfTypeset<TypeName>(
//   typeDefs: Map<TypeName, Set<TypeName>>,
//   subType: TypeName,
//   superTypes: Set<TypeName>
// ): boolean {
//   for (const superType of superTypes) {
//     if (subType === superType) {
//       return true;
//     } else {
//       const superTypesSet = typeDefs.get(superType);
//       if (!superTypesSet) {
//         throw new Error(
//           `typeDefs need to have all types, but don't have the supertype ${superTypes}.`
//         );
//       }
//       if (superTypesSet.has(subType)) {
//         return true;
//       }
//       // Else keep looking...
//     }
//   }
//   return false;
// }

// // Every subtype is in a superType.
// export function nonStrictTypeSetIsSubsetOf<TypeName>(
//   typeDefs: Map<TypeName, Set<TypeName>>,
//   subTypes: Set<TypeName>,
//   superTypes: Set<TypeName>
// ): boolean {
//   for (const subType of subTypes) {
//     if (!nonStrictSubtypeOfTypeset(typeDefs, subType, superTypes)) {
//       return false;
//     }
//   }
//   return true;
// }

// Every subtype is in a superType.
export function typeSetIsSubsetOf<TypeName>(
  decendentMap: Map<TypeName, Set<TypeName>>,
  subTypes: Set<TypeName>,
  superTypes: Set<TypeName>
): boolean {
  const flatTys1 = flattenTypeset(decendentMap, subTypes);
  const flatTys2 = flattenTypeset(decendentMap, superTypes);
  return flatTys1.difference(flatTys2).size === 0;
}

export function typesetSymmetricDifference<TypeName>(
  // A map from types to every type in it.
  typeDef: TypeDef<TypeName>,
  // decendentMap: Map<TypeName, Set<TypeName>>,
  tys1: Set<TypeName>,
  tys2: Set<TypeName>
): Set<TypeName> {
  const flatTys1 = flattenTypeset(typeDef.decendent, tys1);
  const flatTys2 = flattenTypeset(typeDef.decendent, tys2);
  return flatTys1.symmetricDifference(flatTys2);
}

export function typesetIntersection<TypeName>(
  // A map from types to every type in it.
  typeDef: TypeDef<TypeName>,
  tys1: Set<TypeName>,
  tys2: Set<TypeName>
): Set<TypeName> {
  const flatTys1 = flattenTypeset(typeDef.decendent, tys1);
  const flatTys2 = flattenTypeset(typeDef.decendent, tys2);
  return flatTys1.intersection(flatTys2);
  // let allSubtypes = new Set<TypeName>();
  // for (const ty1 of tys1) {
  //   const ty1s = nonStrictTypeIsInSet(typeDefs, ty1, tys2);
  //   allSubtypes = allSubtypes.union(ty1s);
  // }
  // return allSubtypes;
}

// TODO: consider a faster implementation that avoid flattening when not needed...
export function typesetEquality<TypeName>(
  // A map from types to every type in it.
  typeDef: TypeDef<TypeName>,
  tys1: Set<TypeName>,
  tys2: Set<TypeName>
): boolean {
  return typesetSymmetricDifference(typeDef, tys1, tys2).size === 0;
}

export function stringifyTypes<TypeName>(types: Set<TypeName>) {
  if (types.size === 0) {
    return '*never*';
  } else {
    const typesList = [...types].sort();
    // if (typesList.length === 1) {
    //   const ty = typesList[0];
    //   // We can omit the universal type
    //   return ty === universalType ? '' : ty;
    // } else {
    return `${typesList.join('|')}`;
    // }
  }
}

export function stringifyRelation<TypeName, VarName, RelName>(
  r: Relation<TypeName, VarName, RelName>
) {
  const argsString = r.args
    .map((a) => {
      const typeString = stringifyTypes(a.varTypes);
      // Universal type can just be ommitted when writing relation.
      return `${a.varName}${typeString === universalType ? '' : ':' + typeString}`;
    })
    .join(' ');
  return `${r.relName} ${argsString}`;
}

const relRegexp = new RegExp(/\s*(?<relName>\S*)\s+(?<argsString>((\_|\?)\S+\s*)*)/);
type RelMatch = { relName: string; argsString: string };
const argsSplitRegexp = new RegExp(/\s+/);
const argumentRegexp = new RegExp(/(?<varName>[\_\?][^ \t\r\n\f\:]+)(\:(?<varTypesString>\S+))?/);

export function parseTypeSet(typesetString: string): Set<string> {
  return new Set<string>(typesetString.split('|'));
}

export function parseTypeSetArgs<TypeName extends string>(
  argTypeStrings: TypeName[]
): Set<TypeName>[] {
  return argTypeStrings.map((argString) => new Set<TypeName>(argString.split('|') as TypeName[]));
}

export function initRelationMap<RelName extends string, TypeName extends string>(
  relSpec: RelTypeArgsSpec<RelName, TypeName>
): Map<RelName, Set<TypeName>[]> {
  const relations = new Map<RelName, Set<TypeName>[]>();
  for (const relName of Object.keys(relSpec)) {
    relations.set(relName as RelName, parseTypeSetArgs<TypeName>(relSpec[relName as RelName]));
  }
  return relations;
}

export function parseRel<TypeName extends string, VarName extends string, RelName extends string>(
  relString: string
): Relation<TypeName, VarName, RelName> {
  const match = relString.match(relRegexp)?.groups as RelMatch;
  if (!match) {
    throw new Error(`'${relString}' does not match a relation.`);
  }
  const { relName, argsString } = match;
  const argList = argsString.split(argsSplitRegexp);
  const args = argList
    .map((argNameAndType) => {
      // TODO: document when this happens when... does it happen?
      if (argNameAndType === '') {
        return null;
      }
      const argMatch = argNameAndType.match(argumentRegexp)?.groups as RelArgumentMatch;
      if (!argMatch) {
        console.warn(`'${argNameAndType}' does not match the argumentRegexp.`);
        return null;
      }
      // Note: when no type is set, argMatch.varTypes is undefined. In such
      // cases, we treat it as `universalType`.
      const varTypes = parseTypeSet(argMatch.varTypesString || universalType) as Set<TypeName>;
      const varName = argMatch.varName as VarName;
      const relArgument: RelArgument<TypeName, VarName> = {
        varName,
        varTypes,
      };
      return relArgument;
    })
    .filter((relArgument) => relArgument !== null) as RelArgument<TypeName, VarName>[];
  return { relName, args } as Relation<TypeName, VarName, RelName>;
}
