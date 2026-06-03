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
  RegexMatchers,
  matchOneOf,
} from 'mini-parse';

import {
  TermKind,
  Literal,
  Variable,
  Escaped,
  EscapedValue,
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
  TypeChecker,
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
  TypeChecker,
};
import { parseContext, parseTerm } from './parser';
export { parseContext, parseTerm };
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

export function escaped(value: EscapedValue): Escaped {
  return {
    kind: TermKind.Escaped,
    value,
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
      types: {},
      constructors: {},
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
    return this.data.types;
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
        if (sumTypeName in this.data.types || sumTypeName in this.data.constructors || sumTypeName in this.data.functions) {
          throw new Error(`Type literal '${sumTypeName}' already defined in the context.`);
        }

        // Check constructor literals clashes
        for (const c of groupConstrs) {
          if (c.constructorName in this.data.types && Object.keys(c.arguments).length === 0) {
            continue;
          }
          if (c.constructorName in this.data.types || c.constructorName in this.data.constructors || c.constructorName in this.data.functions) {
            throw new Error(`Constructor literal '${c.constructorName}' already defined in the context.`);
          }
        }

        // Build the Conjunction record types for the sum constructors
        const conjDefs: { [name: string]: ConjunctionDef } = {};
        const subUnions: string[] = [];
        for (const c of groupConstrs) {
          if (c.constructorName in this.data.types && Object.keys(c.arguments).length === 0) {
            subUnions.push(c.constructorName);
            continue;
          }
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
          subUnions: subUnions.length > 0 ? new Set(subUnions) : undefined,
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
        this.data.types[sumTypeName] = typeDef;
        createdLiterals.add(sumTypeName);

        // Register each constructor literal
        for (const c of groupConstrs) {
          if (c.constructorName in this.data.types && Object.keys(c.arguments).length === 0) {
            continue;
          }
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
          this.data.constructors[c.constructorName] = constrTypeDef;
          createdLiterals.add(c.constructorName);
        }
      }

      // Run validation checks on the newly extended context data
      validateAddedTypes(this, constructors);
      validateContext(this);
    } catch (e) {
      // Rollback: transactional deletion of any newly registered literals
      for (const litName of createdLiterals) {
        delete this.data.types[litName];
        delete this.data.constructors[litName];
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
    if ('state' in this.data.types) {
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
  if (typeRef.kind === TermKind.Escaped) return typeRef.value.toString();
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
    } else if (t.kind === TermKind.Literal) {
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




