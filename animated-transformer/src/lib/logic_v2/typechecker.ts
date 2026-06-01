/* Copyright 2026 Google LLC. All Rights Reserved.

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

import {
  Term,
  TermKind,
  TypeKind,
  BindingDef,
  DisjunctionDef,
  ConjunctionDef,
  TypeDef,
  Literal
} from './logic_data';
import { printTerm } from './printer';
import { parseTerm, getBaseTypeName, getFreeVars, Context, allTypes, ConjunctionData } from './logic';
import { evaluateTerm } from './evaluator';

/**
 * Recursively resolves the underlying base type name of a given type name.
 * If the type name refers to a constant let-binding term, it returns the inferred 
 * type of that binding; otherwise, it returns the type name itself.
 */
export function getBaseType(ctxt: Context, typeName: string): string {
  if (ctxt.termDefinitions && typeName in ctxt.termDefinitions) {
    return getBaseType(ctxt, ctxt.termDefinitions[typeName].typ);
  }
  return typeName;
}

/**
 * Resolves the parent sum type (disjunction type) for a given type name or constructor name.
 * For example:
 * - Given constructor "animal" of sum type "item", it returns "item".
 * - Given a sum type "item" itself, it returns "item".
 */
export function getParentSumType(ctxt: Context, typeName: string): string {
  const def = ctxt.getRawData().constructors[typeName] ?? ctxt.getRawData().types[typeName];
  if (def) {
    if (def.kind === TypeKind.Conjunction) {
      return (def as ConjunctionDef).productTypeName.split('_')[0];
    }
    if (def.kind === TypeKind.Binding) {
      const bound = (def as BindingDef).boundType;
      if (bound.kind === TypeKind.Conjunction) {
        return (bound as ConjunctionDef).productTypeName.split('_')[0];
      }
      if (bound.kind === TypeKind.Disjunction) {
        return (bound as DisjunctionDef).sumTypeName;
      }
    }
    if (def.kind === TypeKind.Disjunction) {
      return (def as DisjunctionDef).sumTypeName;
    }
  }
  return typeName;
}

/**
 * Returns whether the specified type name corresponds to a sum type (DisjunctionDef) 
 * in the context's literals/types registry.
 */
export function isSumTypeName(ctxt: Context, typeName: string): boolean {
  const typeDef = ctxt.getRawData().types[typeName] ?? ctxt.getRawData().constructors[typeName];
  if (typeDef) {
    return typeDef.kind === TypeKind.Disjunction || (typeDef.kind === TypeKind.Binding && (typeDef as BindingDef).boundType.kind === TypeKind.Disjunction);
  }
  return false;
}

export function isSubtype(ctxt: Context, sub: string, parent: string): boolean {
  if (sub === parent) return true;
  const parentTypeDef = ctxt.getRawData().types[parent];
  if (parentTypeDef) {
    const disj = parentTypeDef.kind === TypeKind.Binding 
      ? (parentTypeDef.boundType as DisjunctionDef) 
      : (parentTypeDef as DisjunctionDef);
    if (disj.kind === TypeKind.Disjunction && disj.subUnions) {
      if (disj.subUnions.has(sub)) return true;
      for (const u of disj.subUnions) {
        if (isSubtype(ctxt, sub, u)) return true;
      }
    }
  }
  return false;
}

/**
 * Performs a set-theoretic, semantic subtyping compatibility check:
 * returns true if the `actual` type is a subtype of (or equal to) the `expected` type.
 * 
 * Subtyping rules enforced:
 * 1. Variable/Wildcard matching: Wildcards '*' or logic variables match anything.
 * 2. Union/Sum Subtyping: A variant constructor (Conjunction) is a subtype of its 
 *    parent sum type union (Disjunction) (e.g., `rock` is a subtype of `item`).
 * 3. Constructor Covariance: Constructor terms of the same constructor name match 
 *    if all positional and named arguments are pairwise subtypes.
 * 4. Nullary Constructor type reference: A constructor type used as a type constraint 
 *    without arguments (e.g., `animal`) matches any concrete term of that constructor 
 *    (e.g., `animal(monkey)`).
 */
export function matchTypes(ctxt: Context, actual: Term | string | undefined, expected: Term | string | undefined): boolean {
  if (!actual || !expected) return false;

  const actualTerm = typeof actual === 'string' ? parseTerm(actual, ctxt) : actual;
  const expectedTerm = typeof expected === 'string' ? parseTerm(expected, ctxt) : expected;

  const isAllType = (t: Term) => t.kind === TermKind.Literal && t.literalName === '*';
  if (isAllType(actualTerm) || isAllType(expectedTerm)) return true;

  if (actualTerm.kind === TermKind.Variable) {
    const actualType = ctxt.variables[actualTerm.varName] ?? (actualTerm.varName in ctxt.linearResources ? parseTerm(ctxt.linearResources[actualTerm.varName], ctxt) : { kind: TermKind.Literal, literalName: '*', unNamedArgs: [], namedArgs: {} });
    return isAllType(actualType as Term) || matchTypes(ctxt, actualType, expectedTerm);
  }
  if (expectedTerm.kind === TermKind.Variable) {
    const expectedType = ctxt.variables[expectedTerm.varName] ?? (expectedTerm.varName in ctxt.linearResources ? parseTerm(ctxt.linearResources[expectedTerm.varName], ctxt) : { kind: TermKind.Literal, literalName: '*', unNamedArgs: [], namedArgs: {} });
    return isAllType(expectedType as Term) || matchTypes(ctxt, actualTerm, expectedType);
  }

  actual = actualTerm;
  expected = expectedTerm;

  if (actual.kind === TermKind.Literal && expected.kind === TermKind.Literal) {
    if (actual.literalName !== expected.literalName) {
      const actualBase = getParentSumType(ctxt, actual.literalName);
      const expectedBase = getParentSumType(ctxt, expected.literalName);
      if (isSubtype(ctxt, actualBase, expectedBase)) {
        const actualTypeDef = ctxt.getRawData().constructors[actual.literalName] ?? ctxt.getRawData().types[actual.literalName];
        const expectedTypeDef = ctxt.getRawData().constructors[expected.literalName] ?? ctxt.getRawData().types[expected.literalName];

        const isActualConstr = actualTypeDef && (actualTypeDef.kind === TypeKind.Conjunction || (actualTypeDef.kind === TypeKind.Binding && (actualTypeDef as BindingDef).boundType.kind === TypeKind.Conjunction));
        const isExpectedSumType = expectedTypeDef && (expectedTypeDef.kind === TypeKind.Disjunction || (expectedTypeDef.kind === TypeKind.Binding && (expectedTypeDef as BindingDef).boundType.kind === TypeKind.Disjunction));

        if (isActualConstr && isExpectedSumType) {
          try {
            const actualSumType = parseTerm(inferType(ctxt, actual), ctxt);
            return matchTypes(ctxt, actualSumType, expected);
          } catch (e) {}
        }

        const isExpectedConstr = expectedTypeDef && (expectedTypeDef.kind === TypeKind.Conjunction || (expectedTypeDef.kind === TypeKind.Binding && (expectedTypeDef as BindingDef).boundType.kind === TypeKind.Conjunction));
        const isActualSumType = actualTypeDef && (actualTypeDef.kind === TypeKind.Disjunction || (actualTypeDef.kind === TypeKind.Binding && (actualTypeDef as BindingDef).boundType.kind === TypeKind.Disjunction));

        if (isActualSumType && isExpectedConstr) {
          try {
            const expectedSumType = parseTerm(inferType(ctxt, expected), ctxt);
            return matchTypes(ctxt, actual, expectedSumType);
          } catch (e) {}
        }

        if (isActualSumType && isExpectedSumType) {
          return true;
        }

        if (isActualConstr && isExpectedConstr) {
          return false;
        }
      }

      if (!isSubtype(ctxt, actualBase, expectedBase)) {
        const actualTypeDef = ctxt.getRawData().types[actual.literalName];
        const expectedTypeDef = ctxt.getRawData().types[expected.literalName];
        if (actualTypeDef && expectedTypeDef && isSubtype(ctxt, actual.literalName, expected.literalName)) {
          return true;
        }
        return false;
      }
    }

    if (actual.literalName === expected.literalName) {
      if (expected.unNamedArgs.length === 0 && Object.keys(expected.namedArgs).length === 0) {
        return true;
      }
    }

    if (actual.unNamedArgs.length !== expected.unNamedArgs.length) return false;
    for (let i = 0; i < actual.unNamedArgs.length; i++) {
      if (!matchTypes(ctxt, actual.unNamedArgs[i], expected.unNamedArgs[i])) return false;
    }

    const actualNamedKeys = Object.keys(actual.namedArgs);
    const expectedNamedKeys = Object.keys(expected.namedArgs);
    if (actualNamedKeys.length !== expectedNamedKeys.length) return false;
    for (const k of actualNamedKeys) {
      if (!matchTypes(ctxt, actual.namedArgs[k], expected.namedArgs[k])) return false;
    }

    return true;
  }

  return false;
}


/**
 * Recursively substitutes logic/type variables in a term with their concrete 
 * substitutions defined in the `subst` dictionary.
 */
export function substitute(term: Term, subst: { [name: string]: Term }): Term {
  if (term.kind === TermKind.Variable) {
    if (term.varName in subst) return subst[term.varName];
    return term;
  }
  if (term.kind === TermKind.Literal && term.unNamedArgs.length === 0 && Object.keys(term.namedArgs).length === 0) {
    if (term.literalName in subst) return subst[term.literalName];
  }
  const unNamedArgs = term.unNamedArgs.map(arg => substitute(arg, subst));
  const namedArgs: { [argName: string]: Term } = {};
  for (const [k, v] of Object.entries(term.namedArgs)) {
    namedArgs[k] = substitute(v, subst);
  }
  return {
    ...term,
    unNamedArgs,
    namedArgs,
  };
}

/**
 * Performs unification between a `formal` pattern term and an `actual` value term.
 * Synthesizes substitution bindings for logic variables in the `subst` dictionary.
 * If unification is not possible, it exits silently (leaving substitutions unchanged).
 */
export function unify(
  ctxt: Context,
  formal: Term | undefined,
  actual: Term | undefined,
  subst: { [name: string]: Term }
): void {
  if (!formal || !actual) return;
  const isWildcard = (t: Term) => t.kind === TermKind.Literal && t.literalName === '*';
  if (isWildcard(formal) || isWildcard(actual)) return;

  if (formal.kind === TermKind.Variable) {
    const varName = formal.varName;
    if (!(varName in subst)) {
      subst[varName] = actual;
    }
    return;
  }

  if (formal.kind === TermKind.Literal && formal.unNamedArgs.length === 0 && Object.keys(formal.namedArgs).length === 0) {
    const constrName = formal.literalName;
    if (!(constrName in subst)) {
      subst[constrName] = actual;
    }
    return;
  }

  if (formal.kind === TermKind.Literal && actual.kind === TermKind.Literal) {
    if (formal.literalName !== actual.literalName) {
      const formalBase = getParentSumType(ctxt, formal.literalName);
      const actualBase = getParentSumType(ctxt, actual.literalName);
      if (formalBase === actualBase || isSubtype(ctxt, actualBase, formalBase)) {
        const formalType = ctxt.getRawData().types[formal.literalName] ?? ctxt.getRawData().constructors[formal.literalName];
        const isFormalSumType = formalType && (formalType.kind === TypeKind.Disjunction || (formalType.kind === TypeKind.Binding && (formalType as BindingDef).boundType.kind === TypeKind.Disjunction));
        const actualType = ctxt.getRawData().constructors[actual.literalName] ?? ctxt.getRawData().types[actual.literalName];
        const isActualConstr = actualType && (actualType.kind === TypeKind.Conjunction || (actualType.kind === TypeKind.Binding && (actualType as BindingDef).boundType.kind === TypeKind.Conjunction));

        const isFormalConstr = formalType && (formalType.kind === TypeKind.Conjunction || (formalType.kind === TypeKind.Binding && (formalType as BindingDef).boundType.kind === TypeKind.Conjunction));
        const isActualSumType = actualType && (actualType.kind === TypeKind.Disjunction || (actualType.kind === TypeKind.Binding && (actualType as BindingDef).boundType.kind === TypeKind.Disjunction));

        if (isFormalSumType && isActualConstr) {
          try {
            const actualSumType = parseTerm(inferType(ctxt, actual), ctxt);
            return unify(ctxt, formal, actualSumType, subst);
          } catch (e) {}
        }

        if (isFormalSumType && isActualSumType) {
          return;
        }

        if (isFormalConstr && isActualConstr) {
          return;
        }
      }

      if (formalBase !== actualBase && !isSubtype(ctxt, actualBase, formalBase)) {
        if (formal.unNamedArgs.length === 0 && Object.keys(formal.namedArgs).length === 0) {
          const constrName = formal.literalName;
          if (!(constrName in subst)) {
            subst[constrName] = actual;
            return;
          }
        }
        return;
      }
    }

    if (formal.unNamedArgs.length === actual.unNamedArgs.length) {
      for (let i = 0; i < formal.unNamedArgs.length; i++) {
        unify(ctxt, formal.unNamedArgs[i], actual.unNamedArgs[i], subst);
      }
    }
    for (const k of Object.keys(formal.namedArgs)) {
      if (k in actual.namedArgs) {
        unify(ctxt, formal.namedArgs[k], actual.namedArgs[k], subst);
      }
    }
  }
}

/**
 * Validates the well-foundedness of all registered types in the context.
 * Throws an error if any recursive type is defined without a base case (e.g., 
 * if a type cannot be constructed without depending infinitely on itself).
 */
export function validateContext(ctxt: Context): void {
  const wellFounded = new Set<string>();
  const types = Object.keys(ctxt.types);

  let progress = true;
  while (progress) {
    progress = false;
    for (const typeName of types) {
      if (wellFounded.has(typeName)) {
        continue;
      }
      const typeDef = ctxt.getRawData().types[typeName];
      const disj = typeDef.kind === TypeKind.Binding ? (typeDef.boundType as DisjunctionDef) : (typeDef as DisjunctionDef);
      const constructors = Object.values(disj.constructors);

      let hasWellFoundedConstructor = false;
      if (constructors.length > 0) {
        hasWellFoundedConstructor = constructors.some(c => {
          const argTypes = Object.values(c.arguments);
          return argTypes.every(argType => {
            const baseName = getBaseTypeName(argType);
            return !ctxt.getRawData().types[baseName] || wellFounded.has(baseName);
          });
        });
      }

      let hasWellFoundedSubUnion = false;
      if (disj.subUnions && disj.subUnions.size > 0) {
        for (const sub of disj.subUnions) {
          if (wellFounded.has(sub)) {
            hasWellFoundedSubUnion = true;
            break;
          }
        }
      }

      if (hasWellFoundedConstructor || hasWellFoundedSubUnion) {
        wellFounded.add(typeName);
        progress = true;
      }
    }
  }

  const invalidTypes = types.filter(typeName => !wellFounded.has(typeName));
  if (invalidTypes.length > 0) {
    throw new Error(
      `The following types have no base case (all of their constructors depend on the types themselves directly or indirectly): ${invalidTypes.join(', ')}`
    );
  }
}

/**
 * Transactional validator for newly added types and constructors.
 * Verifies that the union of existing type constructors and newly added constructors
 * remains well-founded, throwing an error if a recursive cycle without a base case is formed.
 */
export function validateAddedTypes(ctxt: Context, constructors: ConjunctionData[]): void {
  const newTypes = new Set(constructors.map(c => c.createdTypeName));
  const wellFounded = new Set<string>();

  const newConstructorsMap = new Map<string, ConjunctionDef[]>();
  for (const typeName of newTypes) {
    const typeDef = ctxt.getRawData().types[typeName];
    const disj = typeDef
      ? (typeDef.kind === TypeKind.Binding ? ((typeDef as BindingDef).boundType as DisjunctionDef) : (typeDef as DisjunctionDef))
      : null;
    const existingConstrs = disj ? Object.values(disj.constructors) : [];
    const addedConstrs = constructors
      .filter(c => c.createdTypeName === typeName)
      .map(c => {
        const termArgs: { [argName: string]: Term } = {};
        for (const [k, v] of Object.entries(c.arguments)) {
          termArgs[k] = typeof v === 'string' ? parseTerm(v, ctxt) : v;
        }
        return {
          kind: TypeKind.Conjunction as const,
          constructorName: c.constructorName,
          productTypeName: `${typeName}_${c.constructorName}`,
          arguments: termArgs,
          argOrder: c.argOrder,
        };
      });

    const combined = new Map<string, ConjunctionDef>();
    for (const c of existingConstrs) {
      combined.set(c.constructorName, c);
    }
    for (const c of addedConstrs) {
      combined.set(c.constructorName, c);
    }

    newConstructorsMap.set(typeName, Array.from(combined.values()));
  }

  let progress = true;
  while (progress) {
    progress = false;
    for (const typeName of newTypes) {
      if (wellFounded.has(typeName)) {
        continue;
      }
      const typeConstrs = newConstructorsMap.get(typeName) || [];
      const typeDef = ctxt.getRawData().types[typeName];
      const disj = typeDef
        ? (typeDef.kind === TypeKind.Binding ? ((typeDef as BindingDef).boundType as DisjunctionDef) : (typeDef as DisjunctionDef))
        : null;

      let hasWellFoundedConstructor = false;
      if (typeConstrs.length > 0) {
        hasWellFoundedConstructor = typeConstrs.some(c => {
          const argTypes = Object.values(c.arguments);
          return argTypes.every(argType => {
            const baseName = getBaseTypeName(argType);
            return !newTypes.has(baseName) || wellFounded.has(baseName);
          });
        });
      }

      let hasWellFoundedSubUnion = false;
      if (disj && disj.subUnions && disj.subUnions.size > 0) {
        for (const sub of disj.subUnions) {
          if (!newTypes.has(sub) || wellFounded.has(sub)) {
            hasWellFoundedSubUnion = true;
            break;
          }
        }
      }

      if (hasWellFoundedConstructor || hasWellFoundedSubUnion) {
        wellFounded.add(typeName);
        progress = true;
      }
    }
  }

  const invalidTypes = Array.from(newTypes).filter(typeName => !wellFounded.has(typeName));
  if (invalidTypes.length > 0) {
    throw new Error(
      `The following new or modified types have no base case: ${invalidTypes.join(', ')}`
    );
  }
}

/**
 * Performs type inference on a logic term within the given context.
 * Recursively deduces types for logic variables, constructor terms, and pattern-matched 
 * function calls, returning the string name of the inferred principal type.
 */
export class TypeChecker {
  private readonly varsTerms: { [varName: string]: Term } = {};

  constructor(
    private readonly ctxt: Context,
    varTypes: { [varName: string]: Term | string } = {}
  ) {
    for (const [k, v] of Object.entries(varTypes)) {
      this.varsTerms[k] = typeof v === 'string' ? parseTerm(v, ctxt) : v;
    }
  }

  /**
   * Performs type inference on a logic term.
   */
  infer(t: Term, vars: { [varName: string]: Term } = this.varsTerms): string {
    if (t.kind === TermKind.Variable) {
      const typeName = vars[t.varName] ?? this.ctxt.variables[t.varName] ?? this.ctxt.linearResources[t.varName];
      if (!typeName) {
        throw new Error(`Variable or resource '${t.varName}' has no declared type.`);
      }
      return typeof typeName === 'string' ? typeName : printTerm(typeName, { ctxt: this.ctxt });
    }

    if (t.kind === TermKind.Literal && this.ctxt.termDefinitions && t.literalName in this.ctxt.termDefinitions) {
      return this.ctxt.termDefinitions[t.literalName].typ;
    }

    // Locate constructor name in ctxt constructors or types or functions
    let foundConstructor: ConjunctionDef | null = null;
    const constructorTypeDef = this.ctxt.getRawData().constructors[t.literalName] ?? this.ctxt.getRawData().types[t.literalName];
    if (constructorTypeDef) {
      const conj = constructorTypeDef.kind === TypeKind.Binding ? (constructorTypeDef.boundType as ConjunctionDef) : constructorTypeDef;
      if (conj.kind === TypeKind.Conjunction) {
        foundConstructor = conj;
      }
    }

    if (!foundConstructor) {
      const func = this.ctxt.getRawData().functions[t.literalName];
      if (func) {
        try {
          const evaluated = evaluateTerm(this.ctxt, t);
          if (evaluated !== t && (evaluated.kind !== TermKind.Literal || evaluated.literalName !== t.literalName)) {
            return this.infer(evaluated, vars);
          }
        } catch (e) {}

        const firstClause = func.clauses[0];
        if (firstClause) {
          const subVarTypes: { [name: string]: Term } = { ...vars };
          for (let i = 0; i < Math.min(firstClause.patterns.length, t.unNamedArgs.length); i++) {
            const pat = firstClause.patterns[i];
            const arg = t.unNamedArgs[i];
            const varName = pat.kind === TermKind.Variable ? pat.varName : (pat.kind === TermKind.Literal ? pat.literalName : '');
            if (varName) {
              subVarTypes[varName] = parseTerm(this.infer(arg, vars), this.ctxt);
            }
          }
          try {
            return this.infer(firstClause.body, subVarTypes);
          } catch (e) {
            for (const clause of func.clauses) {
              if (!getFreeVars(clause.body).has(t.literalName) && !printTerm(clause.body).includes(t.literalName)) {
                const subVarTypes2: { [name: string]: Term } = { ...vars };
                for (let i = 0; i < Math.min(clause.patterns.length, t.unNamedArgs.length); i++) {
                  const pat = clause.patterns[i];
                  const arg = t.unNamedArgs[i];
                  const varName2 = pat.kind === TermKind.Variable ? pat.varName : (pat.kind === TermKind.Literal ? pat.literalName : '');
                  if (varName2) {
                    subVarTypes2[varName2] = parseTerm(this.infer(arg, vars), this.ctxt);
                  }
                }
                try {
                  return this.infer(clause.body, subVarTypes2);
                } catch (e2) {}
              }
            }
          }
        }
        return 'nat';
      }

      throw new Error(`Unknown constructor: '${t.literalName}'`);
    }

    const c = foundConstructor;
    const argNames = c.argOrder ?? Object.keys(c.arguments).sort();
    if (t.unNamedArgs.length > argNames.length) {
      throw new Error(
        `Too many positional arguments for constructor '${c.constructorName}': expected at most ${argNames.length}, got ${t.unNamedArgs.length}`
      );
    }

    const matchedArgs = new Map<string, Term>();
    for (let i = 0; i < t.unNamedArgs.length; i++) {
      matchedArgs.set(argNames[i], t.unNamedArgs[i]);
    }

    for (const [argName, argTerm] of Object.entries(t.namedArgs)) {
      if (!(argName in c.arguments)) {
        throw new Error(
          `Unknown named argument '${argName}' for constructor '${c.constructorName}'`
        );
      }
      if (matchedArgs.has(argName)) {
        throw new Error(
          `Duplicate argument '${argName}' for constructor '${c.constructorName}' (specified both positionally and by name)`
        );
      }
      matchedArgs.set(argName, argTerm);
    }

    for (const argName of Object.keys(c.arguments)) {
      if (!matchedArgs.has(argName)) {
        throw new Error(
          `Missing argument '${argName}' for constructor '${c.constructorName}'`
        );
      }
    }

    const subst: { [name: string]: Term } = {};
    for (const [argName, argTerm] of matchedArgs.entries()) {
      const formalType = c.arguments[argName];
      try {
        const formalTypeTerm = typeof formalType === 'string' ? parseTerm(formalType, this.ctxt) : formalType;
        const actualType = this.infer(argTerm, vars);
        const actualTypeTerm = parseTerm(actualType, this.ctxt);
        unify(this.ctxt, formalTypeTerm, actualTypeTerm, subst);
      } catch (e) {}
    }

    const T = c.productTypeName.split('_')[0];
    const ctxtType = this.ctxt.getRawData().types[T];
    if (ctxtType) {
      const typeParamOrder = ctxtType.kind === TypeKind.Binding ? (ctxtType as BindingDef).paramOrder : [];
      if (typeParamOrder.length > 0) {
        const actualParams = typeParamOrder.map(p => {
          const val = subst[p] ?? allTypes;
          return val;
        });
        return printTerm({
          kind: TermKind.Literal,
          literalName: T,
          unNamedArgs: actualParams,
          namedArgs: {},
        }, { ctxt: this.ctxt });
      }
    }

    return T;
  }

  /**
   * Strictly check that a given logic term matches the `expected` type.
   */
  check(t: Term, expected: Term): void {
    if (t.kind === TermKind.Variable) {
      const actualType = this.infer(t, this.varsTerms);
      if (!matchTypes(this.ctxt, actualType, expected)) {
        throw new Error(
          `Type mismatch for variable '${t.varName}': expected '${printTerm(expected, { ctxt: this.ctxt })}', got '${actualType}'`
        );
      }
      return;
    }

    const baseExpectedType = expected.kind === TermKind.Literal ? getBaseType(this.ctxt, expected.literalName) : '*';
    const ctxtType = this.ctxt.getRawData().types[baseExpectedType];
    if (ctxtType) {
      const disj = ctxtType.kind === TypeKind.Binding ? (ctxtType.boundType as DisjunctionDef) : (ctxtType as DisjunctionDef);
      const c = disj.constructors ? disj.constructors[t.literalName] : null;
      if (c) {
        const argNames = c.argOrder ?? Object.keys(c.arguments).sort();
        if (t.unNamedArgs.length > argNames.length) {
          throw new Error(
            `Too many positional arguments for constructor '${c.constructorName}': expected at most ${argNames.length}, got ${t.unNamedArgs.length}`
          );
        }

        const matchedArgs = new Map<string, Term>();
        for (let i = 0; i < t.unNamedArgs.length; i++) {
          matchedArgs.set(argNames[i], t.unNamedArgs[i]);
        }

        for (const [argName, argTerm] of Object.entries(t.namedArgs)) {
          if (!(argName in c.arguments)) {
            throw new Error(
              `Unknown named argument '${argName}' for constructor '${c.constructorName}'`
            );
          }
          if (matchedArgs.has(argName)) {
            throw new Error(
              `Duplicate argument '${argName}' for constructor '${c.constructorName}' (specified both positionally and by name)`
            );
          }
          matchedArgs.set(argName, argTerm);
        }

        for (const argName of Object.keys(c.arguments)) {
          if (!matchedArgs.has(argName)) {
            throw new Error(
              `Missing argument '${argName}' for constructor '${c.constructorName}'`
            );
          }
        }

        const subst: { [name: string]: Term } = {};
        if (expected.kind === TermKind.Literal) {
          const typeParamOrder = ctxtType.kind === TypeKind.Binding ? (ctxtType as BindingDef).paramOrder : [];
          for (let i = 0; i < typeParamOrder.length; i++) {
            const paramName = typeParamOrder[i];
            if (i < expected.unNamedArgs.length) {
              subst[paramName] = expected.unNamedArgs[i];
            }
          }
        }

        for (const [argName, argTerm] of matchedArgs.entries()) {
          const expectedArgType = c.arguments[argName];
          const substitutedType = substitute(expectedArgType, subst) as Term;
          this.check(argTerm, substitutedType);
        }
        return;
      }
    }

    const isConstructor = (() => {
      const def = this.ctxt.getRawData().constructors[t.literalName] ?? this.ctxt.getRawData().types[t.literalName];
      if (def) {
        const conj = def.kind === TypeKind.Binding ? (def as BindingDef).boundType : def;
        return conj.kind === TypeKind.Conjunction;
      }
      return false;
    })();

    const inferredType = this.infer(t, this.varsTerms);
    const matches = isConstructor
      ? matchTypes(this.ctxt, t, expected)
      : matchTypes(this.ctxt, inferredType, expected);

    if (!matches) {
      throw new Error(
        `Type mismatch for constructor term '${t.literalName}': expected '${printTerm(expected, { ctxt: this.ctxt })}', got '${inferredType}'`
      );
    }
  }
}

/**
 * Performs type inference on a logic term within the given context.
 * Recursively deduces types for logic variables, constructor terms, and pattern-matched 
 * function calls, returning the string name of the inferred principal type.
 */
export function inferType(
  ctxt: Context,
  term: Term,
  varTypes: { [varName: string]: Term | string } = {}
): string {
  return new TypeChecker(ctxt, varTypes).infer(term);
}

/**
 * Strictly validates that a given logic term matches the `expectedType`.
 * Supports recursive checking, sum-type variant resolution, generic type parameter 
 * substitution, and custom constructor type refinement.
 * Throws a detailed descriptive Error if a type mismatch is encountered.
 */
export function typeCheck(
  ctxt: Context,
  term: Term,
  expectedType: Term | string,
  varTypes: { [varName: string]: Term | string } = {}
): void {
  const expectedTerm = typeof expectedType === 'string' ? parseTerm(expectedType, ctxt) : expectedType;
  new TypeChecker(ctxt, varTypes).check(term, expectedTerm);
}

// Helper imports for validation
