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
  Term,
  TermKind,
  Context,
  parseTerm,
  printTerm,
  evaluateTerm,
  unify,
  substitute,
  matchTypes,
  inferType,
} from './v2_logic';

export type LinearResource = {
  name: string; // e.g., '_r1'
  type: Term;   // e.g., '0'
};

export type LolliAction = {
  name: string;
  lhs: { varName: string; typePattern: Term }[];
  rhs: { varName: string; typePattern: Term }[];
};

export type ActionMatch = {
  action: LolliAction;
  // Map from LHS pattern variable name (e.g., 'x') to the matched resource name (e.g., '_r1')
  matchedResources: Map<string, string>;
  // Substitution for pattern variables inside the types (e.g., 'x' mapped to Term '0')
  subst: { [varName: string]: Term };
};

// Helper to split commas only at the top level (not inside parentheses, braces, or angle brackets)
export function splitTopLevelCommas(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(' || char === '{' || char === '<') {
      depth++;
      current += char;
    } else if (char === ')' || char === '}' || char === '>') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

/**
 * Parses a Lolli Action from string syntax.
 * Example: `grow: {?x: nat} -o { ?y: suc(?x) }`
 */
export function parseLolliAction(src: string, ctxt: Context): LolliAction {
  const actionRegex = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\{\s*(.*?)\s*\}\s*-o\s*\{\s*(.*?)\s*\}\s*$/;
  const match = src.trim().match(actionRegex);
  if (!match) {
    throw new Error(`Invalid Lolli action syntax: "${src}"`);
  }

  const name = match[1];
  const lhsStr = match[2].trim();
  const rhsStr = match[3].trim();

  const parseResources = (str: string): { varName: string; typePattern: Term }[] => {
    if (!str) return [];
    const parts = splitTopLevelCommas(str);
    return parts.map(part => {
      const resRegex = /^\s*\?([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*?)\s*$/;
      const resMatch = part.trim().match(resRegex);
      if (!resMatch) {
        throw new Error(`Invalid resource declaration: "${part}" in "${str}"`);
      }
      const varName = resMatch[1];
      const typePatternStr = resMatch[2].trim();
      const typePattern = parseTerm(typePatternStr, ctxt);
      return { varName, typePattern };
    });
  };

  const lhs = parseResources(lhsStr);
  const rhs = parseResources(rhsStr);

  return { name, lhs, rhs };
}

/**
 * Prints a Lolli Action back to string syntax.
 */
export function printLolliAction(action: LolliAction): string {
  const printResource = (r: { varName: string; typePattern: Term }) => {
    return `?${r.varName}: ${printTerm(r.typePattern)}`;
  };
  const lhs = action.lhs.map(printResource).join(', ');
  const rhs = action.rhs.map(printResource).join(', ');
  return `${action.name}: { ${lhs} } -o { ${rhs} }`;
}

export function getPatternVariables(term: Term): Set<string> {
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

/**
 * Matches a resource type against a pattern type under the context and substitution.
 */
export function matchResourcePattern(
  ctxt: Context,
  pattern: Term,
  resourceType: Term,
  subst: { [varName: string]: Term }
): boolean {
  // Case 1: pattern is a registered type name in the context (e.g., 'nat', 'list')
  if (
    pattern.kind === TermKind.Literal &&
    pattern.unNamedArgs.length === 0 &&
    Object.keys(pattern.namedArgs).length === 0 &&
    pattern.literalName in ctxt.types
  ) {
    try {
      const inferred = inferType(ctxt, resourceType);
      return matchTypes(ctxt, inferred, pattern);
    } catch (e) {
      return false;
    }
  }

  // Case 2: pattern is a specific term pattern (e.g., 'suc(?x)', '0')
  const tempSubst: { [name: string]: Term | string } = {};
  for (const [k, v] of Object.entries(subst)) {
    tempSubst[k] = v;
  }

  const allowedVars = getPatternVariables(pattern);

  try {
    unify(ctxt, pattern, resourceType, tempSubst);
    
    // Ensure unify didn't accidentally bind any non-variable literal (like 'monkey') to a different value
    for (const k of Object.keys(tempSubst)) {
      if (!(k in subst) && !allowedVars.has(k)) {
        const valStr = typeof tempSubst[k] === 'string' ? tempSubst[k] : printTerm(tempSubst[k] as Term);
        if (valStr !== k) {
          return false;
        }
      }
    }

    const substituted = substitute(pattern, tempSubst) as Term;
    if (matchTypes(ctxt, resourceType, substituted)) {
      for (const [k, v] of Object.entries(tempSubst)) {
        subst[k] = typeof v === 'string' ? parseTerm(v, ctxt) : v;
      }
      return true;
    }
  } catch (e) {}

  return false;
}

/**
 * Finds all possible matches of a LolliAction's LHS against active linear resources.
 */
export function matchAction(
  ctxt: Context,
  action: LolliAction,
  resources: LinearResource[]
): ActionMatch[] {
  const results: ActionMatch[] = [];

  function search(
    patternIdx: number,
    matchedIndices: Set<number>,
    matchedResources: Map<string, string>,
    currentSubst: { [varName: string]: Term }
  ) {
    if (patternIdx === action.lhs.length) {
      results.push({
        action,
        matchedResources: new Map(matchedResources),
        subst: { ...currentSubst },
      });
      return;
    }

    const pattern = action.lhs[patternIdx];

    for (let i = 0; i < resources.length; i++) {
      if (matchedIndices.has(i)) continue;

      const resource = resources[i];
      const newSubst = { ...currentSubst };

      const substitutedPatternType = substitute(pattern.typePattern, newSubst) as Term;

      if (matchResourcePattern(ctxt, substitutedPatternType, resource.type, newSubst)) {
        newSubst[pattern.varName] = resource.type;

        matchedIndices.add(i);
        matchedResources.set(pattern.varName, resource.name);

        search(patternIdx + 1, matchedIndices, matchedResources, newSubst);

        matchedIndices.delete(i);
        matchedResources.delete(pattern.varName);
      }
    }
  }

  search(0, new Set(), new Map(), {});
  return results;
}

/**
 * Represents the state of a linear logic story containing active linear resources.
 */
export class LinearStory {
  public resources: LinearResource[] = [];
  private nextResourceId = 1;

  constructor(public ctxt: Context) {}

  /**
   * Initializes a LinearStory from variables defined in the Context.
   */
  static fromContext(ctxt: Context): LinearStory {
    const story = new LinearStory(ctxt);
    for (const [varName, typeStr] of Object.entries(ctxt.variables)) {
      const typeTerm = parseTerm(typeStr, ctxt);
      const name = varName.startsWith('_') ? varName : `_${varName}`;
      story.resources.push({ name, type: typeTerm });

      const match = name.match(/^_r(\d+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id >= story.nextResourceId) {
          story.nextResourceId = id + 1;
        }
      }
    }
    return story;
  }

  /**
   * Deep forks the LinearStory.
   */
  fork(): LinearStory {
    const copy = new LinearStory(this.ctxt);
    copy.resources = this.resources.map(r => ({ ...r }));
    copy.nextResourceId = this.nextResourceId;
    return copy;
  }

  /**
   * Introduces a new linear resource with a fresh name.
   */
  addResource(type: Term): LinearResource {
    const name = `_r${this.nextResourceId++}`;
    const res = { name, type };
    this.resources.push(res);
    this.ctxt.declareVariable(name.substring(1), type);
    return res;
  }

  /**
   * Applies an ActionMatch to transition the story state.
   */
  applyAction(match: ActionMatch): LinearStory {
    const nextStory = this.fork();

    // 1. Consume LHS resources
    const consumedNames = new Set(match.matchedResources.values());
    nextStory.resources = nextStory.resources.filter(r => !consumedNames.has(r.name));

    // 2. Produce RHS resources
    for (const pattern of match.action.rhs) {
      const substitutedType = substitute(pattern.typePattern, match.subst) as Term;
      const evaluatedType = evaluateTerm(this.ctxt, substitutedType);
      nextStory.addResource(evaluatedType);
    }

    return nextStory;
  }

  /**
   * Prints the active linear resources in a context-compatible declaration format.
   */
  print(): string {
    return this.resources
      .map(r => `?${r.name.substring(1)}: ${printTerm(r.type)};`)
      .join('\n');
  }
}

/**
 * Scans a logical Context, matching all registered lolli actions against
 * the active linear variables in the context.
 */
export function getApplicableActions(ctxt: Context): ActionMatch[] {
  const story = LinearStory.fromContext(ctxt);
  const matches: ActionMatch[] = [];
  for (const action of Object.values(ctxt.actions)) {
    const actionMatches = matchAction(ctxt, action, story.resources);
    matches.push(...actionMatches);
  }
  return matches;
}
