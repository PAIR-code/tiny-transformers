/* Copyright 2023 Google LLC. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License. */
/*============================================================================*/
/*
An implementation of string-templates in TypeScript. The approach is to create a
Template clas which has the template types (Template<S>) parameterized by a set
of string literal types (S). Each string literal in S is the name of a variable
in the template. The number of instances of a variable in a template does not
change the type, but the names of variables do.

Various nice compositional utilities are then provided, e.g. substitution,
string-interpretation with variables and even templates.

To see how this can be used, see the test files (.spec.ts), and specifically the
fewshot_template.spec.ts for some neat applications.

One quirk of this is that when a template has no variables (it's just a literal
string), its type is `Template<never>`.


Other notes:

TO CONSIDER: provide an "noIdent" utility for templates to be more readable in
code blocks (e.g. s/\n\s+/\n/g). Maybe something fancy to allow \n. to be used
for real indent, but the "." gets ignored.

It is probably also quite reasonable to think of templates as a list-type of
strings where each string is a variable name. But then you need to do list
motifications in your types, which is not well supported by typescript.

Even set operations are not that well supported. e.g. we can't check if a string
overlaps in two types and produce a type error when it happens. One challenge
with trying to do do this is that it would make type checking conditions
constrains need to be carried around.

e.g. you might get types T<A,B> s.t. A & B = 0

That might need much deeper thinking in TS. But I think it would also be quite
wonderful. See ...

TODO: verify list manipulations are not well supported by TypeScript typing.

TODO: see if there is a different base-type for empty vars that can be used. I
spent a while looking at this, and I think never is probably the only one that
can be used.

TODO: Move to using lists, where order is defined by first occurance. This
allows parsing of outputs from an LLM to be well typed and know what variable
will come next.

*/

import { RegExpVar, NamedVar, SPLIT_REGEXP } from './variable';

// ----------------------------------------------------------------------------
// Escaping
// ----------------------------------------------------------------------------
// Simple escaping/unescaping when we have variables represented as:
//  {{VarName}}
// escaping: blah \ {{ foo... ===> blah \\ \{\{ foo...
// unescaping: blah \\ \{\{ foo... ===> blah \ {{ foo...
export function escapeStr(s: string): string {
  return s.replaceAll('\\', '\\\\').replaceAll('{', '\\{');
  // Can be done in a single pass... TODO: test sure faster...
  // return s.replaceAll(/\\|\{/g, (m:string) => `\\${m}`);
}
export function unEscapeStr(s: string): string {
  return s.replaceAll('\\\\', '\\').replaceAll('\\{', '{');
}

export function nv<N extends string>(name: N): NamedVar<N> {
  return new RegExpVar(name);
}

export interface Error_CannotStringifyTemplateWithVars<T extends string> {
  _Error_CannotStringifyTemplateWithVars: T;
};

export type IfNeverElse<T, IfNeverT, ElseT> = [T] extends [never] ? IfNeverT : ElseT;

export interface TemplatePart<Ns extends string> { variable: NamedVar<Ns>, postfix: string };

export interface TemplateParts<Ns extends string> {
  prefix: string;
  variables: TemplatePart<Ns>[]
};

// Escape a string so that it can be matched literally in a regexp expression.
// "$&" is the matched string. i.e. the character we need to escape.
function escapeStringInMatch(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// $$ is the results in writing out $, so $$$$ ends up as "$$" in the final
// string. e.g. $ ==> $$
function escapeStringInReplacement(s: string) {
  return s.replace(/\$/g, '$$$$');
}

// ----------------------------------------------------------------------------
// Given a string, match the string against the template parts filling in the
// variables, returning the variable substitutions.
export function matchTemplate<Ns extends string>(
  parts: TemplateParts<Ns>,
  s: string,
  matchPrefix = true,
): { [Key in Ns]: string } | null {
  const substs = {} as { [Key in Ns]: string };

  if (matchPrefix) {
    const prefixMatch = s.match(`^${escapeStringInMatch(parts.prefix)}`);
    if (prefixMatch) {
      s = s.slice(prefixMatch[0].length);
    } else {
      return null;
    }
  }

  for (const v of parts.variables) {
    if (s.length === 0) {
      substs[v.variable.name] = '';
    }
    // If the var is the last thing in the template, then the whole response
    // is the variable.
    if (v.postfix === '') {
      substs[v.variable.name] = s;
      s = '';
    }
    // Otherwise match everything until the post-variable string.
    const varAndPostfixRegexp = new RegExp(
      `^(.+?)(${escapeStringInMatch(v.postfix)}|$)`);
    const varAndPostfixMatch = s.match(varAndPostfixRegexp)
    if (!varAndPostfixMatch) {
      // if there is no match, then this variable has not been found or is the
      // empty string. We treat that as a failure to fill in the variable.
      //
      // If this was the first variable, then no varaibles have been found, and
      // we can directly fail and say that no variable was matched.
      if (Object.keys(substs).length === 0) {
        return null;
      }
      substs[v.variable.name] = '';
      // Setting s = '' will make all future vars null.
      s = '';
    } else {
      substs[v.variable.name] = varAndPostfixMatch[1];
      s = s.slice(varAndPostfixMatch[0].length);
    }
  }
  return substs;
}


type NameToVarMap<Ns extends string> = { [Key in Ns]: TemplVar<Ns, Key> };
// type SpecificName<Ns extends string> = string extends Ns ? never : Ns;
// type VarNames<Ns extends string> = NamedVar<SpecificName<Ns>>;

// ----------------------------------------------------------------------------
// Ns = All variable names in the template.
// N = This variable name.
export class TemplVar<Ns extends string, N extends Ns> {
  constructor(public template: Template<Ns>, public rawVariable: NamedVar<N>) {
    if (!rawVariable.occurs(template.escaped)) {
      console.error(`Template is missing a variable,\n` +
        `Variable: ${this.name}\n` +
        `Template: ${template.escaped}`)
    }
  };

  get name(): N {
    return this.rawVariable.name;
  }

  // TODO: think about what if the "replacement" has variables in it?
  // Right now we depend on doing this in the renameVar code. But we could
  // imagine using a special kind of string type for escaped strings.
  substStr(replacement: string): Template<Exclude<Ns, N>> {
    const newTemplate = this.rawVariable.subst(this.template.escaped, replacement);
    const newVarList = (
      [...this.template.varList().filter(v => v.name !== this.name)
      ] as NamedVar<Exclude<Ns, N>>[]);

    return new Template(newTemplate, newVarList);
  }
  // TODO: maybe create a constraint that N2s must be dispoint with Ns?
  substTempl<N2s extends string>(p: Template<N2s>): Template<Exclude<Ns, N> | N2s> {
    let newTemplate = this.template.escaped;
    const subTemplate: Template<N2s> = p;
    newTemplate = this.rawVariable.subst(
      newTemplate, subTemplate.escaped)
    const newVarList = (
      [...this.template.varList().filter(v => v.name !== this.name),
      ...subTemplate.varList()] as NamedVar<Exclude<Ns, N> | N2s>[]);
    return new Template(newTemplate, newVarList);
  }

  // TODO: would be better if I could express H3 is not member of Hs.
  renameVar<N2 extends string>(
    newName: Exclude<N2, Ns>, // N2 should not be in Ns! If so, this is never.
  ): Template<Exclude<Ns, N> | N2> {
    return this.unsafeRenameVar(newName as N2);
  }

  unsafeRenameVar<N2 extends string>(
    newName: N2,
  ): Template<Exclude<Ns, N> | N2> {
    const newVar = nv<N2>(newName);
    const newTemplate = this.rawVariable.subst(this.template.escaped, newVar.literal);
    const newVarList = (
      [...this.template.varList().filter(v => v.name !== this.name),
        newVar] as NamedVar<Exclude<Ns, N> | N2>[]);
    return new Template(newTemplate, newVarList);
  }

  occurs(s: string): boolean {
    return this.rawVariable.occurs(s);
  }
}

export class ExtraVarError extends Error { }

const VAR_REGEXP = /\{\{(?<name>[^(\}\})]*)\}\}/g;

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
export class Template<Ns extends string> {
  public vars: NameToVarMap<Ns>;

  constructor(public escaped: string, vars: NamedVar<Ns>[]) {

    const varsNamesInTemplate =
      [...escaped.matchAll(VAR_REGEXP)].map(m => m.groups!['name']);

    this.vars = {} as NameToVarMap<Ns>;
    for (const v of vars.map(v => new TemplVar(this, v))) {
      this.vars[v.name] = v;
    }

    const extraVarsNamesInTemplateSet = new Set(varsNamesInTemplate);
    const extraDelcaredVarNameSet = new Set(Object.keys(this.vars));
    extraDelcaredVarNameSet.forEach(v => {
      if (extraVarsNamesInTemplateSet.delete(v)) {
        extraDelcaredVarNameSet.delete(v);
      }
    });
    // TODO: consider if we want these to be allowed/not via options in
    // the constructor?
    if (extraVarsNamesInTemplateSet.size > 0) {
      throw new ExtraVarError(`Template has undeclared variables: `
        + `${[...extraVarsNamesInTemplateSet]}. These should be declared `
        + `constructor, or escaped.`);
    }
    if (extraDelcaredVarNameSet.size > 0) {
      console.warn(`Extra vars were declared that don't exist in the `
        + `template, this is probably not intentional. The extra vars `
        + `are: ${[...extraDelcaredVarNameSet]}`);
    }
  }

  varList(): NamedVar<Ns>[] {
    return Object.values(this.vars)
      .map(v => (v as TemplVar<Ns, Extract<Ns, string>>).rawVariable);
  }

  // TODO: would be better if I could express M is not member of Hs.
  mergeVars<OldNs extends Ns, M extends string>(
    varsToMerge: OldNs[],
    mergedVar: Exclude<M, Exclude<Ns, OldNs>>,
  ): Template<Exclude<Ns, OldNs> | M> {
    // TODO: make a more efficient version that does it all at once instead of
    // incrementally.
    let newTempl = this as Template<Ns | M>;
    for (const v of varsToMerge) {
      newTempl = newTempl.vars[v as unknown as Ns]
        .unsafeRenameVar(mergedVar) as unknown as Template<Ns | M>;
    }
    return newTempl as Template<Exclude<Ns, OldNs> | M>;
  }

  substStr<N extends Ns>(v: N, replacement: string):
    Template<Exclude<Ns, N>> {
    return this.vars[v].substStr(replacement);
  };

  substTempl<N2s extends string, N extends Ns>(
    v: N, replacement: Template<N2s>
  ): Template<Exclude<Ns, N> | N2s> {
    return this.vars[v].substTempl(replacement);
  }

  // substs<S extends Ns>(replacements: { [Key in S]: string })
  //   : Template<Exclude<Ns, S>> {
  //   let newTempl = this as unknown as Template<Exclude<Ns, S>>;
  //   for (const k of (Object.keys(replacements) as S[])) {
  //     newTempl = (newTempl as unknown as Template<Ns>).vars[k]
  //       .substStr(replacements[k]);
  //   }
  //   return newTempl;
  // };

  // TODO: can we make replacenments into templates?
  //
  // declare substs<S extends Ns, N2s extends string>(
  //   replacements: { [Key in S]: string | NamedVar<N2s> }
  // ): Template<Exclude<Ns, S> | N2s>;

  substs<S extends Ns, N2s extends string>(
    replacements: { [Key in S]: string | NamedVar<N2s> }
  ): Template<Exclude<Ns, keyof (typeof replacements)> | (string extends N2s ? never : N2s)> {
    type Return = Template<Exclude<Ns, S> | (string extends N2s ? never : N2s)>
    let newTempl = this as unknown as Return;
    for (const k of (Object.keys(replacements) as S[])) {
      const r = replacements[k]
      if (typeof r === 'string') {
        newTempl = (newTempl as unknown as Template<Ns>).vars[k]
          .substStr(r) as Return;
      } else {
        newTempl = (newTempl as unknown as Template<Ns>).vars[k]
          .unsafeRenameVar(r.name) as Return;
      }
    }
    return newTempl;
  };

  // CONSIDER: Make conditional type that errors is there is overlap on the
  // variable names. Ideally this would be supported as a first class thing by
  // TypeScript.
  concat<N2s extends string>(secondPart: Template<N2s>)
    : Template<Ns | N2s> {
    const vars = [...this.varList(), ...secondPart.varList()
    ] as NamedVar<Ns | N2s>[];
    return new Template(this.escaped.concat(secondPart.escaped), vars);
  }

  // Maybe templates should actually be a list objects where the object is the string-part and
  // the variable parts, and a final string... (or initial string)?
  parts(): TemplateParts<Ns> {
    const l = this.escaped.split(SPLIT_REGEXP);
    // Note split using a regexp will result in parts.length > 0; so this is
    // safe.
    const prefix = unEscapeStr(l.shift()!);
    const parts = [] as TemplatePart<Ns>[];
    while (l.length > 0) {
      // prefix is defined because l.length > 0
      const variable = nv(l.shift() as Ns);
      const postfix = unEscapeStr(l.shift()!);
      parts.push({ variable, postfix });
    }
    return { prefix, variables: parts };
  }

  stringify(): IfNeverElse<Ns, string, Error_CannotStringifyTemplateWithVars<Ns>> {
    return unEscapeStr(this.escaped) as IfNeverElse<Ns, string, Error_CannotStringifyTemplateWithVars<Ns>>;
  }

  // Can we define a generic subst? that takes a string or template replacement?
  // subst<N2s extends string, N extends Ns>(n: N, replacement: Templ<N2s> | string):
  //   Templ<Exclude<Ns, N> | N2s> {
  //   if (typeof replacement === 'string') {
  //     return this.vars[n].substStr(replacement);
  //   }
  //   return this.vars[n].substTempl(replacement);
  // }
}


// type TemplateArg = NamedVar<string> | Template<string> | string

type TemplateArgName<T> = T extends (NamedVar<infer Hs> | Template<infer Hs> | string) ? Hs : never;

/**
 * Helper function to make templates. This is intended to be the main way
 * templates are created.
 */
export function template<
  // Hs extends string
  Args extends (NamedVar<any> | Template<any> | string)[]
>(
  strings: TemplateStringsArray,
  // ...args: TemplateArg[]
  ...args: Args
  // (NamedVar<Hs> | Template<Hs> | string)[]
): Template<TemplateArgName<typeof args[number]>> {
  const varSet = new Set<TemplateArgName<typeof args[number]>>;
  args.forEach(
    a => {
      if (a instanceof String || typeof (a) === 'string') {
        return;
      }
      if (a instanceof Template) {
        a.varList().forEach(v => varSet.add(
          v.name as TemplateArgName<typeof args[number]>));
      }
      // TODO: support raw strings?
      // else if (typeof a === 'string') {
      //   varSet.add(a)
      // }
      else if (a instanceof NamedVar) {
        varSet.add(a.name as TemplateArgName<typeof args[number]>);
      }
    });

  return new Template(
    strings.map((s, i) => {
      if (i >= args.length) {
        return s;
      }
      const a = args[i];
      return escapeStr(s) + (
        a instanceof Template ? a.escaped
          : (a instanceof String || typeof (a) === 'string') ? a
            : (a as NamedVar<string>).literal);
    }).join(''),
    [...varSet].map(n => nv(n))
  );
}
