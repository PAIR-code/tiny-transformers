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

export type TypeContext = {
  types: { [typeName: string]: TypeConstructions };
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

export function emptyContext(): TypeContext {
  return { types: {} };
}

/**
 * Validates a TypeContext to ensure there are no loop types or types with no base case
 * (i.e. all of their constructors recursively depend on themselves directly or indirectly).
 */
export function validateTypeContext(ctxt: TypeContext): void {
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
export function validateAddedTypes(ctxt: TypeContext, constructors: TypeConstructor[]): void {
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

export function extendTypeContext(ctxt: TypeContext, constructors: TypeConstructor[]): TypeContext {
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

export function createTypeContext(constructors: TypeConstructor[]): TypeContext {
  return extendTypeContext(emptyContext(), constructors);
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
  ctxt: TypeContext,
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
  ctxt: TypeContext,
  term: Term,
  expectedType: string,
  varTypes: { [varName: string]: string } = {}
): void {
  if (term.kind === TermKind.Variable) {
    const actualType = inferType(ctxt, term, varTypes);
    if (actualType !== expectedType) {
      throw new Error(
        `Type mismatch for variable '${term.varName}': expected '${expectedType}', got '${actualType}'`
      );
    }
    return;
  }

  // If it's a constructor term, we can check if its constructor is defined for the expectedType.
  // This resolves overloaded constructor names based on the expected type.
  const ctxtType = ctxt.types[expectedType];
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
  if (inferredType !== expectedType) {
    throw new Error(
      `Type mismatch for constructor term '${term.constructorName}': expected '${expectedType}', got '${inferredType}'`
    );
  }
}

/**
 * Parses a TypeContext from an SML-like datatype declaration string.
 * Example:
 *   datatype nat = 0 | suc of nat;
 *   datatype natList = nil | cons of nat * natList;
 */
export function parseTypeContext(src: string): TypeContext {
  const logicTokens = new RegexMatchers({
    keyword: /datatype\b|of\b/,
    ident: /[a-zA-Z_][a-zA-Z0-9_]*/,
    number: /0|[1-9][0-9]*/,
    symbol: matchOneOf("= | * { } : , ( ) ;"),
    ws: /\s+/,
  });

  const stream = new FilterStream(
    new MatchersStream(src, logicTokens),
    (t: Token) => t.kind !== "ws"
  );

  const ident = kind("ident");
  const constrName = or(kind("ident"), kind("number"));

  const recordField = seq(ident, ":", ident).map(r => ({ name: r[0], type: r[2] }));
  const recordArgs = delimited("{", withSep(",", recordField), "}");

  const argsParser = or(
    recordArgs.map(fields => {
      const argumentsMap: { [name: string]: string } = {};
      const argOrder: string[] = [];
      for (const f of fields) {
        argumentsMap[f.name] = f.type;
        argOrder.push(f.name);
      }
      return { arguments: argumentsMap, argOrder };
    }),
    withSepPlus("*", ident).map(types => {
      const argumentsMap: { [name: string]: string } = {};
      const argOrder: string[] = [];
      for (let i = 0; i < types.length; i++) {
        const name = `arg${i}`;
        argumentsMap[name] = types[i];
        argOrder.push(name);
      }
      return { arguments: argumentsMap, argOrder };
    })
  );

  const constructorDecl = seq(
    constrName,
    opt(preceded("of", argsParser))
  ).map(r => {
    const name = r[0];
    const argsOpt = r[1];
    return {
      constructorName: name,
      arguments: argsOpt?.arguments ?? {},
      argOrder: argsOpt?.argOrder ?? [],
    };
  });

  const datatypeDecl = seq(
    "datatype",
    ident,
    "=",
    withSepPlus("|", constructorDecl),
    opt(";")
  ).map(r => {
    const typeName = r[1];
    const constructorsList = r[3];
    return constructorsList.map(c => ({
      ...c,
      createdTypeName: typeName,
    }));
  });

  const contextParser = seq(repeat(datatypeDecl), eof()).map(r => {
    return r[0].flat();
  });

  const result = contextParser.parse({ stream });
  if (!result) {
    throw new Error("Failed to parse TypeContext");
  }

  return createTypeContext(result.value);
}

/**
 * Prints a TypeContext in SML-like datatype syntax.
 */
export function printTypeContext(ctxt: TypeContext): string {
  const declarations: string[] = [];
  for (const typeName of Object.keys(ctxt.types).sort()) {
    const typeConstruction = ctxt.types[typeName];
    const constrDecls: string[] = [];
    const constructorsList = Object.values(typeConstruction.constructors) as TypeConstructor[];
    for (const c of constructorsList.sort((a, b) => a.constructorName.localeCompare(b.constructorName))) {
      const argKeys = c.argOrder ?? Object.keys(c.arguments).sort();
      if (argKeys.length === 0) {
        constrDecls.push(c.constructorName);
      } else {
        const isPositional = argKeys.every((k, idx) => k === `arg${idx}`);
        if (isPositional) {
          const typesList = argKeys.map(k => c.arguments[k]);
          if (typesList.length === 1) {
            constrDecls.push(`${c.constructorName} of ${typesList[0]}`);
          } else {
            constrDecls.push(`${c.constructorName} of ${typesList.join(' * ')}`);
          }
        } else {
          const fields = argKeys.map(k => `${k}: ${c.arguments[k]}`).join(', ');
          constrDecls.push(`${c.constructorName} of { ${fields} }`);
        }
      }
    }
    declarations.push(`datatype ${typeName} = ${constrDecls.join(' | ')};`);
  }
  return declarations.join('\n');
}

/**
 * Parses a Term from an SML-like term string.
 * Supports positional constructors, record-style constructors, space-separated curried constructor terms,
 * and variables.
 */
export function parseTerm(src: string, constructors?: Set<string> | TypeContext): Term {
  const knownConstructors = new Set<string>();
  if (constructors instanceof Set) {
    constructors.forEach(c => knownConstructors.add(c));
  } else if (constructors && typeof constructors === 'object' && 'types' in constructors) {
    for (const typeName of Object.keys(constructors.types)) {
      for (const constrName of Object.keys(constructors.types[typeName].constructors)) {
        knownConstructors.add(constrName);
      }
    }
  } else {
    ['0', 'suc', 'nil', 'cons', 'true', 'false'].forEach(c => knownConstructors.add(c));
  }

  const termTokens = new RegexMatchers({
    keyword: /datatype\b|of\b/,
    ident: /[a-zA-Z_][a-zA-Z0-9_]*/,
    number: /0|[1-9][0-9]*/,
    symbol: matchOneOf("= | * { } : , ( ) ;"),
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

  type SimpleAst = Term | { kind: 'Tuple'; elements: Term[] } | { kind: 'Record'; fields: { [name: string]: Term } };

  const termParser: Parser<any, Term> = fn(() => {
    return or(
      // Constructor application: C simple_term1 simple_term2 ...
      seq(constrNameParser, repeatPlus(simpleTermParser)).map(r => {
        const constructorName = r[0];
        const simpleTerms = r[1] as SimpleAst[];

        if (simpleTerms.length === 1) {
          const first = simpleTerms[0];
          if ('kind' in first && first.kind === 'Tuple') {
            return {
              kind: TermKind.Constructor as const,
              constructorName,
              unNamedArgs: first.elements,
              namedArgs: {},
            };
          }
          if ('kind' in first && first.kind === 'Record') {
            return {
              kind: TermKind.Constructor as const,
              constructorName,
              unNamedArgs: [],
              namedArgs: first.fields,
            };
          }
        }

        const args = simpleTerms.map(t => {
          if ('kind' in t && (t.kind === 'Tuple' || t.kind === 'Record')) {
            throw new Error("Unexpected nested tuple or record");
          }
          return t as Term;
        });

        return {
          kind: TermKind.Constructor as const,
          constructorName,
          unNamedArgs: args,
          namedArgs: {},
        };
      }),
      // Or just a simple term (which must be a Term, not a bare Tuple/Record)
      simpleTermParser.map(t => {
        if ('kind' in t && (t.kind === 'Tuple' || t.kind === 'Record')) {
          throw new Error("Bare tuple or record not allowed as a top-level term");
        }
        return t as Term;
      })
    );
  });

  const simpleTermParser: Parser<any, SimpleAst> = fn(() => {
    return or(
      // Parenthesized term or Tuple: ( t1, t2, ... )
      delimited("(", withSepPlus(",", termParser), ")").map(list => {
        if (list.length === 1) {
          return list[0];
        }
        return {
          kind: 'Tuple' as const,
          elements: list,
        };
      }),
      // Record term: { k1 = t1, k2 = t2, ... }
      delimited(
        "{",
        withSep(",", seq(kind("ident"), "=", termParser).map(r => ({ name: r[0], val: r[2] }))),
        "}"
      ).map(fields => {
        const recordFields: { [name: string]: Term } = {};
        for (const f of fields) {
          recordFields[f.name] = f.val;
        }
        return {
          kind: 'Record' as const,
          fields: recordFields,
        };
      }),
      // Zero-arg constructor
      constrNameParser.map(name => {
        return {
          kind: TermKind.Constructor as const,
          constructorName: name,
          unNamedArgs: [],
          namedArgs: {},
        };
      }),
      // Variable
      kind("ident").map(name => {
        return {
          kind: TermKind.Variable as const,
          varName: name,
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
 * Prints a Term in SML-like syntax.
 */
export function printTerm(term: Term): string {
  if (term.kind === TermKind.Variable) {
    return term.varName;
  }

  const hasNamed = Object.keys(term.namedArgs).length > 0;
  if (hasNamed) {
    const fields = Object.entries(term.namedArgs)
      .map(([k, v]) => `${k} = ${printTerm(v)}`)
      .join(', ');
    return `${term.constructorName} { ${fields} }`;
  }

  if (term.unNamedArgs.length === 0) {
    return term.constructorName;
  }

  if (term.unNamedArgs.length === 1) {
    const arg = term.unNamedArgs[0];
    if (isSimpleTerm(arg)) {
      return `${term.constructorName} ${printTerm(arg)}`;
    } else {
      return `${term.constructorName} (${printTerm(arg)})`;
    }
  }

  const args = term.unNamedArgs.map(printTerm).join(', ');
  return `${term.constructorName}(${args})`;
}

function isSimpleTerm(t: Term): boolean {
  if (t.kind === TermKind.Variable) return true;
  if (t.kind === TermKind.Constructor) {
    return t.unNamedArgs.length === 0 && Object.keys(t.namedArgs).length === 0;
  }
  return false;
}
