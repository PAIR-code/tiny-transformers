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

type NameToVarMap<Ns extends string> = { [Key in Ns]: PromptVar<Ns, Key> };

// Ns = All variable names in the prompt.
// N = This variable name.
export class PromptVar<Ns extends string, N extends Ns> {
  constructor(public prompt: Prompt<Ns>, public rawVariable: NamedVar<N>) {
    if (!rawVariable.occurs(prompt.template)) {
      console.error(`Template is missing a variable,\n` +
        `Variable: ${this.name}\n` +
        `Template: ${prompt.template}`)
    }
  };

  get name(): N {
    return this.rawVariable.name;
  }

  // TODO: think about what if the "replacement" has variables in it?
  // Right now we depend on doing this in the renameVar code. But we could
  // imagine using a special kind of string type for escaped strings.
  substStr(replacement: string): Prompt<Exclude<Ns, N>> {
    const newTemplate = this.rawVariable.subst(this.prompt.template, replacement);
    const newVarList = (
      [...this.prompt.varList().filter(v => v.name !== this.name)
      ] as NamedVar<Exclude<Ns, N>>[]);

    return new Prompt(newTemplate, newVarList);
  }
  // TODO: maybe create a constraint that N2s must be dispoint with Ns?
  substPrompt<N2s extends string>(p: Prompt<N2s>): Prompt<Exclude<Ns, N> | N2s> {
    const updatedVars = ({
      ...this.prompt.vars
    } as never as NameToVarMap<Ns | N2s>);
    let newTemplate = this.prompt.template;
    const subTemplate: Prompt<N2s> = p;
    newTemplate = this.rawVariable.subst(
      newTemplate, subTemplate.template)
    const newVarList = (
      [...this.prompt.varList().filter(v => v.name !== this.name),
      ...subTemplate.varList()] as NamedVar<Exclude<Ns, N> | N2s>[]);
    return new Prompt(newTemplate, newVarList);
  }

  // TODO: would be better if I could express H3 is not member of Hs.
  renameVar<N2 extends string>(
    newName: Exclude<N2, Ns>, // N2 should not be in Ns! If so, this is never.
  ): Prompt<Exclude<Ns, N> | N2> {
    const newVar = namedVar<N2>(newName);
    const newTemplate = this.rawVariable.subst(this.prompt.template, newVar.literal);
    const newVarList = (
      [...this.prompt.varList().filter(v => v.name !== this.name),
        newVar] as NamedVar<Exclude<Ns, N> | N2>[]);
    return new Prompt(newTemplate, newVarList);
  }

  occurs(s: string): boolean {
    return this.rawVariable.occurs(s);
  }
}

export class Prompt<Ns extends string> {
  public vars: NameToVarMap<Ns>;

  constructor(public template: string, vars: NamedVar<Ns>[]) {
    this.vars = {} as NameToVarMap<Ns>;
    for (const v of vars.map(v => new PromptVar(this, v))) {
      this.vars[v.name] = v;
    }
  }

  varList(): NamedVar<Ns>[] {
    return Object.values(this.vars)
      .map(v => (v as PromptVar<Ns, Extract<Ns, string>>).rawVariable);
  }

  // TODO: would be better if I could express M is not member of Hs.
  mergeVars<OldNs extends Ns, M extends string>(
    varsToMerge: OldNs[],
    mergedVar: Exclude<M, Ns>,
  ): Prompt<Exclude<Ns, OldNs> | M> {
    // TODO: make a more efficient version that does it all at once instead of
    // incrementally.
    let newPrompt = this as never as Prompt<Exclude<Ns, OldNs> | M>;
    for (const v of varsToMerge) {
      newPrompt = this.vars[v].renameVar(mergedVar);
    }
    return newPrompt;
  }

  substStr<N extends Ns>(v: N, replacement: string):
    Prompt<Exclude<Ns, N>> {
    return this.vars[v].substStr(replacement);
  };

  substPrompt<N2s extends string, N extends Ns>(v: N, replacement: Prompt<N2s>):
    Prompt<Exclude<Ns, N> | N2s> {
    return this.vars[v].substPrompt(replacement);
  }

  // substPrompt<N2s extends string, N extends Ns>(n: N, replacement: Prompt<N2s> | string):
  //   Prompt<Exclude<Ns, N> | N2s> {
  //   if (typeof replacement === 'string') {
  //     return this.vars[n].substStr(replacement);
  //   }
  //   return this.vars[n].substPrompt(replacement);
  // }
}

export function makePrompt<Hs extends string>(
  strings: TemplateStringsArray, ...args: (NamedVar<Hs> | Prompt<Hs>)[]
): Prompt<Hs> {

  const varSet = new Set<string>;
  args.forEach(
    a => {
      if (a instanceof Prompt) {
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

  return new Prompt(
    strings.map((s, i) => {
      if (i >= args.length) {
        return s;
      }
      const a = args[i];
      return s + (a instanceof Prompt ? a.template : a.literal);
    }).join(''),
    [...varSet].map(n => namedVar(n as Hs)));
}

