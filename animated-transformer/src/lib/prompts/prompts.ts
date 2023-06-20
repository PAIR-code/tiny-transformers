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

type VarName = string;

type NameToVarMap<Hs extends VarName> = { [Key in Hs]: Variable<Key> };

export abstract class Variable<N extends VarName> {

  constructor(public name: N) { };

  // Apply the substitution, replacinfg this variable in `s` with the value
  // string.
  public abstract applyFn(s: string, value: string): string;

  // Split the string whereever this variable occurs.
  //
  public abstract split(s: string): string[];

  // Returns true if 's' contains occurances of this variable.
  // Properties:
  //   Forall s, s': if (!x.occurs(s)) then (x.applyFn(s, s') === s)
  //   (x.split(s).length === 1) <=iff=> (x.occurs(s) === false)
  public occurs(s: string): boolean {
    return Object.values(this.split(s)).length > 1;
  }

  // Provides a literal string for the substitution.
  // Key property:
  //   Forall s: x.applyFn(s, x.literalStr()) === s
  public abstract literal: string;
}


// Assumes that regexp matches /.*${literal}.*/
// (Required for the RegExpVar literal/applyFn property.
interface RegExpVarOptions {
  regexp: RegExp,
  literal: string,
}

export class RegExpVar<H extends VarName> extends Variable<H> {
  regexp: RegExp;
  literal: string;

  constructor(name: H, options?: RegExpVarOptions) {
    super(name);
    if (options) {
      this.regexp = options.regexp;
      this.literal = options.literal
    } else {
      this.regexp = new RegExp(`\\{\\{${this.name}\\}\\}`, 'g');
      this.literal = `{{${this.name}}}`;
    }
  }

  public applyFn(s: string, value: string): string {
    return s.replace(this.regexp, value);
  }
  public split(s: string): string[] {
    return s.split(this.regexp);
  }

  override toString(): string {
    return this.literal;
  }
}

export class Prompt<Hs extends VarName> {
  public vars: NameToVarMap<Hs>;

  constructor(public template: string, vars: Variable<Hs>[] | NameToVarMap<Hs>) {
    if (!Array.isArray(vars)) {
      this.vars = vars;
    } else {
      this.vars = {} as NameToVarMap<Hs>;
      for (const h of vars) {
        this.vars[h.name] = h;
        if (!h.occurs(template)) {
          console.error(`Template is missing a variable,\n` +
            `Variable: ${h.name}\n` +
            `Template: ${template}`)
        }
      }
    }
  }

  substStr<OldH extends Hs>(
    oldVar: OldH | Variable<OldH>,
    replacement: string
  ): Prompt<Exclude<Hs, OldH>> {
    let varToReplace: Variable<OldH> =
      typeof (oldVar) === 'string' ? this.vars[oldVar] : oldVar;
    const newTemplate = varToReplace.applyFn(this.template, replacement);
    const updatedVars = ({ ...this.vars });
    delete (updatedVars[varToReplace.name])
    return new Prompt(newTemplate, updatedVars);
  }

  // TODO: would be better if I could express (NewHs & Hs) = 0.
  // i.e. there is no intersection between NewHs and Hs.
  substPrompt<OldH extends Hs, NewHs extends VarName>(
    oldVar: OldH | Variable<OldH>,
    replacement: Prompt<NewHs>
  ): Prompt<Exclude<Hs, OldH> | NewHs> {
    const updatedVars = ({
      ...this.vars
    } as never as NameToVarMap<Hs | NewHs>);

    //  [] as VarName<Exclude<H, OldHs> | NewHs>[];
    let newTemplate = this.template;

    let varToReplace: Variable<OldH> =
      typeof (oldVar) === 'string' ? this.vars[oldVar] : oldVar;

    const subTemplate: Prompt<NewHs> = replacement;
    newTemplate = varToReplace.applyFn(
      newTemplate, subTemplate.template)
    delete (updatedVars[varToReplace.name]);
    for (const subVar in subTemplate.vars) {
      updatedVars[subVar] = subTemplate.vars[subVar];
    }

    return new Prompt(newTemplate, updatedVars);
  }

  // TODO: would be better if I could express H3 is not member of Hs.
  renameVar<H extends Hs, N extends VarName>(
    oldVar: H,
    newVar: Variable<N>,
  ): Prompt<Exclude<Hs, H> | N> {
    const newTemplate = this.vars[oldVar].applyFn(
      this.template, newVar.literal);
    const newVars = { ...this.vars } as { [Key in Hs | N]: Variable<Key> };
    delete newVars[oldVar];
    newVars[newVar.name] = newVar;
    return new Prompt(newTemplate, newVars);
  }

  // TODO: would be better if I could express M is not member of Hs.
  mergeVars<H extends Hs, M extends VarName>(
    varsToMerge: H[],
    mergedVar: Variable<M>,
  ): Prompt<Exclude<Hs, H> | M> {
    // TODO: make a more efficient version that does it all at once instead of
    // incrementally.
    let newPrompt = this as Prompt<Exclude<Hs, H> | M>;
    for (const h of varsToMerge) {
      newPrompt = this.renameVar(h, mergedVar);
    }
    return newPrompt;
  }
}

function mergeVarsMap<H1s extends VarName, H2s extends VarName>(
  h1: NameToVarMap<H1s | H2s>,
  h2: NameToVarMap<H2s> | Variable<H2s>[])
  : { [Key in H1s | H2s]: Variable<Key> } {
  for (const h of (Object.values(h2) as Variable<H2s>[])) {
    h1[h.name] = h;
  }
  return h1;
}

export function makePrompt<Hs extends VarName>(
  strings: TemplateStringsArray, ...args: (Variable<Hs> | Prompt<Hs>)[]
): Prompt<Hs> {

  const vars = args.reduce(
    (vars, a) => {
      if (a instanceof Prompt) {
        return mergeVarsMap(vars, a.vars);
      } else {
        vars[a.name] = a;
        return vars;
      }
    }, {} as NameToVarMap<Hs>);

  return new Prompt(
    args.map((a, i) =>
      strings[i] + (a instanceof Prompt ? a.template : a.literal)
    ).join(''),
    vars);
}
