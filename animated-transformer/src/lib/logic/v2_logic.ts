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
