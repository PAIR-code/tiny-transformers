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

import {
  FilterStream,
  MatchersStream,
  Parser,
  RegexMatchers,
  Token,
  delimited,
  eof,
  fn,
  kind,
  matchOneOf,
  opt,
  or,
  preceded,
  repeat,
  repeatPlus,
  seq,
  tokenOf,
  withSep,
  withSepPlus,
} from 'mini-parse';

/**
 * Represents a Conjunctive Type (constructor), which is a product of named field arguments.
 * Example: cons(h: x, t: list(x))
 */
export type ConjunctiveType = {
  constructorName: string;
  createdTypeName: string;
  arguments: {
    [argName: string]: Term | string;
  };
  argOrder?: string[];
};

/**
 * Represents a Disjunctive Type (ADT), which is a sum (union) of conjunctive type constructors,
 * optionally parameterised by type parameters (generic types, e.g., <x>).
 */
export type DisjunctiveType = {
  typeParams?: { [paramName: string]: string };
  typeParamOrder?: string[];
  constructors: { [constructorName: string]: ConjunctiveType };
};

/**
 * The Context represents the unified logical context (traditional Γ).
 * It maintains:
 *  1. Algebraic type definitions (types)
 *  2. Term definition shortcuts/aliases (termDefinitions)
 *  3. Linear/intuitionistic variables (variables)
 *
 * Example of Custom Syntax:
 * ```
 * type nat = 0 | suc(n: nat);
 * type list<x> = nil | cons(h: x, t: list(x));
 *
 * let 2 = suc(suc(0));
 * ?l: list(nat);
 * ?y: _; 
 * ?m: list(?y);
 * ```
 */
export type Context = {
  types: { [typeName: string]: DisjunctiveType };
  termDefinitions: { [name: string]: { def: Term; typ: string } };
  variables: { [varName: string]: string };
};

export enum TermKind {
  Constructor = 'Constructor',
  Variable = 'Variable',
}

/**
 * Represents a constructor term application, supporting both positional
 * applications like `cons(suc(0), nil)` and record-style applications like
 * `node{ left = leaf, val = suc(0), right = leaf }`.
 */
export type ConstrTerm = {
  kind: TermKind.Constructor;
  constructorName: string;
  unNamedArgs: Term[];
  namedArgs: {
    [argName: string]: Term;
  };
};

/**
 * Represents a logical/type variable term, prefixed with `?` in the syntax.
 */
export type VarTerm = {
  kind: TermKind.Variable;
  varName: string;
};

export type Term = ConstrTerm | VarTerm;

/**
 * Creates a completely empty context.
 */
export function emptyContext(): Context {
  return {
    types: {},
    termDefinitions: {},
    variables: {},
  };
}

export function getBaseType(ctxt: Context, typeName: string): string {
  if (ctxt.termDefinitions && typeName in ctxt.termDefinitions) {
    return getBaseType(ctxt, ctxt.termDefinitions[typeName].typ);
  }
  return typeName;
}

export function getBaseTypeName(typeRef: Term | string): string {
  if (typeof typeRef === 'string') return typeRef;
  if (typeRef.kind === TermKind.Constructor) return typeRef.constructorName;
  return typeRef.varName;
}

export function getFreeVars(term: Term): Set<string> {
  const vars = new Set<string>();
  function visit(t: Term) {
    if (t.kind === TermKind.Variable) {
      vars.add(t.varName);
    } else {
      t.unNamedArgs.forEach(visit);
      Object.values(t.namedArgs).forEach(visit);
    }
  }
  visit(term);
  return vars;
}

export function getBaseTypeRef(ctxt: Context, typeRef: Term | string): Term | string {
  if (typeof typeRef === 'string') {
    if (ctxt.termDefinitions && typeRef in ctxt.termDefinitions) {
      return getBaseTypeRef(ctxt, ctxt.termDefinitions[typeRef].typ);
    }
    return typeRef;
  }
  if (typeRef.kind === TermKind.Constructor) {
    const baseName = getBaseType(ctxt, typeRef.constructorName);
    return {
      ...typeRef,
      constructorName: baseName,
    };
  }
  return typeRef;
}

export function matchTypes(ctxt: Context, actual: Term | string | undefined, expected: Term | string | undefined): boolean {
  if (!actual || !expected) return false;
  if (actual === '_' || expected === '_') return true;

  if (typeof actual === 'string') {
    actual = parseTerm(actual, ctxt);
  }
  if (typeof expected === 'string') {
    expected = parseTerm(expected, ctxt);
  }

  if (actual.kind === TermKind.Variable) {
    const actualType = ctxt.variables[actual.varName] ?? '_';
    return actualType === '_' || matchTypes(ctxt, actualType, expected);
  }
  if (expected.kind === TermKind.Variable) {
    const expectedType = ctxt.variables[expected.varName] ?? '_';
    return expectedType === '_' || matchTypes(ctxt, actual, expectedType);
  }

  if (actual.kind === TermKind.Constructor && expected.kind === TermKind.Constructor) {
    if (actual.constructorName !== expected.constructorName) {
      const actualBase = getBaseType(ctxt, actual.constructorName);
      const expectedBase = getBaseType(ctxt, expected.constructorName);
      if (actualBase !== expectedBase) return false;
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

export function substitute(term: Term | string, subst: { [name: string]: Term | string }): Term | string {
  if (typeof term === 'string') {
    if (term in subst) return subst[term];
    return term;
  }
  if (term.kind === TermKind.Variable) {
    if (term.varName in subst) return subst[term.varName];
    return term;
  }
  if (term.kind === TermKind.Constructor && term.unNamedArgs.length === 0 && Object.keys(term.namedArgs).length === 0) {
    if (term.constructorName in subst) return subst[term.constructorName];
  }
  const unNamedArgs = term.unNamedArgs.map(arg => {
    const r = substitute(arg, subst);
    return typeof r === 'string' ? parseTerm(r) : r;
  });
  const namedArgs: { [argName: string]: Term } = {};
  for (const [k, v] of Object.entries(term.namedArgs)) {
    const r = substitute(v, subst);
    namedArgs[k] = typeof r === 'string' ? parseTerm(r) : r;
  }
  return {
    ...term,
    unNamedArgs,
    namedArgs,
  };
}

export function unify(
  ctxt: Context,
  formal: Term | string | undefined,
  actual: Term | string | undefined,
  subst: { [name: string]: Term | string }
): void {
  if (!formal || !actual) return;
  if (formal === '_' || actual === '_') return;

  if (typeof formal === 'string') {
    formal = parseTerm(formal, ctxt);
  }
  if (typeof actual === 'string') {
    actual = parseTerm(actual, ctxt);
  }

  if (formal.kind === TermKind.Variable) {
    const varName = formal.varName;
    if (!(varName in subst)) {
      subst[varName] = actual;
    }
    return;
  }

  if (formal.kind === TermKind.Constructor && formal.unNamedArgs.length === 0 && Object.keys(formal.namedArgs).length === 0) {
    const constrName = formal.constructorName;
    if (!(constrName in subst)) {
      subst[constrName] = actual;
    }
    return;
  }

  if (formal.kind === TermKind.Constructor && actual.kind === TermKind.Constructor) {
    if (formal.constructorName !== actual.constructorName) {
      const formalBase = getBaseType(ctxt, formal.constructorName);
      const actualBase = getBaseType(ctxt, actual.constructorName);
      if (formalBase !== actualBase) {
        if (formal.unNamedArgs.length === 0 && Object.keys(formal.namedArgs).length === 0) {
          const constrName = formal.constructorName;
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
 * Validates a TypeContext to ensure there are no loop types or types with no base case
 * (i.e. all of their constructors recursively depend on themselves directly or indirectly).
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
      const constructors = Object.values(ctxt.types[typeName].constructors);
      if (constructors.length === 0) {
        continue;
      }

      const hasWellFoundedConstructor = constructors.some(c => {
        const argTypes = Object.values(c.arguments) as (Term | string)[];
        return argTypes.every(argType => {
          const baseName = getBaseTypeName(argType);
          return !ctxt.types[baseName] || wellFounded.has(baseName);
        });
      });

      if (hasWellFoundedConstructor) {
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
 * Compositionally validates that newly added constructors do not introduce types with no base case,
 * assuming that all pre-existing types in the context are already well-founded.
 */
export function validateAddedTypes(ctxt: Context, constructors: ConjunctiveType[]): void {
  const newTypes = new Set(constructors.map(c => c.createdTypeName));
  const wellFounded = new Set<string>();

  // Combine existing constructors in ctxt with the newly added ones for validation
  const newConstructorsMap = new Map<string, ConjunctiveType[]>();
  for (const typeName of newTypes) {
    const existingConstrs = ctxt.types[typeName]
      ? Object.values(ctxt.types[typeName].constructors)
      : [];
    const addedConstrs = constructors.filter(c => c.createdTypeName === typeName);

    const combined = new Map<string, ConjunctiveType>();
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
      if (typeConstrs.length === 0) {
        continue;
      }

      const hasWellFoundedConstructor = typeConstrs.some(c => {
        const argTypes = Object.values(c.arguments) as (Term | string)[];
        return argTypes.every(argType => {
          // An arg type is well-founded if it is not in newTypes (pre-existing or primitive)
          // or if we have already proven it is well-founded in this pass.
          const baseName = getBaseTypeName(argType);
          return !newTypes.has(baseName) || wellFounded.has(baseName);
        });
      });

      if (hasWellFoundedConstructor) {
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

export function extendContext(ctxt: Context, constructors: ConjunctiveType[]): Context {
  validateAddedTypes(ctxt, constructors);

  for (const c of constructors) {
    if (!(c.createdTypeName in ctxt.types)) {
      ctxt.types[c.createdTypeName] = { constructors: {} };
    }
    if (c.constructorName in ctxt.types[c.createdTypeName].constructors) {
      throw new Error(`Cannot add constructor twice: ${c.constructorName}`);
    }
    ctxt.types[c.createdTypeName].constructors[c.constructorName] = c;
  }

  return ctxt;
}

export function createContext(constructors: ConjunctiveType[]): Context {
  return extendContext(emptyContext(), constructors);
}

export function constr(
  constructorName: string,
  unNamedArgs: Term[] = [],
  namedArgs: { [argName: string]: Term } = {}
): ConstrTerm {
  return {
    kind: TermKind.Constructor,
    constructorName,
    unNamedArgs,
    namedArgs,
  };
}

export function variable(varName: string): VarTerm {
  return {
    kind: TermKind.Variable,
    varName,
  };
}

/**
 * Infers the type of a term from the context and variable type assignments.
 */
export function inferType(
  ctxt: Context,
  term: Term,
  varTypes: { [varName: string]: string } = {}
): string {
  if (term.kind === TermKind.Variable) {
    const typeName = varTypes[term.varName];
    if (!typeName) {
      throw new Error(`Variable '${term.varName}' has no declared type.`);
    }
    return typeName;
  }

  // Locate constructor name in ctxt
  let foundConstructor: ConjunctiveType | null = null;
  for (const typeName of Object.keys(ctxt.types)) {
    const c = ctxt.types[typeName].constructors[term.constructorName];
    if (c) {
      if (foundConstructor) {
        throw new Error(
          `Ambiguous constructor name: '${term.constructorName}' is defined in both '${foundConstructor.createdTypeName}' and '${typeName}'`
        );
      }
      foundConstructor = c;
    }
  }

  if (!foundConstructor) {
    throw new Error(`Unknown constructor: '${term.constructorName}'`);
  }

  const c = foundConstructor;

  // Match positional and named arguments
  const argNames = c.argOrder ?? Object.keys(c.arguments).sort();
  if (term.unNamedArgs.length > argNames.length) {
    throw new Error(
      `Too many positional arguments for constructor '${c.constructorName}': expected at most ${argNames.length}, got ${term.unNamedArgs.length}`
    );
  }

  const matchedArgs = new Map<string, Term>();
  for (let i = 0; i < term.unNamedArgs.length; i++) {
    matchedArgs.set(argNames[i], term.unNamedArgs[i]);
  }

  for (const [argName, argTerm] of Object.entries(term.namedArgs)) {
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

  // Deduce type parameters by unifying formal argument types with actual inferred types
  const subst: { [name: string]: Term | string } = {};
  for (const [argName, argTerm] of matchedArgs.entries()) {
    const formalType = c.arguments[argName];
    try {
      const actualType = inferType(ctxt, argTerm, varTypes);
      unify(ctxt, formalType, actualType, subst);
    } catch (e) {
      // If type inference fails on arguments, we just skip it
    }
  }

  const T = c.createdTypeName;
  const ctxtType = ctxt.types[T];
  if (ctxtType) {
    const typeParams = ctxtType.typeParamOrder ?? [];
    if (typeParams.length > 0) {
      const actualParams = typeParams.map(p => {
        const val = subst[p] ?? '_';
        return typeof val === 'string' ? parseTerm(val, ctxt) : val;
      });
      return printTerm({
        kind: TermKind.Constructor,
        constructorName: T,
        unNamedArgs: actualParams,
        namedArgs: {},
      });
    }
  }

  return T;
}

/**
 * Checks a term against an expected type under a context and variable type assignments.
 */
/**
 * Checks a term against an expected type under a context and variable type assignments.
 */
export function typeCheck(
  ctxt: Context,
  term: Term,
  expectedType: Term | string,
  varTypes: { [varName: string]: string } = {}
): void {
  if (term.kind === TermKind.Variable) {
    const actualType = inferType(ctxt, term, varTypes);
    if (!matchTypes(ctxt, actualType, expectedType)) {
      const expectedStr = typeof expectedType === 'string' ? expectedType : printTerm(expectedType);
      throw new Error(
        `Type mismatch for variable '${term.varName}': expected '${expectedStr}', got '${actualType}'`
      );
    }
    return;
  }

  // If it's a constructor term, we can check if its constructor is defined for the expectedType.
  // This resolves overloaded constructor names based on the expected type.
  const baseExpectedType = typeof expectedType === 'string'
    ? getBaseType(ctxt, expectedType)
    : (expectedType.kind === TermKind.Constructor ? getBaseType(ctxt, expectedType.constructorName) : '_');
  const ctxtType = ctxt.types[baseExpectedType];
  if (ctxtType) {
    const c = ctxtType.constructors[term.constructorName];
    if (c) {
      // Match positional and named arguments
      const argNames = c.argOrder ?? Object.keys(c.arguments).sort();
      if (term.unNamedArgs.length > argNames.length) {
        throw new Error(
          `Too many positional arguments for constructor '${c.constructorName}': expected at most ${argNames.length}, got ${term.unNamedArgs.length}`
        );
      }

      const matchedArgs = new Map<string, Term>();
      for (let i = 0; i < term.unNamedArgs.length; i++) {
        matchedArgs.set(argNames[i], term.unNamedArgs[i]);
      }

      for (const [argName, argTerm] of Object.entries(term.namedArgs)) {
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

      // Map type parameters to actual type arguments
      const subst: { [name: string]: Term | string } = {};
      if (typeof expectedType !== 'string' && expectedType.kind === TermKind.Constructor) {
        const typeParamOrder = ctxtType.typeParamOrder ?? [];
        for (let i = 0; i < typeParamOrder.length; i++) {
          const paramName = typeParamOrder[i];
          if (i < expectedType.unNamedArgs.length) {
            subst[paramName] = expectedType.unNamedArgs[i];
          }
        }
      }

      // Typecheck all arguments with substitution
      for (const [argName, argTerm] of matchedArgs.entries()) {
        const expectedArgType = c.arguments[argName];
        const substitutedType = substitute(expectedArgType, subst);
        typeCheck(ctxt, argTerm, substitutedType, varTypes);
      }
      return;
    }
  }

  // Fallback to inferring the type and comparing
  const inferredType = inferType(ctxt, term, varTypes);
  if (!matchTypes(ctxt, inferredType, expectedType)) {
    const expectedStr = typeof expectedType === 'string' ? expectedType : printTerm(expectedType);
    throw new Error(
      `Type mismatch for constructor term '${term.constructorName}': expected '${expectedStr}', got '${inferredType}'`
    );
  }
}

/**
 * Parses a TypeContext from a custom type declaration string.
 * Example:
 *   let nat = 0 | suc(?n:nat);
 *   let natList = nil | cons(?h: nat, ?t: natList);
 *   let tree = leaf | node{ ?left: tree, ?val: nat, ?right: tree };
 *   let 2 = suc(suc(0));
 *   ?x: 2;
 */
export function parseContext(src: string, existingCtxt?: Context): Context {
  const ctxt = existingCtxt ?? emptyContext();

  const logicTokens = new RegexMatchers({
    keyword: /let\b|type\b/,
    var: /\?[a-zA-Z_][a-zA-Z0-9_]*/,
    ident: /[a-zA-Z_][a-zA-Z0-9_]*/,
    number: /0|[1-9][0-9]*/,
    symbol: matchOneOf("= | { } : , ( ) ; < >"),
    ws: /\s+/,
  });

  const stream = new FilterStream(
    new MatchersStream(src, logicTokens),
    (t: Token) => t.kind !== "ws"
  );

  const ident = kind("ident");
  const constrName = or(kind("ident"), kind("number"));
  const typeNameParser = or(kind("ident"), kind("number"));

  const recordField = seq(kind("ident"), ":", fn(() => termParser)).map(r => ({ name: r[0], type: r[2] }));
  const recordArgs = delimited("{", withSep(",", recordField), "}");
  const parenArgs = delimited("(", withSep(",", recordField), ")");

  const constructorDecl = or(
    // Parenthesized style: suc(?n:nat) or cons(?h: nat, ?t: natList) or node(?left: tree, ?val: nat, ?right: tree)
    seq(constrName, parenArgs).map(r => {
      const name = r[0];
      const fields = r[1];
      const argumentsMap: { [name: string]: Term | string } = {};
      const argOrder: string[] = [];
      for (const f of fields) {
        argumentsMap[f.name] = f.type;
        argOrder.push(f.name);
      }
      return {
        constructorName: name,
        arguments: argumentsMap,
        argOrder,
      };
    }),
    // Zero-arg: 0 or leaf or nil
    constrName.map(name => {
      return {
        constructorName: name,
        arguments: {},
        argOrder: [],
      };
    })
  );

  const constrNameParser = or(kind("number"), kind("ident"));

  const termParser: Parser<any, Term> = fn(() => {
    return or(
      // Constructor with curly named arguments: C{ left = leaf, val = suc(0), right = leaf }
      seq(
        constrNameParser,
        delimited(
          "{",
          withSep(
            ",",
            or(
              seq(kind("ident"), "=", termParser).map(r => ({ name: r[0], val: r[2] })),
              kind("var").map(name => {
                const varName = name.substring(1);
                return {
                  name: varName,
                  val: {
                    kind: TermKind.Variable as const,
                    varName,
                  },
                };
              })
            )
          ),
          "}"
        )
      ).map(r => {
        const constructorName = r[0];
        const fields = r[1];
        const namedArgs: { [argName: string]: Term } = {};
        for (const f of fields) {
          namedArgs[f.name] = f.val;
        }
        return {
          kind: TermKind.Constructor as const,
          constructorName,
          unNamedArgs: [],
          namedArgs,
        };
      }),
      // Constructor with paren arguments: cons(suc(0), nil) or suc(suc(0))
      seq(
        constrNameParser,
        delimited("(", withSep(",", termParser), ")")
      ).map(r => {
        const constructorName = r[0];
        const args = r[1];
        return {
          kind: TermKind.Constructor as const,
          constructorName,
          unNamedArgs: args,
          namedArgs: {},
        };
      }),
      // Or simple term (parenthesized, zero-arg constructor, or variable)
      simpleTermParser
    );
  });

  const simpleTermParser: Parser<any, Term> = fn(() => {
    return or(
      // Parenthesized term
      delimited("(", termParser, ")"),
      // Zero-arg constructor
      constrNameParser.map(name => {
        return {
          kind: TermKind.Constructor as const,
          constructorName: name,
          unNamedArgs: [],
          namedArgs: {},
        };
      }),
      // Variable: starting with ?
      kind("var").map(name => {
        return {
          kind: TermKind.Variable as const,
          varName: name.substring(1),
        };
      })
    );
  });

  const typeParamDecl = seq(kind("ident"), opt(seq(":", typeNameParser))).map(r => ({
    name: r[0],
    type: r[1] ? r[1][1] : '_'
  }));
  const typeParamsParser = opt(delimited("<", withSep(",", typeParamDecl), ">"));

  const letTypeDecl = seq(
    "type",
    ident,
    typeParamsParser,
    "=",
    withSepPlus("|", constructorDecl),
    opt(";")
  ).map(r => {
    const typeName = r[1];
    const typeParamsList = r[2];
    const constructorsList = r[4];

    const typeParams: { [paramName: string]: string } = {};
    const typeParamOrder: string[] = [];
    if (typeParamsList) {
      for (const p of typeParamsList) {
        typeParams[p.name] = p.type;
        typeParamOrder.push(p.name);
      }
    }

    const constructors = constructorsList.map(c => ({ ...c, createdTypeName: typeName }));
    return {
      kind: 'Type' as const,
      typeName,
      typeParams,
      typeParamOrder,
      constructors,
    };
  });

  const letTermDecl = seq(
    "let",
    constrName,
    "=",
    termParser,
    opt(";")
  ).map(r => ({
    kind: 'Term' as const,
    termName: r[1],
    term: r[3],
  }));

  const varDecl = seq(
    kind("var"),
    ":",
    termParser,
    opt(";")
  ).map(r => ({
    kind: 'Var' as const,
    varName: r[0].substring(1),
    typeName: r[2],
  }));

  const declParser = or(letTypeDecl, letTermDecl, varDecl);

  const contextParser = seq(repeat(declParser), eof()).map(r => r[0]);

  const parsedDecls = contextParser.parse({ stream });
  if (!parsedDecls) {
    throw new Error("Failed to parse Context declarations");
  }

  // Process declarations progressively
  for (const decl of parsedDecls.value) {
    if (decl.kind === 'Type') {
      extendContext(ctxt, decl.constructors);
      if (decl.typeParamOrder.length > 0) {
        ctxt.types[decl.typeName].typeParams = decl.typeParams;
        ctxt.types[decl.typeName].typeParamOrder = decl.typeParamOrder;
      }
    } else if (decl.kind === 'Term') {
      const freeVars = getFreeVars(decl.term);
      for (const fv of freeVars) {
        if (!(fv in ctxt.variables)) {
          ctxt.variables[fv] = '_';
        }
      }
      const typeName = inferType(ctxt, decl.term, ctxt.variables);
      ctxt.termDefinitions[decl.termName] = { def: decl.term, typ: typeName };
    } else if (decl.kind === 'Var') {
      const typeRef = decl.typeName;
      const freeVars = getFreeVars(typeRef);
      for (const fv of freeVars) {
        if (!(fv in ctxt.variables)) {
          ctxt.variables[fv] = '_';
        }
      }
      ctxt.variables[decl.varName] = printTerm(typeRef);
    }
  }

  return ctxt;
}

/**
 * Prints a TypeContext in the custom type syntax.
 */
export function printContext(ctxt: Context): string {
  const declarations: string[] = [];

  // 1. Print Type Definitions
  for (const typeName of Object.keys(ctxt.types).sort()) {
    const typeConstruction = ctxt.types[typeName];
    const constrDecls: string[] = [];
    const constructorsList = Object.values(typeConstruction.constructors) as ConjunctiveType[];
    for (const c of constructorsList.sort((a, b) => a.constructorName.localeCompare(b.constructorName))) {
      const argKeys = c.argOrder ?? Object.keys(c.arguments).sort();
      if (argKeys.length === 0) {
        constrDecls.push(c.constructorName);
      } else {
        const fields = argKeys.map(k => {
          const typeVal = c.arguments[k];
          const typeStr = typeof typeVal === 'string' ? typeVal : printTerm(typeVal);
          return `${k}: ${typeStr}`;
        }).join(', ');
        constrDecls.push(`${c.constructorName}(${fields})`);
      }
    }

    // Print type parameters if defined using angle brackets
    let paramsStr = '';
    if (typeConstruction.typeParamOrder && typeConstruction.typeParams) {
      const params = typeConstruction.typeParamOrder
        .map(p => {
          const typ = typeConstruction.typeParams![p];
          return typ === '_' ? p : `${p}: ${typ}`;
        })
        .join(', ');
      paramsStr = `<${params}>`;
    }
    declarations.push(`type ${typeName}${paramsStr} = ${constrDecls.join(' | ')};`);
  }

  // 2. Print Term Definitions
  if (ctxt.termDefinitions) {
    for (const termName of Object.keys(ctxt.termDefinitions).sort()) {
      const termInfo = ctxt.termDefinitions[termName];
      declarations.push(`let ${termName} = ${printTerm(termInfo.def)};`);
    }
  }

  // 3. Print Variables
  if (ctxt.variables) {
    for (const varName of Object.keys(ctxt.variables).sort()) {
      const typeName = ctxt.variables[varName];
      declarations.push(`?${varName}: ${typeName};`);
    }
  }

  return declarations.join('\n');
}

/**
 * Parses a Term from a custom term string.
 */
export function parseTerm(src: string, constructors?: Set<string> | Context): Term {
  const termTokens = new RegexMatchers({
    keyword: /let\b|type\b/,
    var: /\?[a-zA-Z_][a-zA-Z0-9_]*/,
    ident: /[a-zA-Z_][a-zA-Z0-9_]*/,
    number: /0|[1-9][0-9]*/,
    symbol: matchOneOf("= | { } : , ( ) ;"),
    ws: /\s+/,
  });

  const stream = new FilterStream(
    new MatchersStream(src, termTokens),
    (t: Token) => t.kind !== "ws"
  );

  const constrNameParser = or(kind("number"), kind("ident"));

  const termParser: Parser<any, Term> = fn(() => {
    return or(
      // Constructor with curly named arguments: C{ left = leaf, val = suc(0), right = leaf }
      seq(
        constrNameParser,
        delimited(
          "{",
          withSep(
            ",",
            or(
              seq(kind("ident"), "=", termParser).map(r => ({ name: r[0], val: r[2] })),
              kind("var").map(name => {
                const varName = name.substring(1);
                return {
                  name: varName,
                  val: {
                    kind: TermKind.Variable as const,
                    varName,
                  },
                };
              })
            )
          ),
          "}"
        )
      ).map(r => {
        const constructorName = r[0];
        const fields = r[1];
        const namedArgs: { [argName: string]: Term } = {};
        for (const f of fields) {
          namedArgs[f.name] = f.val;
        }
        return {
          kind: TermKind.Constructor as const,
          constructorName,
          unNamedArgs: [],
          namedArgs,
        };
      }),
      // Constructor with paren arguments: cons(suc(0), nil) or suc(suc(0))
      seq(
        constrNameParser,
        delimited("(", withSep(",", termParser), ")")
      ).map(r => {
        const constructorName = r[0];
        const args = r[1];
        return {
          kind: TermKind.Constructor as const,
          constructorName,
          unNamedArgs: args,
          namedArgs: {},
        };
      }),
      // Or simple term (parenthesized, zero-arg constructor, or variable)
      simpleTermParser
    );
  });

  const simpleTermParser: Parser<any, Term> = fn(() => {
    return or(
      // Parenthesized term
      delimited("(", termParser, ")"),
      // Zero-arg constructor
      constrNameParser.map(name => {
        return {
          kind: TermKind.Constructor as const,
          constructorName: name,
          unNamedArgs: [],
          namedArgs: {},
        };
      }),
      // Variable: starting with ?
      kind("var").map(name => {
        return {
          kind: TermKind.Variable as const,
          varName: name.substring(1),
        };
      })
    );
  });

  const result = seq(termParser, eof()).parse({ stream });
  if (!result) {
    throw new Error("Failed to parse Term");
  }
  return result.value[0];
}

/**
 * Prints a Term in the custom term syntax.
 */
export function printTerm(term: Term, options?: { verbose?: boolean }): string {
  if (term.kind === TermKind.Variable) {
    return `?${term.varName}`;
  }

  const hasNamed = Object.keys(term.namedArgs).length > 0;
  if (hasNamed) {
    const fields = Object.entries(term.namedArgs)
      .map(([k, v]) => {
        const isConciseVar =
          !options?.verbose &&
          v.kind === TermKind.Variable &&
          v.varName === k;
        if (isConciseVar) {
          return `?${k}`;
        } else {
          return `${k} = ${printTerm(v, options)}`;
        }
      })
      .join(', ');
    return `${term.constructorName}{ ${fields} }`;
  }

  if (term.unNamedArgs.length === 0) {
    return term.constructorName;
  }

  const args = term.unNamedArgs.map(t => printTerm(t, options)).join(', ');
  return `${term.constructorName}(${args})`;
}
