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
=============================================================================*/

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

/**
 * Identifies the kind of Type/Literal definition.
 */
export enum TypeKind {
  /** Product type / constructor record signature (e.g., cons). */
  Conjunction = 'Conjunction',
  /** Sum type / Algebraic Data Type (e.g., list). */
  Disjunction = 'Disjunction',
  /** Polymorphic/generic type parameter binding wrapper. */
  Binding = 'Binding'
}

/**
 * Represents a Conjunction (constructor product type), which is a product of named field arguments.
 * Sometimes also called a record signature.
 * 
 * Example: cons(h: 'x, t: list<'x>) has created productTypeName `list_cons`.
 */
export type ConjunctionDef = {
  kind: TypeKind.Conjunction;
  /** The name of the constructor (e.g., 'cons'). */
  constructorName: string;
  /** Programmatically generated product type name (e.g., 'list_cons'). */
  productTypeName: string;
  /** Record fields mapping argument names to their Type Terms. */
  arguments: {
    // The argument name and it's type as a term: may use variable to refer to 
    // parameters, or literal names for types.
    [argName: string]: Term; 
  };
  /** Optional explicit order of record field arguments. */
  argOrder?: string[];
};

/**
 * Represents a disjunction of types, also called a sum, or Abstract Data Type (ADT).
 * 
 * Example: List is the sum disjunction of nil or cons.
 */
export type DisjunctionDef = {
  kind: TypeKind.Disjunction;
  /** The name of the sum type (e.g., 'list'). */
  sumTypeName: string;
  /** The sum constructors map. */
  constructors: { [constructorName: string]: ConjunctionDef };
};

/**
 * Represents a polymorphic generic parameter binding wrapper.
 * Wraps a DisjunctionDef or ConjunctionDef with generic parameters mapping to '_'.
 */
export type BindingDef = {
  kind: TypeKind.Binding;
  /** The generic bound type name (e.g., 'list'). */
  boundTypeName: string;
  /** 
   * Generic parameter names map.
   * - Key: Generic parameter variable name (e.g., "'x").
   * - Value: A placeholder/wildcard type term (e.g., '*').
   */
  params: { [paramName: string]: Term };
  /** The explicit order of generic parameters. */
  paramOrder: string[];
  /** The bound concrete sum type or record type. */
  boundType: DisjunctionDef | ConjunctionDef;
};

/**
 * Unified Type & Function Definition algebraic sum.
 * All declarations are represented uniformly as TypeDefs in the Context.
 */
export type TypeDef = BindingDef | DisjunctionDef | ConjunctionDef;

/**
 * Definition for a `literal`, e.g. the term `cons(suc(0), nil)` refers to 4 literals:
 * `cons`, `suc`, `0`, and `nil`. The literal `cons`, for it's part has type 
 * Binding <?a>, then takes a record with fields head and tail of type ?a and List<?a> 
 * respectively. 
 */
export type LiteralDef = {
  literalName: string;
  type: TypeDef;
};

/**
 * Represents a single pattern-matching clause for an intuitionistic function.
 * 
 * Example pattern clause:
 *   `fun add(suc(x), y) = suc(add(x, y))`
 * has `patterns: [suc(x), y]` and `body: suc(add(x, y))`.
 */
export type FunctionClauseDef = {
  /** List of pattern terms (constructors, constants, or pattern variables). */
  patterns: Term[];
  /** The body reduction term. */
  body: Term;
};

/**
 * Represents a pattern-matching function definition.
 * 
 * Example:
 * ```sml
 * fun add(suc(x), y) = suc(add(x, y)) | fun add(0, y) = y;
 * ```
 * is stored under key `'add'` in the `functions` context data registry!
 */
export type FunctionDef = {
  /** The name of the function literal (e.g., 'add'). */
  funcName: string;
  /** List of pattern-matching clauses. */
  clauses: FunctionClauseDef[];
};

export type ActionResource = {
  varName: string;
  typePattern: Term;
};

export type LolliAction = {
  name: string;
  lhs: ActionResource[];
  rhs: ActionResource[];
};

/**
 * Safe, validated Context storage structure.
 * Stores all sum types, polymorphic binders, and constructor record signatures
 * uniformly in the `literals` registry, term-level functions in the `functions` registry,
 * and linear lolli actions in the `actions` registry.
 */
export type ContextData = {
  /** Mapping from a type name (e.g., an ADT for 'nat') to its Definition. */
  types: { [typeName: string]: TypeDef };

  /** Mapping from a constructor name (e.g., 'cons') to its Definition. */
  constructors: { [constrName: string]: TypeDef };

  /**
   * Mapping representing active transient linear resources.
   * - Key: The unique linear resource identifier name (must start with '_', e.g., '_r1').
   * - Value: The pretty-printed type term string of the resource (e.g., 'suc(0)').
   */
  linearResources: { [resName: string]: string };

  /**
   * Mapping representing context-wide type variables that can be instantiated.
   * - Key: The context-wide variable name (e.g., '?y').
   * - Value: The pretty-printed declared or inferred type term (e.g., 'nat' or '*' for 
   *   unknown/universal type).
   */
  variables: { [varName: string]: Term };

  /** Mapping from a function literal name (e.g., 'add') to its pattern-matching definition. */
  functions: { [funcName: string]: FunctionDef };

  /** Mapping from a linear lolli action name (e.g., 'sum') to its LolliAction definition. */
  actions: { [actionName: string]: LolliAction };
};
