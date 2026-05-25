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

export function isWildcard(t: Term | string | undefined): boolean {
  if (!t) return false;
  if (t === '*') return true;
  return typeof t !== 'string' && t.kind === TermKind.Literal && t.literalName === '*';
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
 * Recursively validates that a type term reference is well-formed in the context.
 * Ensures every type reference is either:
 *  1. A bound generic parameter variable (e.g. 'x).
 *  2. The recursive type itself being defined (e.g. list<'x>).
 *  3. A pre-existing Sum type or literal in the context.
 */
export function validateTypeRef(
  ctxt: Context,
  typeRef: Term | string,
  allowedVars: Set<string>,
  recursiveTypeName: string
): void {
  if (typeof typeRef === 'string') {
    if (allowedVars.has(typeRef)) return;
    if (typeRef === recursiveTypeName) return;
    const baseType = getBaseType(ctxt, typeRef);
    if (baseType in ctxt.getRawData().literals || baseType in ctxt.getRawData().functions || ['nat', 'natList', 'tree', '*', '='].includes(baseType)) return;
    throw new Error(`Unknown type reference: '${typeRef}'`);
  }

  if (typeRef.kind === TermKind.Variable) {
    const varName = typeRef.varName;
    if (varName in ctxt.linearResources || allowedVars.has(varName)) return;
    throw new Error(`Unknown variable type reference: '?${varName}'`);
  }

  if (typeRef.kind === TermKind.Literal) {
    const constrName = typeRef.literalName;
    if (allowedVars.has(constrName)) return;
    if (constrName === recursiveTypeName) {
      for (const arg of typeRef.unNamedArgs) {
        validateTypeRef(ctxt, arg, allowedVars, recursiveTypeName);
      }
      for (const arg of Object.values(typeRef.namedArgs)) {
        validateTypeRef(ctxt, arg, allowedVars, recursiveTypeName);
      }
      return;
    }
    const baseType = getBaseType(ctxt, constrName);
    if (baseType in ctxt.getRawData().literals || baseType in ctxt.getRawData().functions || ['nat', 'natList', 'tree', '*', '='].includes(baseType)) {
      for (const arg of typeRef.unNamedArgs) {
        validateTypeRef(ctxt, arg, allowedVars, recursiveTypeName);
      }
      for (const arg of Object.values(typeRef.namedArgs)) {
        validateTypeRef(ctxt, arg, allowedVars, recursiveTypeName);
      }
      return;
    }
    throw new Error(`Unknown type reference: '${constrName}'`);
  }
}

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
        this.data.variables[fv] = constr('*');
      }
    }
    const typeName = inferType(this, term, this.data.variables);
    this.privateTermDefs[name] = { def: term, typ: typeName };
  }

  declareVariable(name: string, typeRef: Term): void {
    const freeVars = getFreeVars(typeRef);
    for (const fv of freeVars) {
      if (!(fv in this.data.variables)) {
        this.data.variables[fv] = constr('*');
      }
    }
    this.data.variables[name] = typeRef;
  }

  declareLinearResource(name: string, typeRef: Term): void {
    if (!name.startsWith('_')) {
      throw new Error(`Linear resource name '${name}' must start with '_'`);
    }
    const freeVars = getFreeVars(typeRef);
    for (const fv of freeVars) {
      if (!(fv in this.data.variables)) {
        this.data.variables[fv] = constr('*');
      }
    }
    this.data.linearResources[name] = printTerm(typeRef, { ctxt: this });
  }
}

export function emptyContext(): Context {
  return Context.empty();
}

export function getBaseType(ctxt: Context, typeName: string): string {
  if (ctxt.termDefinitions && typeName in ctxt.termDefinitions) {
    return getBaseType(ctxt, ctxt.termDefinitions[typeName].typ);
  }
  return typeName;
}

export function getBaseTypeName(typeRef: Term | string): string {
  if (typeof typeRef === 'string') return typeRef;
  if (typeRef.kind === TermKind.Literal) return typeRef.literalName;
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
  if (typeRef.kind === TermKind.Literal) {
    const baseName = getBaseType(ctxt, typeRef.literalName);
    return {
      ...typeRef,
      literalName: baseName,
    };
  }
  return typeRef;
}

export function matchTypes(ctxt: Context, actual: Term | string | undefined, expected: Term | string | undefined): boolean {
  if (!actual || !expected) return false;
  if (isWildcard(actual) || isWildcard(expected)) return true;

  if (typeof actual === 'string') {
    actual = parseTerm(actual, ctxt);
  }
  if (typeof expected === 'string') {
    expected = parseTerm(expected, ctxt);
  }

  if (actual.kind === TermKind.Variable) {
    const actualType = ctxt.variables[actual.varName] ?? ctxt.linearResources[actual.varName] ?? '*';
    return isWildcard(actualType) || matchTypes(ctxt, actualType, expected);
  }
  if (expected.kind === TermKind.Variable) {
    const expectedType = ctxt.variables[expected.varName] ?? ctxt.linearResources[expected.varName] ?? '*';
    return isWildcard(expectedType) || matchTypes(ctxt, actual, expectedType);
  }

  if (actual.kind === TermKind.Literal && expected.kind === TermKind.Literal) {
    if (actual.literalName !== expected.literalName) {
      const actualBase = getBaseType(ctxt, actual.literalName);
      const expectedBase = getBaseType(ctxt, expected.literalName);
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
  if (term.kind === TermKind.Literal && term.unNamedArgs.length === 0 && Object.keys(term.namedArgs).length === 0) {
    if (term.literalName in subst) return subst[term.literalName];
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
  if (formal === '*' || actual === '*') return;

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

  if (formal.kind === TermKind.Literal && formal.unNamedArgs.length === 0 && Object.keys(formal.namedArgs).length === 0) {
    const constrName = formal.literalName;
    if (!(constrName in subst)) {
      subst[constrName] = actual;
    }
    return;
  }

  if (formal.kind === TermKind.Literal && actual.kind === TermKind.Literal) {
    if (formal.literalName !== actual.literalName) {
      const formalBase = getBaseType(ctxt, formal.literalName);
      const actualBase = getBaseType(ctxt, actual.literalName);
      if (formalBase !== actualBase) {
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
      const typeDef = ctxt.getRawData().literals[typeName];
      const disj = typeDef.kind === TypeKind.Binding ? (typeDef.boundType as DisjunctionDef) : (typeDef as DisjunctionDef);
      const constructors = Object.values(disj.constructors);
      if (constructors.length === 0) {
        continue;
      }

      const hasWellFoundedConstructor = constructors.some(c => {
        const argTypes = Object.values(c.arguments);
        return argTypes.every(argType => {
          const baseName = getBaseTypeName(argType);
          return !ctxt.getRawData().literals[baseName] || wellFounded.has(baseName);
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

export function validateAddedTypes(ctxt: Context, constructors: ConjunctionData[]): void {
  const newTypes = new Set(constructors.map(c => c.createdTypeName));
  const wellFounded = new Set<string>();

  const newConstructorsMap = new Map<string, ConjunctionDef[]>();
  for (const typeName of newTypes) {
    const typeDef = ctxt.getRawData().literals[typeName];
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
      if (typeConstrs.length === 0) {
        continue;
      }

      const hasWellFoundedConstructor = typeConstrs.some(c => {
        const argTypes = Object.values(c.arguments);
        return argTypes.every(argType => {
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

export function extendContext(
  ctxt: Context,
  constructors: ConjunctionData[],
  typeParams?: { [paramName: string]: Term },
  typeParamOrder?: string[]
): Context {
  ctxt.extend(constructors, typeParams, typeParamOrder);
  return ctxt;
}

export function createContext(constructors: ConjunctionData[]): Context {
  return extendContext(emptyContext(), constructors);
}

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

export function inferType(
  ctxt: Context,
  term: Term,
  varTypes: { [varName: string]: Term | string } = {}
): string {
  if (term.kind === TermKind.Variable) {
    const typeName = varTypes[term.varName] ?? ctxt.variables[term.varName] ?? ctxt.linearResources[term.varName];
    if (!typeName) {
      throw new Error(`Variable or resource '${term.varName}' has no declared type.`);
    }
    return typeof typeName === 'string' ? typeName : printTerm(typeName, { ctxt });
  }

  // Locate constructor name in ctxt literals or functions
  let foundConstructor: ConjunctionDef | null = null;
  const constructorTypeDef = ctxt.getRawData().literals[term.literalName];
  if (constructorTypeDef) {
    const conj = constructorTypeDef.kind === TypeKind.Binding ? (constructorTypeDef.boundType as ConjunctionDef) : constructorTypeDef;
    if (conj.kind === TypeKind.Conjunction) {
      foundConstructor = conj;
    }
  }

  if (!foundConstructor) {
    const func = ctxt.getRawData().functions[term.literalName];
    if (func) {
      // First, try evaluating the term to see if we get a constructor value
      try {
        const evaluated = evaluateTerm(ctxt, term);
        if (evaluated !== term && (evaluated.kind !== TermKind.Literal || evaluated.literalName !== term.literalName)) {
          return inferType(ctxt, evaluated, varTypes);
        }
      } catch (e) {}

      // If contains free variables, deduce type from patterns and clause bodies
      const firstClause = func.clauses[0];
      if (firstClause) {
        const subVarTypes: { [name: string]: Term | string } = { ...varTypes };
        for (let i = 0; i < Math.min(firstClause.patterns.length, term.unNamedArgs.length); i++) {
          const pat = firstClause.patterns[i];
          const arg = term.unNamedArgs[i];
          const varName = pat.kind === TermKind.Variable ? pat.varName : (pat.kind === TermKind.Literal ? pat.literalName : '');
          if (varName) {
            subVarTypes[varName] = inferType(ctxt, arg, varTypes);
          }
        }
        try {
          return inferType(ctxt, firstClause.body, subVarTypes);
        } catch (e) {
          // Fallback to first non-recursive clause body type
          for (const clause of func.clauses) {
            if (!getFreeVars(clause.body).has(term.literalName) && !printTerm(clause.body).includes(term.literalName)) {
              const subVarTypes2: { [name: string]: Term | string } = { ...varTypes };
              for (let i = 0; i < Math.min(clause.patterns.length, term.unNamedArgs.length); i++) {
                const pat = clause.patterns[i];
                const arg = term.unNamedArgs[i];
                const varName2 = pat.kind === TermKind.Variable ? pat.varName : (pat.kind === TermKind.Literal ? pat.literalName : '');
                if (varName2) {
                  subVarTypes2[varName2] = inferType(ctxt, arg, varTypes);
                }
              }
              try {
                return inferType(ctxt, clause.body, subVarTypes2);
              } catch (e2) {}
            }
          }
        }
      }
      return 'nat';
    }

    throw new Error(`Unknown constructor: '${term.literalName}'`);
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

  const T = c.productTypeName.split('_')[0];
  const ctxtType = ctxt.getRawData().literals[T];
  if (ctxtType) {
    const typeParamOrder = ctxtType.kind === TypeKind.Binding ? (ctxtType as BindingDef).paramOrder : [];
    if (typeParamOrder.length > 0) {
      const actualParams = typeParamOrder.map(p => {
        const val = subst[p] ?? '*';
        return typeof val === 'string' ? parseTerm(val, ctxt) : val;
      });
      return printTerm({
        kind: TermKind.Literal,
        literalName: T,
        unNamedArgs: actualParams,
        namedArgs: {},
      }, { ctxt });
    }
  }

  return T;
}

export function typeCheck(
  ctxt: Context,
  term: Term,
  expectedType: Term | string,
  varTypes: { [varName: string]: Term | string } = {}
): void {
  if (term.kind === TermKind.Variable) {
    const actualType = inferType(ctxt, term, varTypes);
    if (!matchTypes(ctxt, actualType, expectedType)) {
      const expectedStr = typeof expectedType === 'string' ? expectedType : printTerm(expectedType, { ctxt });
      throw new Error(
        `Type mismatch for variable '${term.varName}': expected '${expectedStr}', got '${actualType}'`
      );
    }
    return;
  }

  const baseExpectedType = typeof expectedType === 'string'
    ? getBaseType(ctxt, expectedType)
    : (expectedType.kind === TermKind.Literal ? getBaseType(ctxt, expectedType.literalName) : '*');
  
  const ctxtType = ctxt.getRawData().literals[baseExpectedType];
  if (ctxtType) {
    const disj = ctxtType.kind === TypeKind.Binding ? (ctxtType.boundType as DisjunctionDef) : (ctxtType as DisjunctionDef);
    const c = disj.constructors ? disj.constructors[term.literalName] : null;
    if (c) {
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

      const subst: { [name: string]: Term | string } = {};
      if (typeof expectedType !== 'string' && expectedType.kind === TermKind.Literal) {
        const typeParamOrder = ctxtType.kind === TypeKind.Binding ? (ctxtType as BindingDef).paramOrder : [];
        for (let i = 0; i < typeParamOrder.length; i++) {
          const paramName = typeParamOrder[i];
          if (i < expectedType.unNamedArgs.length) {
            subst[paramName] = expectedType.unNamedArgs[i];
          }
        }
      }

      for (const [argName, argTerm] of matchedArgs.entries()) {
        const expectedArgType = c.arguments[argName];
        const substitutedType = substitute(expectedArgType, subst);
        typeCheck(ctxt, argTerm, substitutedType, varTypes);
      }
      return;
    }
  }

  const inferredType = inferType(ctxt, term, varTypes);
  if (!matchTypes(ctxt, inferredType, expectedType)) {
    const expectedStr = typeof expectedType === 'string' ? expectedType : printTerm(expectedType, { ctxt });
    throw new Error(
      `Type mismatch for constructor term '${term.literalName}': expected '${expectedStr}', got '${inferredType}'`
    );
  }
}

export function parseContext(src: string, existingCtxt?: Context): Context {
  const ctxt = existingCtxt ?? emptyContext();

  const logicTokens = new RegexMatchers({
    keyword: /let\b|type\b|fun\b|action\b/,
    typeParam: /'[a-zA-Z_][a-zA-Z0-9_]*/,
    var: /\?[a-zA-Z_][a-zA-Z0-9_]*/,
    ident: /[a-zA-Z_][a-zA-Z0-9_]*/,
    number: /0|[1-9][0-9]*/,
    symbol: matchOneOf("= | { } : , ( ) ; < > -o *"),
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
        typeParams[p] = constr('*');
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

export function printContext(ctxt: Context): string {
  const declarations: string[] = [];

  for (const typeName of Object.keys(ctxt.types).sort()) {
    const typeDef = ctxt.getRawData().literals[typeName];
    const disj = typeDef.kind === TypeKind.Binding ? (typeDef.boundType as DisjunctionDef) : (typeDef as DisjunctionDef);
    const constrDecls: string[] = [];
    const constructorsList = Object.values(disj.constructors);
    for (const c of constructorsList.sort((a, b) => a.constructorName.localeCompare(b.constructorName))) {
      const argKeys = c.argOrder ?? Object.keys(c.arguments).sort();
      if (argKeys.length === 0) {
        constrDecls.push(c.constructorName);
      } else {
        const fields = argKeys.map(k => {
          const typeVal = c.arguments[k];
          const typeStr = typeof typeVal === 'string' ? typeVal : printTerm(typeVal, { ctxt });
          return `${k}: ${typeStr}`;
        }).join(', ');
        constrDecls.push(`${c.constructorName}(${fields})`);
      }
    }

    let paramsStr = '';
    const typeParamOrder = typeDef.kind === TypeKind.Binding ? (typeDef as BindingDef).paramOrder : [];
    if (typeParamOrder.length > 0) {
      paramsStr = `<${typeParamOrder.join(', ')}>`;
    }
    declarations.push(`type ${typeName}${paramsStr} = ${constrDecls.join(' | ')};`);
  }

  if (ctxt.termDefinitions) {
    for (const termName of Object.keys(ctxt.termDefinitions).sort()) {
      const termInfo = ctxt.termDefinitions[termName];
      declarations.push(`let ${termName} = ${printTerm(termInfo.def, { ctxt })};`);
    }
  }

  const functions = ctxt.getRawData().functions;
  if (functions) {
    for (const funcName of Object.keys(functions).sort()) {
      const func = functions[funcName];
      const clauseStrs = func.clauses.map((c: any) => {
        const patternsStr = c.patterns.map((p: any) => printTerm(p, { ctxt })).join(', ');
        return `fun ${funcName}(${patternsStr}) = ${printTerm(c.body, { ctxt })}`;
      });
      declarations.push(`${clauseStrs.join(' | ')};`);
    }
  }

  const actions = ctxt.getRawData().actions;
  if (actions) {
    for (const actionName of Object.keys(actions).sort()) {
      const action = actions[actionName];
      const printResource = (r: any) => `?${r.varName}: ${printTerm(r.typePattern, { ctxt })}`;
      const lhs = action.lhs.map(printResource).join(', ');
      const rhs = action.rhs.map(printResource).join(', ');
      declarations.push(`action ${actionName}: { ${lhs} } -o { ${rhs} };`);
    }
  }

  if (ctxt.linearResources) {
    for (const varName of Object.keys(ctxt.linearResources).sort()) {
      const typeName = ctxt.linearResources[varName];
      declarations.push(`${varName}: ${typeName};`);
    }
  }

  if (ctxt.variables) {
    for (const varName of Object.keys(ctxt.variables).sort()) {
      const typeVal = ctxt.variables[varName];
      const typeStr = printTerm(typeVal, { ctxt });
      declarations.push(`?${varName}: ${typeStr};`);
    }
  }

  return declarations.join('\n');
}

export function printLinearContext(ctxt: Context): string {
  const declarations: string[] = [];

  const actions = ctxt.getRawData().actions;
  if (actions) {
    for (const actionName of Object.keys(actions).sort()) {
      const action = actions[actionName];
      const printResource = (r: any) => `?${r.varName}: ${printTerm(r.typePattern, { ctxt })}`;
      const lhs = action.lhs.map(printResource).join(', ');
      const rhs = action.rhs.map(printResource).join(', ');
      declarations.push(`action ${actionName}: { ${lhs} } -o { ${rhs} };`);
    }
  }

  if (ctxt.linearResources) {
    for (const varName of Object.keys(ctxt.linearResources).sort()) {
      const typeName = ctxt.linearResources[varName];
      declarations.push(`${varName}: ${typeName};`);
    }
  }

  return declarations.join('\n');
}

export function parseTerm(src: string, constructors?: Set<string> | Context): Term {
  const termTokens = new RegexMatchers({
    keyword: /let\b|type\b|fun\b/,
    typeParam: /'[a-zA-Z_][a-zA-Z0-9_]*/,
    var: /\?[a-zA-Z_][a-zA-Z0-9_]*/,
    ident: /[a-zA-Z_][a-zA-Z0-9_]*/,
    number: /0|[1-9][0-9]*/,
    symbol: matchOneOf("= | { } : , ( ) ; < >"),
    ws: /\s+/,
  });

  const stream = new FilterStream(
    new MatchersStream(src, termTokens),
    (t: Token) => t.kind !== "ws"
  );

  const constrNameParser = or(kind("number"), kind("ident"), kind("typeParam"), tokenOf("symbol", ["="]).map(() => "="));

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

export function printTerm(term: Term, options?: { verbose?: boolean; ctxt?: Context }): string {
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
    return `${term.literalName}{ ${fields} }`;
  }

  if (options?.ctxt && term.unNamedArgs.length > 0) {
    const baseTypeName = getBaseType(options.ctxt, term.literalName);
    const typeConst = options.ctxt.getRawData().literals[baseTypeName];
    if (typeConst) {
      const typeParamOrder = typeConst.kind === TypeKind.Binding ? (typeConst as BindingDef).paramOrder : [];
      if (typeParamOrder.length > 0) {
        const args = term.unNamedArgs.map(t => printTerm(t, options)).join(', ');
        return `${term.literalName}<${args}>`;
      }
    }
  }

  if (term.unNamedArgs.length === 0) {
    return term.literalName;
  }

  const args = term.unNamedArgs.map(t => printTerm(t, options)).join(', ');
  return `${term.literalName}(${args})`;
}

/**
 * Recursively reduces a function application term using call-by-value pattern matching clauses.
 */
export function evaluateTerm(ctxt: Context, term: Term): Term {
  if (term.kind === TermKind.Variable) {
    return term;
  }

  const reducedUnNamed = term.unNamedArgs.map(arg => evaluateTerm(ctxt, arg));
  const reducedNamed: { [argName: string]: Term } = {};
  for (const [k, v] of Object.entries(term.namedArgs)) {
    reducedNamed[k] = evaluateTerm(ctxt, v);
  }

  const reducedTerm: Term = {
    ...term,
    unNamedArgs: reducedUnNamed,
    namedArgs: reducedNamed,
  };

  const func = ctxt.getRawData().functions[reducedTerm.literalName];
  if (func) {
    for (const clause of func.clauses) {
      const subst: { [varName: string]: Term } = {};
      if (matchPatterns(ctxt, clause.patterns, reducedTerm.unNamedArgs, subst)) {
        const substitutedBody = substitute(clause.body, subst) as Term;
        return evaluateTerm(ctxt, substitutedBody);
      }
    }
  }

  return reducedTerm;
}

export function matchPatterns(
  ctxt: Context,
  patterns: Term[],
  args: Term[],
  subst: { [varName: string]: Term }
): boolean {
  if (patterns.length !== args.length) return false;

  for (let i = 0; i < patterns.length; i++) {
    if (!matchPattern(ctxt, patterns[i], args[i], subst)) {
      return false;
    }
  }
  return true;
}

export function matchPattern(
  ctxt: Context,
  pattern: Term,
  arg: Term,
  subst: { [varName: string]: Term }
): boolean {
  const isPatVar =
    pattern.kind === TermKind.Variable ||
    (pattern.kind === TermKind.Literal &&
     pattern.unNamedArgs.length === 0 &&
     Object.keys(pattern.namedArgs).length === 0 &&
     !(pattern.literalName in ctxt.getRawData().literals) &&
     !(pattern.literalName in ctxt.getRawData().functions) &&
     !['nat', 'natList', 'tree', '*', '0', 'suc', 'nil', 'cons', 'leaf', 'node'].includes(pattern.literalName));

  if (isPatVar) {
    const varName = pattern.kind === TermKind.Variable ? pattern.varName : (pattern as Literal).literalName;
    if (varName in subst) {
      return matchTypes(ctxt, subst[varName], arg);
    }
    subst[varName] = arg;
    return true;
  }

  if (pattern.kind === TermKind.Literal && arg.kind === TermKind.Literal) {
    if (pattern.literalName !== arg.literalName) return false;
    if (pattern.unNamedArgs.length !== arg.unNamedArgs.length) return false;
    for (let i = 0; i < pattern.unNamedArgs.length; i++) {
      if (!matchPattern(ctxt, pattern.unNamedArgs[i], arg.unNamedArgs[i], subst)) return false;
    }
    const patKeys = Object.keys(pattern.namedArgs);
    for (const k of patKeys) {
      if (!(k in arg.namedArgs)) return false;
      if (!matchPattern(ctxt, pattern.namedArgs[k], arg.namedArgs[k], subst)) return false;
    }
    return true;
  }

  return false;
}

/**
 * Resolves a pattern-matching equation, returning the bound variables substitution mapping.
 * Matches "= (lhs, rhs)" where lhs is evaluated and unified with rhs.
 */
export function solveEquation(ctxt: Context, equation: Term): { [varName: string]: Term } {
  if (equation.kind === TermKind.Literal && equation.literalName === '=') {
    const lhs = equation.unNamedArgs[0];
    const rhs = equation.unNamedArgs[1];
    if (lhs && rhs) {
      const evaluatedLhs = evaluateTerm(ctxt, lhs);
      const subst: { [name: string]: Term | string } = {};
      unify(ctxt, rhs, evaluatedLhs, subst);
      
      const result: { [varName: string]: Term } = {};
      for (const [k, v] of Object.entries(subst)) {
        result[k] = typeof v === 'string' ? parseTerm(v, ctxt) : v;
      }
      return result;
    }
  }
  return {};
}
