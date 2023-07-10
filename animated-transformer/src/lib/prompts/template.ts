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
Note: the approach taken in this codebase id to treat templates as sets (so you
can have multiple instances of a variable and not think about it). It is
probably quite reasonable to think of templates as a list type of strings where
each string is a variable name. But then you need to do list motifications in
your types, which is not well supported by typescript.

Even set operations are not that well supported. e.g. we can't check if a string
overlaps in two types and produce a type error when it happens. One challenge
with trying to do do this is that it would make type checking conditions
constrains need to be carried around.

e.g. you might get types T<A,B> s.t. A & B = 0

That might need much deeper thinking in TS. But I think it would also be quite
wonderful. See ...

TODO: verify list manipulations are not well supported.
*/

import { RegExpVar, NamedVar } from './variable';

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

export function namedVar<N extends string>(name: N): NamedVar<N> {
  return new RegExpVar(name);
}

type NameToVarMap<Ns extends string> = { [Key in Ns]: TemplVar<Ns, Key> };

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
    const newVar = namedVar<N2>(newName);
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

  // RODO: can we make replacenments into templates?
  substs<S extends Ns, N2s extends string>(
    replacements: { [Key in S]: string | NamedVar<N2s> }
  ): Template<Exclude<Ns, S> | N2s> {
    type Return = Template<Exclude<Ns, S> | N2s>
    let newTempl = this as unknown as Return;
    for (const k of (Object.keys(replacements) as S[])) {
      const r = replacements[k]
      if (typeof r === 'string') {
        newTempl = (newTempl as unknown as Template<Ns>).vars[k]
          .substStr(r) as Return;
      } else {
        newTempl = (newTempl as unknown as Template<Ns>).vars[k]
          .unsafeRenameVar(r.name);
      }
    }
    return newTempl;
  };

  // CONSIDER: Make conditional type that errors is there is overlap?
  concat<N2s extends string>(secondPart: Template<N2s>)
    : Template<Ns | N2s> {
    const vars = [...this.varList(), ...secondPart.varList()
    ] as NamedVar<Ns | N2s>[];
    return new Template(this.escaped.concat(secondPart.escaped), vars);
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

export function template<Hs extends string>(
  strings: TemplateStringsArray, ...args: (NamedVar<Hs> | Template<Hs> | string)[]
): Template<Hs> {

  const varSet = new Set<string>;
  args.forEach(
    a => {
      if (a instanceof String || typeof (a) === 'string') {
        return;
      }
      if (a instanceof Template) {
        a.varList().forEach(v => varSet.add(v.name));
      }
      // TODO: support raw strings?
      // else if (typeof a === 'string') {
      //   varSet.add(a)
      // }
      else {
        varSet.add(a.name);
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
            : a.literal);
    }).join(''),
    [...varSet].map(n => namedVar(n as Hs)));
}

