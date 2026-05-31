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

import {
  TermKind,
  Literal,
  Variable,
  TypeKind,
  ConjunctionDef,
  DisjunctionDef,
  BindingDef,
  TypeDef,
  LiteralDef,
  ContextData,
  Term,
  FunctionDef,
  LolliAction,
} from './logic_data';

export * from './logic_data';
import { printTerm, printContext, printLinearContext } from './printer';
export { printTerm, printContext, printLinearContext };
import { evaluateTerm, matchPatterns, matchPattern, solveEquation } from './evaluator';
export { evaluateTerm, matchPatterns, matchPattern, solveEquation };
import {
  getBaseType,
  getParentSumType,
  isSumTypeName,
  matchTypes,
  substitute,
  unify,
  validateContext,
  validateAddedTypes,
  inferType,
  typeCheck,
} from './typechecker';
export {
  getBaseType,
  getParentSumType,
  isSumTypeName,
  matchTypes,
  substitute,
  unify,
  validateContext,
  validateAddedTypes,
  inferType,
  typeCheck,
};

export const LOGIC_TOKENS = new RegexMatchers({
  keyword: /let\b|type\b|fun\b|action\b/,
  typeParam: /'[a-zA-Z_][a-zA-Z0-9_]*/,
  var: /\?[a-zA-Z_][a-zA-Z0-9_]*/,
  ident: /[a-zA-Z_][a-zA-Z0-9_]*/,
  number: /0|[1-9][0-9]*/,
  symbol: matchOneOf("= | { } : , ( ) ; < > -o *"),
  ws: /\s+/,
});

export function isWildcard(t: Term): boolean {
  return t.kind === TermKind.Literal && t.literalName === '*';
}

export const allTypes: Term = {
  kind: TermKind.Literal,
  literalName: '*',
  unNamedArgs: [],
  namedArgs: {},
};

export function constr(
  constructorName: string,
  unNamedArgs: Term[] = [],
  namedArgs: { [argName: string]: Term } = {}
): Literal {
  return {
    kind: TermKind.Literal,
    literalName: constructorName,
    unNamedArgs,
    namedArgs,
  };
}

export function variable(varName: string): Variable {
  return {
    kind: TermKind.Variable,
    varName,
  };
}

export const allType: Term = constr('*');

export function isAllType(t: Term): boolean {
  return t.kind === TermKind.Literal && t.literalName === '*';
}

/**
 * Raw user-facing parsed constructor structure.
 * Serves as the intermediate AST structure before compilation and validation.
 */
export type ConjunctionData = {
  constructorName: string;
  createdTypeName: string;
  arguments: {
    [argName: string]: Term | string;
  };
  argOrder?: string[];
};



/**
 * The Context represents the unified logical context (traditional Γ).
 * All sum types, constructor record products, let aliases, variables,
 * and pattern-matching functions are fully validated and maintained.
 */
export class Context {
  constructor(private readonly data: ContextData) {}

  static empty(): Context {
    return new Context({
      literals: {},
      linearResources: {},
      variables: {},
      functions: {},
      actions: {},
    });
  }

  static parse(src: string, existing?: Context): Context {
    return parseContext(src, existing);
  }

  /** Returns all registered ADT Disjunctions and generic parameterised Disjunction bindings. */
  get types(): { [typeName: string]: TypeDef } {
    const result: { [typeName: string]: TypeDef } = {};
    for (const name of Object.keys(this.data.literals)) {
      const tdef = this.data.literals[name];
      const isDisj = tdef.kind === TypeKind.Disjunction || (tdef.kind === TypeKind.Binding && (tdef as BindingDef).boundType.kind === TypeKind.Disjunction);
      if (isDisj) {
        result[name] = tdef;
      }
    }
    return result;
  }

  get termDefinitions(): { [name: string]: { def: Term; typ: string } } {
    return this.privateTermDefs;
  }

  private readonly privateTermDefs: { [name: string]: { def: Term; typ: string } } = {};

  get linearResources(): { [resName: string]: string } {
    return this.data.linearResources;
  }

  get variables(): { [varName: string]: Term } {
    return this.data.variables;
  }

  get actions(): { [actionName: string]: LolliAction } {
    return this.data.actions;
  }

  getRawData(): ContextData {
    return this.data;
  }

  /** Compositionally extends the context, registering record product types and literals. */
  extend(
    constructors: ConjunctionData[],
    typeParams?: { [paramName: string]: Term },
    typeParamOrder?: string[]
  ): void {
    // Group constructors by their createdTypeName to support bulk extensions
    const groups = new Map<string, ConjunctionData[]>();
    for (const c of constructors) {
      if (!groups.has(c.createdTypeName)) {
        groups.set(c.createdTypeName, []);
      }
      groups.get(c.createdTypeName)!.push(c);
    }

    const createdLiterals = new Set<string>();

    try {
      for (const [sumTypeName, groupConstrs] of groups.entries()) {
        // Check sum type literal clash
        if (sumTypeName in this.data.literals || sumTypeName in this.data.functions) {
          throw new Error(`Type literal '${sumTypeName}' already defined in the context.`);
        }

        // Check constructor literals clashes
        for (const c of groupConstrs) {
          if (c.constructorName in this.data.literals || c.constructorName in this.data.functions) {
            throw new Error(`Constructor literal '${c.constructorName}' already defined in the context.`);
          }
        }

        // Build the Conjunction record types for the sum constructors
        const conjDefs: { [name: string]: ConjunctionDef } = {};
        for (const c of groupConstrs) {
          const termArgs: { [argName: string]: Term } = {};
          for (const [k, v] of Object.entries(c.arguments)) {
            termArgs[k] = typeof v === 'string' ? parseTerm(v, this) : v;
          }
          conjDefs[c.constructorName] = {
            kind: TypeKind.Conjunction,
            constructorName: c.constructorName,
            productTypeName: `${sumTypeName}_${c.constructorName}`,
            arguments: termArgs,
            argOrder: c.argOrder,
          };
        }

        const disjDef: DisjunctionDef = {
          kind: TypeKind.Disjunction,
          sumTypeName: sumTypeName,
          constructors: conjDefs,
        };

        // Build the TypeDef (with optional BindingDef wrapper if generic)
        let typeDef: TypeDef = disjDef;
        if (typeParams && typeParamOrder && typeParamOrder.length > 0 && sumTypeName === constructors[0]?.createdTypeName) {
          typeDef = {
            kind: TypeKind.Binding,
            boundTypeName: sumTypeName,
            params: typeParams,
            paramOrder: typeParamOrder,
            boundType: disjDef,
          };
        }

        // Register the type literal
        this.data.literals[sumTypeName] = typeDef;
        createdLiterals.add(sumTypeName);

        // Register each constructor literal
        for (const c of groupConstrs) {
          const conjDef = conjDefs[c.constructorName];
          let constrTypeDef: TypeDef = conjDef;
          if (typeParams && typeParamOrder && typeParamOrder.length > 0 && sumTypeName === constructors[0]?.createdTypeName) {
            constrTypeDef = {
              kind: TypeKind.Binding,
              boundTypeName: c.constructorName,
              params: typeParams,
              paramOrder: typeParamOrder,
              boundType: conjDef,
            };
          }
          this.data.literals[c.constructorName] = constrTypeDef;
          createdLiterals.add(c.constructorName);
        }
      }

      // Run validation checks on the newly extended context data
      validateAddedTypes(this, constructors);
      validateContext(this);
    } catch (e) {
      // Rollback: transactional deletion of any newly registered literals
      for (const litName of createdLiterals) {
        delete this.data.literals[litName];
      }
      throw e;
    }
  }

  defineTerm(name: string, term: Term): void {
    const freeVars = getFreeVars(term);
    for (const fv of freeVars) {
      if (!(fv in this.data.variables)) {
        this.data.variables[fv] = allType;
      }
    }
    const typeName = inferType(this, term, this.data.variables);
    this.privateTermDefs[name] = { def: term, typ: typeName };
  }

  declareVariable(name: string, typeRef: Term): void {
    const freeVars = getFreeVars(typeRef);
    for (const fv of freeVars) {
      if (!(fv in this.data.variables)) {
        this.data.variables[fv] = allType;
      }
    }
    this.data.variables[name] = typeRef;
  }

  declareLinearResource(name: string, typeRef: Term): void {
    if (!name.startsWith('_')) {
      throw new Error(`Linear resource name '${name}' must start with '_'`);
    }
    if ('state' in this.data.literals) {
      typeCheck(this, typeRef, 'state');
    } else if (typeRef.kind === TermKind.Literal && !isSumTypeName(this, typeRef.literalName)) {
      inferType(this, typeRef);
    }
    const freeVars = getFreeVars(typeRef);
    for (const fv of freeVars) {
      if (!(fv in this.data.variables)) {
        this.data.variables[fv] = allType;
      }
    }
    this.data.linearResources[name] = printTerm(typeRef, { ctxt: this });
  }
}

export function emptyContext(): Context {
  return Context.empty();
}





/**
 * Extracts the base string name of a type reference term or raw string.
 */
export function getBaseTypeName(typeRef: Term | string): string {
  if (typeof typeRef === 'string') return typeRef;
  if (typeRef.kind === TermKind.Literal) return typeRef.literalName;
  return typeRef.varName;
}

/**
 * Collects all unique logic variable names (starting with '?') present in a given term.
 */
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




/**
 * Extends an existing context with a list of new constructor declarations.
 * Supports optional generic type parameterization.
 */
export function extendContext(
  ctxt: Context,
  constructors: ConjunctionData[],
  typeParams?: { [paramName: string]: Term },
  typeParamOrder?: string[]
): Context {
  ctxt.extend(constructors, typeParams, typeParamOrder);
  return ctxt;
}

/**
 * Creates a brand new context populated with a list of constructor declarations.
 */
export function createContext(constructors: ConjunctionData[]): Context {
  return extendContext(emptyContext(), constructors);
}

/**
 * Parses a raw source string containing logic definitions into a fully-typed `Context`.
 * Supports type declarations (`type ...`), constant declarations (`let ...`), 
 * function clauses (`fun ...`), and logic resource declarations.
 */
export function parseContext(src: string, existingCtxt?: Context): Context {
  const ctxt = existingCtxt ?? emptyContext();

  const stream = new FilterStream(
    new MatchersStream(src, LOGIC_TOKENS),
    (t: Token) => t.kind !== "ws"
  );

  const ident = kind("ident");
  const constrName = or(kind("ident"), kind("number"));
  const typeNameParser = or(kind("ident"), kind("number"));

  const recordField = seq(kind("ident"), ":", fn(() => termParser)).map(r => ({ name: r[0], type: r[2] }));
  const recordArgs = delimited("{", withSep(",", recordField), "}");
  const parenArgs = delimited("(", withSep(",", recordField), ")");

  const constructorDecl = or(
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
    constrName.map(name => {
      return {
        constructorName: name,
        arguments: {},
        argOrder: [],
      };
    })
  );

  const constrNameParser = or(
    kind("number"),
    kind("ident"),
    kind("typeParam"),
    tokenOf("symbol", ["="]).map(() => "="),
    tokenOf("symbol", ["*"]).map(() => "*")
  );

  const termParser: Parser<any, Term> = fn(() => {
    return or(
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
          kind: TermKind.Literal as const,
          literalName: constructorName,
          unNamedArgs: [],
          namedArgs,
        };
      }),
      seq(
        constrNameParser,
        delimited("<", withSep(",", termParser), ">")
      ).map(r => {
        const constructorName = r[0];
        const args = r[1];
        return {
          kind: TermKind.Literal as const,
          literalName: constructorName,
          unNamedArgs: args,
          namedArgs: {},
        };
      }),
      seq(
        constrNameParser,
        delimited("(", withSep(",", termParser), ")")
      ).map(r => {
        const constructorName = r[0];
        const args = r[1];
        return {
          kind: TermKind.Literal as const,
          literalName: constructorName,
          unNamedArgs: args,
          namedArgs: {},
        };
      }),
      simpleTermParser
    );
  });

  const simpleTermParser: Parser<any, Term> = fn(() => {
    return or(
      delimited("(", termParser, ")"),
      constrNameParser.map(name => {
        return {
          kind: TermKind.Literal as const,
          literalName: name,
          unNamedArgs: [],
          namedArgs: {},
        };
      }),
      kind("var").map(name => {
        return {
          kind: TermKind.Variable as const,
          varName: name.substring(1),
        };
      })
    );
  });

  const typeParamsParser = opt(delimited("<", withSep(",", kind("typeParam")), ">"));

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

    const typeParams: { [paramName: string]: Term } = {};
    const typeParamOrder: string[] = [];
    if (typeParamsList) {
      for (const p of typeParamsList) {
        typeParams[p] = allType;
        typeParamOrder.push(p);
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

  const patternArg = seq(termParser, opt(seq(":", termParser))).map(r => r[0]);
  const patternArgsParser = delimited("(", withSep(",", patternArg), ")");
  const funClauseParser = seq(
    opt("fun"),
    ident,
    patternArgsParser,
    "=",
    termParser
  ).map(r => {
    const funcName = r[1];
    const patterns = r[2];
    const body = r[4];
    return { funcName, clause: { patterns, body } };
  });

  const letFunDecl = seq(
    funClauseParser,
    repeat(preceded("|", funClauseParser)),
    opt(";")
  ).map(r => {
    const first = r[0];
    const rest = r[1];
    const clauses = [first.clause, ...rest.map(x => x.clause)];
    return {
      kind: 'Fun' as const,
      funcName: first.funcName,
      clauses,
    };
  });

  const resourceDecl = seq(
    or(ident, kind("var")),
    ":",
    termParser,
    opt(";")
  ).map(r => {
    const rawName = r[0];
    const isTypeVar = rawName.startsWith('?');
    const varName = isTypeVar ? rawName.substring(1) : rawName;
    return {
      kind: 'Var' as const,
      varName,
      isTypeVar,
      typeName: r[2],
    };
  });

  const actionResourceParser = seq(
    kind("var"),
    ":",
    termParser
  ).map(r => ({
    varName: r[0].substring(1),
    typePattern: r[2],
  }));

  const actionResourcesParser = delimited(
    "{",
    withSep(",", actionResourceParser),
    "}"
  );

  const actionDecl = seq(
    "action",
    ident,
    ":",
    actionResourcesParser,
    "-o",
    actionResourcesParser,
    opt(";")
  ).map(r => {
    const name = r[1];
    const lhs = r[3];
    const rhs = r[5];
    return {
      kind: 'Action' as const,
      action: { name, lhs, rhs },
    };
  });

  const declParser = or(letTypeDecl, letTermDecl, letFunDecl, resourceDecl, actionDecl);

  const contextParser = seq(repeat(declParser), eof()).map(r => r[0]);

  const parsedDecls = contextParser.parse({ stream });
  if (!parsedDecls) {
    throw new Error("Failed to parse Context declarations");
  }

  for (const decl of parsedDecls.value) {
    if (decl.kind === 'Type') {
      ctxt.extend(decl.constructors, decl.typeParams, decl.typeParamOrder);
    } else if (decl.kind === 'Term') {
      ctxt.defineTerm(decl.termName, decl.term);
    } else if (decl.kind === 'Fun') {
      if (decl.funcName in ctxt.getRawData().literals || decl.funcName in ctxt.getRawData().functions) {
        throw new Error(`Literal '${decl.funcName}' already defined in the context.`);
      }
      ctxt.getRawData().functions[decl.funcName] = {
        funcName: decl.funcName,
        clauses: decl.clauses,
      };
    } else if (decl.kind === 'Var') {
      if (decl.isTypeVar) {
        ctxt.declareVariable(decl.varName, decl.typeName);
      } else {
        if (!decl.varName.startsWith('_')) {
          throw new Error(`Linear resource name '${decl.varName}' must start with '_'`);
        }
        ctxt.declareLinearResource(decl.varName, decl.typeName);
      }
    } else if (decl.kind === 'Action') {
      if (decl.action.name in ctxt.getRawData().literals || decl.action.name in ctxt.getRawData().functions || decl.action.name in ctxt.getRawData().actions) {
        throw new Error(`Literal '${decl.action.name}' already defined in the context.`);
      }
      ctxt.getRawData().actions[decl.action.name] = decl.action;
    }
  }

  return ctxt;
}



/**
 * Parses a raw string representation of a logic term into a structured `Term` object.
 * Supports constructor terms with named arguments (e.g., `c{x = 1, y = 2}`), generic 
 * parameterized terms (e.g., `cons<nat>(1, nil)`), standard positional terms, 
 * logic variables, and simple literals.
 */
export function parseTerm(src: string, constructors?: Set<string> | Context): Term {
  const stream = new FilterStream(
    new MatchersStream(src, LOGIC_TOKENS),
    (t: Token) => t.kind !== "ws"
  );

  const constrNameParser = or(
    kind("number"),
    kind("ident"),
    kind("typeParam"),
    tokenOf("symbol", ["="]).map(() => "="),
    tokenOf("symbol", ["*"]).map(() => "*")
  );

  const termParser: Parser<any, Term> = fn(() => {
    return or(
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
          kind: TermKind.Literal as const,
          literalName: constructorName,
          unNamedArgs: [],
          namedArgs,
        };
      }),
      seq(
        constrNameParser,
        delimited("<", withSep(",", termParser), ">")
      ).map(r => {
        const constructorName = r[0];
        const args = r[1];
        return {
          kind: TermKind.Literal as const,
          literalName: constructorName,
          unNamedArgs: args,
          namedArgs: {},
        };
      }),
      seq(
        constrNameParser,
        delimited("(", withSep(",", termParser), ")")
      ).map(r => {
        const constructorName = r[0];
        const args = r[1];
        return {
          kind: TermKind.Literal as const,
          literalName: constructorName,
          unNamedArgs: args,
          namedArgs: {},
        };
      }),
      simpleTermParser
    );
  });

  const simpleTermParser: Parser<any, Term> = fn(() => {
    return or(
      delimited("(", termParser, ")"),
      constrNameParser.map(name => {
        return {
          kind: TermKind.Literal as const,
          literalName: name,
          unNamedArgs: [],
          namedArgs: {},
        };
      }),
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




