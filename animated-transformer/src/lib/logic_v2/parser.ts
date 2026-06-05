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
  tokenKind,
  req,
  ParseError
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

function delimitedReq<I, T>(open: string, parser: Parser<I, T>, close: string, errMsg: string): Parser<I, T> {
  return seq(open, parser, req(close, errMsg)).map(r => r[1]);
}

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

  const identToken = tokenKind("ident");
  const ident = identToken.map(t => t.text);
  const constrNameToken = or(tokenKind("ident"), tokenKind("number"));
  const constrName = constrNameToken.map(t => t.text);
  const typeNameParser = or(kind("ident"), kind("number"));

  const recordField = seq(kind("ident"), ":", fn(() => termParser)).map(r => ({ name: r[0], type: r[2] }));
  const recordArgs = delimitedReq("{", withSep(",", recordField), "}", "Expected closing '}'");
  const parenArgs = delimitedReq("(", withSep(",", recordField), ")", "Expected closing ')'");

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
        delimitedReq(
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
          "}",
          "Expected closing '}'"
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
        delimitedReq("<", withSep(",", termParser), ">", "Expected closing '>'")
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
        delimitedReq("(", withSep(",", termParser), ")", "Expected closing ')'")
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
      delimitedReq("(", termParser, ")", "Expected closing ')'"),
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

  const typeParamsParser = opt(delimitedReq("<", withSep(",", kind("typeParam")), ">", "Expected closing '>'"));

  const letTypeDecl = seq(
    "type",
    req(identToken, "Expected type name"),
    opt(typeParamsParser),
    req("=", "Expected '=' in type declaration"),
    req(withSepPlus("|", constructorDecl), "Expected constructors in type declaration"),
    opt(";")
  ).map(r => {
    const typeToken = r[1];
    const typeName = typeToken.text;
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
      span: typeToken.span,
    };
  });

  const letTermDecl = seq(
    "let",
    req(constrNameToken, "Expected constant name"),
    req("=", "Expected '=' in let declaration"),
    req(termParser, "Expected term in let declaration"),
    opt(";")
  ).map(r => {
    const termToken = r[1];
    return {
      kind: 'Term' as const,
      termName: termToken.text,
      term: r[3],
      span: termToken.span,
    };
  });

  const patternArg = seq(termParser, opt(seq(":", termParser))).map(r => r[0]);
  const patternArgsParser = delimitedReq("(", withSep(",", patternArg), ")", "Expected closing ')'");

  const funClauseParser = or(
    seq(
      "fun",
      req(identToken, "Expected function name"),
      req(patternArgsParser, "Expected function pattern arguments"),
      req("=", "Expected '=' in function clause"),
      req(termParser, "Expected function body term")
    ).map(r => {
      const nameToken = r[1];
      const funcName = nameToken.text;
      const patterns = r[2];
      const body = r[4];
      return { funcName, clause: { patterns, body }, span: nameToken.span };
    }),
    seq(
      identToken,
      patternArgsParser,
      "=",
      termParser
    ).map(r => {
      const nameToken = r[0];
      const funcName = nameToken.text;
      const patterns = r[1];
      const body = r[3];
      return { funcName, clause: { patterns, body }, span: nameToken.span };
    })
  );

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
      span: first.span,
    };
  });

  const resourceDecl = seq(
    or(tokenKind("ident"), tokenKind("var")),
    ":",
    req(termParser, "Expected valid term in resource declaration"),
    opt(";")
  ).map(r => {
    const nameToken = r[0];
    const rawName = nameToken.text;
    const isTypeVar = rawName.startsWith('?');
    const varName = isTypeVar ? rawName.substring(1) : rawName;
    return {
      kind: 'Var' as const,
      varName,
      isTypeVar,
      typeName: r[2],
      span: nameToken.span,
    };
  });

  let actionVarCounter = 0;
  const actionResourceParser = or(
    seq(
      kind("var"),
      ":",
      termParser
    ).map(r => ({
      varName: r[0].substring(1),
      typePattern: r[2],
    })),
    termParser.map(t => ({
      varName: `_gen_var_${actionVarCounter++}`,
      typePattern: t,
    }))
  );

  const actionResourcesParser = delimitedReq("{", withSep(",", actionResourceParser), "}", "Expected closing '}'");

  const actionDecl = seq(
    "action",
    req(identToken, "Expected action name"),
    opt(delimitedReq("[", termParser, "]", "Expected closing ']'")),
    req(":", "Expected ':' after action name"),
    req(actionResourcesParser, "Expected LHS action resources"),
    req("-o", "Expected '-o' connector"),
    req(actionResourcesParser, "Expected RHS action resources"),
    opt(";")
  ).map(r => {
    const actionToken = r[1];
    const name = actionToken.text;
    const score = r[2] ?? undefined;
    const lhs = r[4];
    const rhs = r[6];
    return {
      kind: 'Action' as const,
      action: { name, score, lhs, rhs },
      span: actionToken.span,
    };
  });

  const declParser = or(letTypeDecl, letTermDecl, letFunDecl, resourceDecl, actionDecl);

  const contextParser = seq(repeat(declParser), req(eof(), "Unexpected token or declaration syntax error")).map(r => r[0]);

  const parsedDecls = contextParser.parse({ stream });
  if (!parsedDecls) {
    const lastPos = stream.checkpoint();
    throw new ParseError("Failed to parse Context declarations", [lastPos, lastPos]);
  }

  for (const decl of parsedDecls.value) {
    try {
      if (decl.kind === 'Type') {
        ctxt.extend(decl.constructors, decl.typeParams, decl.typeParamOrder);
      } else if (decl.kind === 'Term') {
        if (decl.termName in ctxt.getRawData().constructors || decl.termName in ctxt.getRawData().functions || decl.termName in ctxt.getRawData().actions || decl.termName in ctxt.termDefinitions) {
          throw new ParseError(`Literal '${decl.termName}' already defined in the context.`, decl.span);
        }
        ctxt.defineTerm(decl.termName, decl.term);
      } else if (decl.kind === 'Fun') {
        if (decl.funcName in ctxt.getRawData().constructors || decl.funcName in ctxt.getRawData().functions || decl.funcName in ctxt.getRawData().actions) {
          throw new ParseError(`Literal '${decl.funcName}' already defined in the context.`, decl.span);
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
            throw new ParseError(`Linear resource name '${decl.varName}' must start with '_'`, decl.span);
          }
          ctxt.declareLinearResource(decl.varName, decl.typeName);
        }
      } else if (decl.kind === 'Action') {
        if (decl.action.name in ctxt.getRawData().constructors || decl.action.name in ctxt.getRawData().functions || decl.action.name in ctxt.getRawData().actions) {
          throw new ParseError(`Literal '${decl.action.name}' already defined in the context.`, decl.span);
        }
        ctxt.getRawData().actions[decl.action.name] = decl.action;
      }
    } catch (e: any) {
      if (e instanceof ParseError) {
        throw e;
      }
      throw new ParseError(e.message, decl.span);
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
