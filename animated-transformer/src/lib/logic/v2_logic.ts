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

export type TypeConstructor = {
  constructorName: string;
  createdTypeName: string;
  arguments: {
    [argName: string]: string;
  };
  argOrder?: string[];
};

export type TypeConstructions = {
  constructors: { [constructorName: string]: TypeConstructor };
};

export type Context = {
  types: { [typeName: string]: TypeConstructions };
  termDefinitions: { [name: string]: { def: Term; typ: string } };
  variables: { [varName: string]: string };
};

export enum TermKind {
  Constructor = 'Constructor',
  Variable = 'Variable',
}

export type ConstrTerm = {
  kind: TermKind.Constructor;
  constructorName: string;
  unNamedArgs: Term[];
  namedArgs: {
    [argName: string]: Term;
  };
};
export type VarTerm = {
  kind: TermKind.Variable;
  varName: string;
};

export type Term = ConstrTerm | VarTerm;

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
        const argTypes = Object.values(c.arguments);
        return argTypes.every(argType => {
          return !ctxt.types[argType] || wellFounded.has(argType);
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
export function validateAddedTypes(ctxt: Context, constructors: TypeConstructor[]): void {
  const newTypes = new Set(constructors.map(c => c.createdTypeName));
  const wellFounded = new Set<string>();

  // Combine existing constructors in ctxt with the newly added ones for validation
  const newConstructorsMap = new Map<string, TypeConstructor[]>();
  for (const typeName of newTypes) {
    const existingConstrs = ctxt.types[typeName]
      ? Object.values(ctxt.types[typeName].constructors)
      : [];
    const addedConstrs = constructors.filter(c => c.createdTypeName === typeName);

    const combined = new Map<string, TypeConstructor>();
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
        const argTypes = Object.values(c.arguments);
        return argTypes.every(argType => {
          // An arg type is well-founded if it is not in newTypes (pre-existing or primitive)
          // or if we have already proven it is well-founded in this pass.
          return !newTypes.has(argType) || wellFounded.has(argType);
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

export function extendContext(ctxt: Context, constructors: TypeConstructor[]): Context {
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

export function createContext(constructors: TypeConstructor[]): Context {
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
  let foundConstructor: TypeConstructor | null = null;
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

  // Typecheck all the arguments
  for (const [argName, argTerm] of matchedArgs.entries()) {
    const expectedArgType = c.arguments[argName];
    typeCheck(ctxt, argTerm, expectedArgType, varTypes);
  }

  return c.createdTypeName;
}

/**
 * Checks a term against an expected type under a context and variable type assignments.
 */
export function typeCheck(
  ctxt: Context,
  term: Term,
  expectedType: string,
  varTypes: { [varName: string]: string } = {}
): void {
  if (term.kind === TermKind.Variable) {
    const actualType = inferType(ctxt, term, varTypes);
    if (getBaseType(ctxt, actualType) !== getBaseType(ctxt, expectedType)) {
      throw new Error(
        `Type mismatch for variable '${term.varName}': expected '${expectedType}', got '${actualType}'`
      );
    }
    return;
  }

  // If it's a constructor term, we can check if its constructor is defined for the expectedType.
  // This resolves overloaded constructor names based on the expected type.
  const baseExpectedType = getBaseType(ctxt, expectedType);
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

      // Typecheck all arguments
      for (const [argName, argTerm] of matchedArgs.entries()) {
        const expectedArgType = c.arguments[argName];
        typeCheck(ctxt, argTerm, expectedArgType, varTypes);
      }
      return;
    }
  }

  // Fallback to inferring the type and comparing
  const inferredType = inferType(ctxt, term, varTypes);
  if (getBaseType(ctxt, inferredType) !== getBaseType(ctxt, expectedType)) {
    throw new Error(
      `Type mismatch for constructor term '${term.constructorName}': expected '${expectedType}', got '${inferredType}'`
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
    symbol: matchOneOf("= | { } : , ( ) ;"),
    ws: /\s+/,
  });

  const stream = new FilterStream(
    new MatchersStream(src, logicTokens),
    (t: Token) => t.kind !== "ws"
  );

  const ident = kind("ident");
  const constrName = or(kind("ident"), kind("number"));
  const typeNameParser = or(kind("ident"), kind("number"));

  const recordField = seq(kind("var"), ":", typeNameParser).map(r => ({ name: r[0].substring(1), type: r[2] }));
  const recordArgs = delimited("{", withSep(",", recordField), "}");
  const parenArgs = delimited("(", withSep(",", recordField), ")");

  const constructorDecl = or(
    // Parenthesized style: suc(?n:nat) or cons(?h: nat, ?t: natList) or node(?left: tree, ?val: nat, ?right: tree)
    seq(constrName, parenArgs).map(r => {
      const name = r[0];
      const fields = r[1];
      const argumentsMap: { [name: string]: string } = {};
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

  const getKnownConstructors = () => {
    const set = new Set<string>();
    for (const typeName of Object.keys(ctxt.types)) {
      for (const constrName of Object.keys(ctxt.types[typeName].constructors)) {
        set.add(constrName);
      }
    }
    ['0', 'suc', 'nil', 'cons', 'true', 'false', 'leaf', 'node'].forEach(c => set.add(c));
    return set;
  };

  const constrNameParser = or(
    kind("number"),
    fn(() => tokenOf("ident", Array.from(getKnownConstructors())).map(t => t.text))
  );

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

  const letTypeDecl = seq(
    "type",
    ident,
    "=",
    withSepPlus("|", constructorDecl),
    opt(";")
  ).map(r => ({
    kind: 'Type' as const,
    typeName: r[1],
    constructors: r[3].map(c => ({ ...c, createdTypeName: r[1] })),
  }));

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
    typeNameParser,
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
    } else if (decl.kind === 'Term') {
      const typeName = inferType(ctxt, decl.term, ctxt.variables);
      ctxt.termDefinitions[decl.termName] = { def: decl.term, typ: typeName };
    } else if (decl.kind === 'Var') {
      const baseType = getBaseType(ctxt, decl.typeName);
      if (!(baseType in ctxt.types) && !['nat', 'natList', 'tree'].includes(baseType)) {
        throw new Error(`Unknown type: '${decl.typeName}'`);
      }
      ctxt.variables[decl.varName] = decl.typeName;
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
    const constructorsList = Object.values(typeConstruction.constructors) as TypeConstructor[];
    for (const c of constructorsList.sort((a, b) => a.constructorName.localeCompare(b.constructorName))) {
      const argKeys = c.argOrder ?? Object.keys(c.arguments).sort();
      if (argKeys.length === 0) {
        constrDecls.push(c.constructorName);
      } else {
        const fields = argKeys.map(k => `?${k}: ${c.arguments[k]}`).join(', ');
        constrDecls.push(`${c.constructorName}(${fields})`);
      }
    }
    declarations.push(`type ${typeName} = ${constrDecls.join(' | ')};`);
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
  const knownConstructors = new Set<string>();
  if (constructors instanceof Set) {
    constructors.forEach(c => knownConstructors.add(c));
  } else if (constructors && typeof constructors === 'object' && 'types' in constructors) {
    for (const typeName of Object.keys(constructors.types)) {
      for (const constrName of Object.keys(constructors.types[typeName].constructors)) {
        knownConstructors.add(constrName);
      }
    }
    if (constructors.termDefinitions) {
      for (const termName of Object.keys(constructors.termDefinitions)) {
        knownConstructors.add(termName);
      }
    }
  } else {
    ['0', 'suc', 'nil', 'cons', 'true', 'false'].forEach(c => knownConstructors.add(c));
  }

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

  const constrNameParser = or(
    kind("number"),
    tokenOf("ident", Array.from(knownConstructors)).map(t => t.text)
  );

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
