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
  FilterStream,
  MatchersStream,
  Parser,
  Token,
  delimited,
  eof,
  fn,
  kind,
  opt,
  or,
  preceded,
  repeat,
  seq,
  tokenOf,
  withSep,
  withSepPlus,
} from 'mini-parse';

import {
  Term,
  TermKind,
  TypeKind,
  ConjunctionDef,
  BindingDef,
  DisjunctionDef,
} from './logic_data';

import {
  Context,
  emptyContext,
  allType,
  LOGIC_TOKENS,
  ConjunctionData,
} from './logic';

/**
 * Parses a raw source string containing logic definitions into a fully-typed `Context`.
 * Supports type declarations (`type ...`), constant declarations (`let ...`), 
 * function clauses (`fun ...`), and logic resource declarations.
 */
export function parseContext(src: string, existingCtxt?: Context): Context {
  const ctxt = existingCtxt ?? emptyContext();
  const instantiatedCustomParsers: Parser<unknown, Term>[] = [];

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

  const termParser: Parser<unknown, Term> = fn(() => {
    return or(
      or(...instantiatedCustomParsers),
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

  const simpleTermParser: Parser<unknown, Term> = fn(() => {
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

  if (ctxt instanceof Context) {
    for (const factory of ctxt.customParserFactories) {
      instantiatedCustomParsers.push(factory(termParser, simpleTermParser));
    }
  }

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
      if (decl.funcName in ctxt.getRawData().types || decl.funcName in ctxt.getRawData().constructors || decl.funcName in ctxt.getRawData().functions) {
        throw new Error(`Literal '${decl.funcName}' already defined in the context.`);
      }
      ctxt.getRawData().functions[decl.funcName] = {
        kind: 'clause',
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
      if (decl.action.name in ctxt.getRawData().types || decl.action.name in ctxt.getRawData().constructors || decl.action.name in ctxt.getRawData().functions || decl.action.name in ctxt.getRawData().actions) {
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
  const instantiatedCustomParsers: Parser<unknown, Term>[] = [];

  const constrNameParser = or(
    kind("number"),
    kind("ident"),
    kind("typeParam"),
    tokenOf("symbol", ["="]).map(() => "="),
    tokenOf("symbol", ["*"]).map(() => "*")
  );

  const termParser: Parser<unknown, Term> = fn(() => {
    return or(
      or(...instantiatedCustomParsers),
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

  const simpleTermParser: Parser<unknown, Term> = fn(() => {
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

  const ctxt = constructors instanceof Context ? constructors : null;
  if (ctxt) {
    for (const factory of ctxt.customParserFactories) {
      instantiatedCustomParsers.push(factory(termParser, simpleTermParser));
    }
  }

  const result = seq(termParser, eof()).parse({ stream });
  if (!result) {
    throw new Error("Failed to parse Term");
  }
  return result.value[0];
}
