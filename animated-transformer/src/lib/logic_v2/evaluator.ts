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

import { Term, TermKind, TypeKind, BindingDef, Literal, Escaped } from './logic_data';
import { matchTypes, substitute, unify, parseTerm, getFreeVars, Context } from './logic';
import { printTerm } from './printer';

/**
 * Recursively evaluates and reduces a logic term using call-by-value (CBV) reduction.
 * If the term is a function application, it matches patterns against active function 
 * clauses, performs variable substitution, and evaluates the resulting clause body.
 */
export function evaluateTerm(ctxt: Context, term: Term): Term {
  if (term.kind === TermKind.Variable) {
    return term;
  }
  if (term.kind === TermKind.Escaped) {
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

/**
 * Matches an array of pattern terms against an array of actual value arguments.
 * Iteratively unifies each pair, populating the `subst` bindings mapping.
 * Returns true if all arguments successfully match their corresponding patterns.
 */
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

/**
 * Matches a single pattern term against an actual value argument.
 * Detects implicit pattern variables (lower-case literals or logic variables) 
 * and binds them to value terms in the `subst` mapping.
 * Performs recursive structural matching for constructor literals.
 */
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
     !(pattern.literalName in ctxt.getRawData().types) &&
     !(pattern.literalName in ctxt.getRawData().constructors) &&
     !(pattern.literalName in ctxt.getRawData().functions) &&
     !['nat', 'natList', 'tree', '*', '0', 'suc', 'nil', 'cons', 'leaf', 'node'].includes(pattern.literalName));

  if (pattern.kind === TermKind.Escaped) {
    return arg.kind === TermKind.Escaped && pattern.value.equals(arg.value);
  }

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
 * Solves a pattern-matching equation of the form `= (lhs, rhs)` (i.e. `lhs = rhs`).
 * Evaluates the left-hand side (LHS) and unifies it with the right-hand side (RHS) pattern,
 * returning a dictionary containing all synthesized variable bindings.
 */
export function solveEquation(ctxt: Context, equation: Term): { [varName: string]: Term } {
  if (equation.kind === TermKind.Literal && equation.literalName === '=') {
    const lhs = equation.unNamedArgs[0];
    const rhs = equation.unNamedArgs[1];
    if (lhs && rhs) {
      const evaluatedLhs = evaluateTerm(ctxt, lhs);
      const subst: { [name: string]: Term } = {};
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
