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

import { Term, TermKind, TypeKind, BindingDef, DisjunctionDef, Escaped, FunctionClauseDef, ActionResource } from './logic_data';
import { getBaseType, Context } from './logic';

/**
 * Pretty-prints a structured `Term` object back into its canonical string representation.
 * Handles concise printing of variables, parameterized terms, and named-argument syntax.
 */
export function printTerm(term: Term, options?: { verbose?: boolean; ctxt?: Context }): string {
  if (term.kind === TermKind.Variable) {
    return `?${term.varName}`;
  }
  if (term.kind === TermKind.Escaped) {
    return term.value.toString();
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
    const typeConst = options.ctxt.getRawData().types[baseTypeName] ?? options.ctxt.getRawData().constructors[baseTypeName];
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
 * Prints the entire logic context (types, terms, functions, actions, and linear resources)
 * back into its canonical logic source code syntax.
 */
export function printContext(ctxt: Context): string {
  const declarations: string[] = [];

  for (const typeName of Object.keys(ctxt.types).sort()) {
    const typeDef = ctxt.getRawData().types[typeName];
    const disj = typeDef.kind === TypeKind.Binding ? (typeDef.boundType as DisjunctionDef) : (typeDef as DisjunctionDef);
    const constrs = Object.keys(disj.constructors);
    const subUnions = disj.subUnions ? Array.from(disj.subUnions) : [];
    const allVariants = [...constrs, ...subUnions].sort();
    const constrDecls: string[] = [];
    for (const cName of allVariants) {
      if (disj.constructors[cName]) {
        const c = disj.constructors[cName];
        const argOrder = c.argOrder ?? Object.keys(c.arguments).sort();
        if (argOrder.length > 0) {
          const args = argOrder.map(argName => {
            const argType = c.arguments[argName];
            return `${argName}: ${printTerm(argType, { ctxt })}`;
          }).join(', ');
          constrDecls.push(`${cName}(${args})`);
        } else {
          constrDecls.push(cName);
        }
      } else {
        constrDecls.push(cName);
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
      if (func.kind === 'clause') {
        const clauseStrs = func.clauses.map((c: FunctionClauseDef) => {
          const patternsStr = c.patterns.map((p: Term) => printTerm(p, { ctxt })).join(', ');
          return `fun ${funcName}(${patternsStr}) = ${printTerm(c.body, { ctxt })}`;
        });
        declarations.push(`${clauseStrs.join(' | ')};`);
      } else {
        declarations.push(`// TS function: ${funcName}`);
      }
    }
  }

  const actions = ctxt.getRawData().actions;
  if (actions) {
    for (const actionName of Object.keys(actions).sort()) {
      const action = actions[actionName];
      const printResource = (r: ActionResource) => `?${r.varName}: ${printTerm(r.typePattern, { ctxt })}`;
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

/**
 * Prints the linear resources and logic actions in the context into logic source code.
 */
export function printLinearContext(ctxt: Context): string {
  const declarations: string[] = [];

  const actions = ctxt.getRawData().actions;
  if (actions) {
    for (const actionName of Object.keys(actions).sort()) {
      const action = actions[actionName];
      const printResource = (r: ActionResource) => `?${r.varName}: ${printTerm(r.typePattern, { ctxt })}`;
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


