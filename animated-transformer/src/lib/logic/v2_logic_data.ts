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


export enum TermKind {
  Literal = 'Literal',
  Variable = 'Variable',
}

/**
 * Represents a literal value, supporting both positional
 * applications like `cons(suc(0), nil)` and record-style applications like
 * `node{ left = leaf, val = suc(0), right = leaf }`.
 */
export type Literal = {
  kind: TermKind.Literal;
  literalName: string;
  unNamedArgs: Term[];
  namedArgs: {
    [argName: string]: Term;
  };
};

/**
 * Represents a logical/type variable term, prefixed with `?` in the syntax.
 */
export type Variable = {
  kind: TermKind.Variable;
  varName: string;
};

export type Term = Literal | Variable;


enum TypeKind {
  Conjunction = 'Conjunction',
  Disjunction = 'Disjunction',
  Binding = 'Binding'
}

/**
 * Represents a Conjunction (constructor), which is a product of named field arguments.
 * Sometimes also called a record.
 * 
 * Example: cons(h: x, t: list(x))
 */
export type ConjunctionDef = {
  kind: TypeKind.Conjunction;
  constructorName: string;
  productTypeName: string;
  arguments: {
    // The argument name and it's type as a term: may use variable to refer to 
    // parameters, or literal names for types.
    [argName: string]: Term; 
  };
  argOrder?: string[];
};

/**
 * Represents a disjunction of types, also called a sum, or Abstract Data Type (ADT).
 * 
 * Example: List is the disjunction of nil or cons.
 */
export type DisjunctionDef = {
  kind: TypeKind.Disjunction;
  sumTypeName: string;
  constructors: { [constructorName: string]: ConjunctionDef };
};

export type BindingDef = {
  kind: TypeKind.Binding;
  boundTypeName: string;
  params: { [paramName: string]: string };
  paramOrder: string[];
  boundType: DisjunctionDef | ConjunctionDef;
};

export type TypeDef = BindingDef | DisjunctionDef | ConjunctionDef;


// Definition for a `literal`, e.g. the term `cons(suc(0), nil)` refers to 4 literals:
// `cons`, `suc`, `0`, and `nil`. The literal `cons`, for it's part has type 
// Binding <?a>, then takes a record with fields head and tail of type ?a and List<?a> 
// respectively. 
export type LiteralDef = {
  literalName: string;
  type: TypeDef;
};


export type ContextData = {
  literals: { [typeName: string]: TypeDef };
  variables: { [varName: string]: string };
};