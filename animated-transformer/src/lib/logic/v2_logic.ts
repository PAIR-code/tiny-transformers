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

// TODO: think about loop types and don't allow them.
export function createTypeContext(constructors: TypeConstructor[]): TypeContext {
  const ctxt: TypeContext = {
    types: {},
  };
  for (const c of constructors) {
    if (c.createdTypeName in ctxt) {
      if (c.constructorName in ctxt.types[c.createdTypeName].constructors) {
        throw new Error(`Cannot add constructor twice: ${c.constructorName}`);
      }
      ctxt.types[c.createdTypeName].constructors[c.constructorName] = c;
    }
  }
  return ctxt;
}
