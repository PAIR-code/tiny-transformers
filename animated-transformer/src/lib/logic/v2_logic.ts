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

import {TermKind, Literal, Variable, TypeKind, ConjunctionDef, DisjunctionDef, BindingDef, TypeDef, LiteralDef, ContextData} from './v2_logic_data';

/**
 * Represents a Conjunctive Type (constructor), which is a product of named field arguments.
 * Example: cons(h: x, t: list(x))
 *
 * Instances of Conjunction can only be created if they are well-formed and registered
 * in a valid parent Disjunction and Context.
 */
export class Conjunction {
  /**
   * Constructs a Conjunction.
   * Validates that:
   *  1. The parent Disjunction context matches the given Context.
   *  2. The Conjunction createdTypeName matches the parent Disjunction typeName.
   *  3. The constructor is already registered and matches the data in the parent Disjunction.
   */
  constructor(
    public readonly context: Context,
    public readonly disjunction: Disjunction,
    private readonly data: ConjunctionDef
  ) {
    if (context !== disjunction.context) {
      throw new Error(`ConjunctiveType context does not match parent DisjunctiveType context.`);
    }
    if (data.createdTypeName !== disjunction.typeName) {
      throw new Error(
        `ConjunctiveType constructor '${data.constructorName}' createdTypeName '${data.createdTypeName}' does not match parent disjunctive type name '${disjunction.typeName}'.`
      );
    }
    const registered = disjunction.getRawData().constructors[data.constructorName];
    if (!registered) {
      throw new Error(
        `Cannot construct ConjunctiveType: constructor '${data.constructorName}' is not registered in type '${disjunction.typeName}'.`
      );
    }
    if (registered !== data) {
      throw new Error(
        `ConjunctiveType data for constructor '${data.constructorName}' does not match registered disjunctive type data.`
      );
    }
  }

  get constructorName(): string {
    return this.data.constructorName;
  }

  get createdTypeName(): string {
    return this.data.createdTypeName;
  }

  get arguments(): { [argName: string]: Term | string } {
    return this.data.arguments;
  }

  get argOrder(): string[] {
    return this.data.argOrder ?? Object.keys(this.data.arguments).sort();
  }

  getRawData(): ConjunctionDef {
    return this.data;
  }
}

/**
 * Represents a Disjunctive Type (ADT), which is a sum (union) of conjunctive type constructors,
 * optionally parameterised by type parameters (generic types, e.g., <x>).
 *
 * Instances of DisjunctiveType can only be created if they are well-formed and registered
 * in a valid Context.
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
    if (baseType in ctxt.getRawData().types || ['nat', 'natList', 'tree', '_'].includes(baseType)) return;
    throw new Error(`Unknown type reference: '${typeRef}'`);
  }

  if (typeRef.kind === TermKind.Variable) {
    const varName = typeRef.varName;
    if (varName in ctxt.variables || allowedVars.has(varName)) return;
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
    if (baseType in ctxt.getRawData().types || ['nat', 'natList', 'tree', '_'].includes(baseType)) {
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
 * Represents a Disjunctive Type (ADT), which is a sum (union) of conjunctive type constructors,
 * optionally parameterised by type parameters (generic types, e.g., <x>).
 *
 * Instances of Disjunction can only be created if they are well-formed and registered
 * in a valid Context.
 */
export class Disjunction {
  /**
   * Constructs a Disjunction.
   * Validates that:
   *  1. The typeName matches a valid identifier pattern.
   *  2. All type parameters start with a single quote (') and do not conflict with existing types.
   *  3. All field argument types are well-formed (either recursive, type parameters, or pre-existing).
   *  4. The typeName is registered and matches the data in the parent Context.
   */
  constructor(
    public readonly context: Context,
    public readonly typeName: string,
    private readonly data: DisjunctionDef
  ) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(typeName)) {
      throw new Error(`Invalid type name identifier: '${typeName}'`);
    }
    
    // Validate type parameters
    const paramOrder = data.typeParamOrder ?? [];
    for (const p of paramOrder) {
      if (!p.startsWith("'")) {
        throw new Error(`Type parameter '${p}' must start with a single quote character.`);
      }
      if (p in context.getRawData().types) {
        throw new Error(`Type parameter name '${p}' conflicts with an existing type name in the context.`);
      }
    }

    // Validate all constructor argument type references
    const allowedVars = new Set(paramOrder);
    for (const c of Object.values(data.constructors)) {
      for (const [argName, argType] of Object.entries(c.arguments)) {
        validateTypeRef(context, argType, allowedVars, typeName);
      }
    }

    const registered = context.getRawData().types[typeName];
    if (!registered) {
      throw new Error(`Cannot construct DisjunctiveType: type '${typeName}' is not registered in the context.`);
    }
    if (registered !== data) {
      throw new Error(`DisjunctiveType data for type '${typeName}' does not match registered context data.`);
    }
  }

  get typeParams(): { [paramName: string]: string } {
    return this.data.typeParams ?? {};
  }

  get typeParamOrder(): string[] {
    return this.data.typeParamOrder ?? [];
  }

  get constructors(): { [constructorName: string]: Conjunction } {
    const result: { [constructorName: string]: Conjunction } = {};
    for (const constrName of Object.keys(this.data.constructors)) {
      result[constrName] = new Conjunction(
        this.context,
        this,
        this.data.constructors[constrName]
      );
    }
    return result;
  }

  getRawData(): DisjunctionDef {
    return this.data;
  }
}

export class Context {
  private constructor(private readonly data: ContextData) {}

  static empty(): Context {
    return new Context({
      types: {},
      termDefinitions: {},
      variables: {},
    });
  }

  static parse(src: string, existing?: Context): Context {
    return parseContext(src, existing);
  }

  get types(): { [typeName: string]: Disjunction } {
    const result: { [typeName: string]: Disjunction } = {};
    for (const typeName of Object.keys(this.data.types)) {
      result[typeName] = new Disjunction(this, typeName, this.data.types[typeName]);
    }
    return result;
  }

  get termDefinitions(): { [name: string]: { def: Term; typ: string } } {
    return this.data.termDefinitions;
  }

  get variables(): { [varName: string]: string } {
    return this.data.variables;
  }

  getRawData(): ContextData {
    return this.data;
  }

  extend(
    constructors: ConjunctionDef[],
    typeParams?: { [paramName: string]: string },
    typeParamOrder?: string[]
  ): void {
    const createdKeys = new Set<string>();
    for (const c of constructors) {
      if (!(c.createdTypeName in this.data.types)) {
        this.data.types[c.createdTypeName] = { constructors: {} };
        createdKeys.add(c.createdTypeName);
      }
    }
    const typeName = constructors[0]?.createdTypeName;
    if (typeName && typeParams && typeParamOrder) {
      this.data.types[typeName].typeParams = typeParams;
      this.data.types[typeName].typeParamOrder = typeParamOrder;
    }

    try {
      validateAddedTypes(this, constructors);
    } catch (e) {
      // Transactional rollback: delete any newly initialized types
      for (const tk of createdKeys) {
        delete this.data.types[tk];
      }
      throw e;
    }

    for (const c of constructors) {
      if (c.constructorName in this.data.types[c.createdTypeName].constructors && this.data.types[c.createdTypeName].constructors[c.constructorName] !== c) {
        throw new Error(`Cannot add constructor twice: ${c.constructorName}`);
      }
      this.data.types[c.createdTypeName].constructors[c.constructorName] = c;
    }

    validateContext(this);
  }

  defineTerm(name: string, term: Term): void {
    const freeVars = getFreeVars(term);
    for (const fv of freeVars) {
      if (!(fv in this.data.variables)) {
        this.data.variables[fv] = '_';
      }
    }
    const typeName = inferType(this, term, this.data.variables);
    this.data.termDefinitions[name] = { def: term, typ: typeName };
  }

  declareVariable(name: string, typeRef: Term): void {
    const freeVars = getFreeVars(typeRef);
    for (const fv of freeVars) {
      if (!(fv in this.data.variables)) {
        this.data.variables[fv] = '_';
      }
    }
    this.data.variables[name] = printTerm(typeRef, { ctxt: this });
  }
}

/**
 * Creates a completely empty context.
 */
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
export function validateAddedTypes(ctxt: Context, constructors: ConjunctionDef[]): void {
  const newTypes = new Set(constructors.map(c => c.createdTypeName));
  const wellFounded = new Set<string>();

  // Combine existing constructors in ctxt with the newly added ones for validation
  const newConstructorsMap = new Map<string, ConjunctionDef[]>();
  for (const typeName of newTypes) {
    const existingConstrs = ctxt.types[typeName]
      ? Object.values(ctxt.types[typeName].constructors).map(c => c.getRawData())
      : [];
    const addedConstrs = constructors.filter(c => c.createdTypeName === typeName);

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

export function extendContext(
  ctxt: Context,
  constructors: ConjunctionDef[],
  typeParams?: { [paramName: string]: string },
  typeParamOrder?: string[]
): Context {
  ctxt.extend(constructors, typeParams, typeParamOrder);
  return ctxt;
}

export function createContext(constructors: ConjunctionDef[]): Context {
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
  let foundConstructor: Conjunction | null = null;
  for (const typeName of Object.keys(ctxt.types)) {
    const c = ctxt.types[typeName].constructors[term.literalName];
    if (c) {
      if (foundConstructor) {
        throw new Error(
          `Ambiguous constructor name: '${term.literalName}' is defined in both '${foundConstructor.createdTypeName}' and '${typeName}'`
        );
      }
      foundConstructor = c;
    }
  }

  if (!foundConstructor) {
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
        kind: TermKind.Literal,
        literalName: T,
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
    : (expectedType.kind === TermKind.Literal ? getBaseType(ctxt, expectedType.literalName) : '_');
  const ctxtType = ctxt.types[baseExpectedType];
  if (ctxtType) {
    const c = ctxtType.constructors[term.literalName];
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
      if (typeof expectedType !== 'string' && expectedType.kind === TermKind.Literal) {
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
      `Type mismatch for constructor term '${term.literalName}': expected '${expectedStr}', got '${inferredType}'`
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
    typeParam: /'[a-zA-Z_][a-zA-Z0-9_]*/,
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

  const constrNameParser = or(kind("number"), kind("ident"), kind("typeParam"));

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
          kind: TermKind.Literal as const,
          constructorName,
          unNamedArgs: [],
          namedArgs,
        };
      }),
      // Constructor with angle bracket arguments: list<'a> or list<nat>
      seq(
        constrNameParser,
        delimited("<", withSep(",", termParser), ">")
      ).map(r => {
        const constructorName = r[0];
        const args = r[1];
        return {
          kind: TermKind.Literal as const,
          constructorName,
          unNamedArgs: args,
          namedArgs: {},
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
          kind: TermKind.Literal as const,
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
          kind: TermKind.Literal as const,
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

    const typeParams: { [paramName: string]: string } = {};
    const typeParamOrder: string[] = [];
    if (typeParamsList) {
      for (const p of typeParamsList) {
        typeParams[p] = '_';
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
      ctxt.extend(decl.constructors, decl.typeParams, decl.typeParamOrder);
    } else if (decl.kind === 'Term') {
      ctxt.defineTerm(decl.termName, decl.term);
    } else if (decl.kind === 'Var') {
      ctxt.declareVariable(decl.varName, decl.typeName);
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
    const constructorsList = Object.values(typeConstruction.constructors) as Conjunction[];
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

    // Print type parameters if defined using angle brackets
    let paramsStr = '';
    if (typeConstruction.typeParamOrder && typeConstruction.typeParamOrder.length > 0) {
      paramsStr = `<${typeConstruction.typeParamOrder.join(', ')}>`;
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

  const constrNameParser = or(kind("number"), kind("ident"), kind("typeParam"));

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
          kind: TermKind.Literal as const,
          constructorName,
          unNamedArgs: [],
          namedArgs,
        };
      }),
      // Constructor with angle bracket arguments: list<'a> or list<nat>
      seq(
        constrNameParser,
        delimited("<", withSep(",", termParser), ">")
      ).map(r => {
        const constructorName = r[0];
        const args = r[1];
        return {
          kind: TermKind.Literal as const,
          constructorName,
          unNamedArgs: args,
          namedArgs: {},
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
          kind: TermKind.Literal as const,
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
          kind: TermKind.Literal as const,
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

  // Check if it represents an angle-bracket parameterised type application
  if (options?.ctxt && term.unNamedArgs.length > 0) {
    const baseTypeName = getBaseType(options.ctxt, term.literalName);
    const typeConst = options.ctxt.types[baseTypeName];
    if (typeConst && typeConst.typeParamOrder && typeConst.typeParamOrder.length > 0) {
      const args = term.unNamedArgs.map(t => printTerm(t, options)).join(', ');
      return `${term.literalName}<${args}>`;
    }
  }

  if (term.unNamedArgs.length === 0) {
    return term.literalName;
  }

  const args = term.unNamedArgs.map(t => printTerm(t, options)).join(', ');
  return `${term.literalName}(${args})`;
}
