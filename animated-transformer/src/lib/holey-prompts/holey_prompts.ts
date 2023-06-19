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

import { object } from "underscore";

type HoleyName = string;

type HolesMap<Hs extends HoleyName> = { [Key in Hs]: Hole<Key> };

export abstract class Hole<H extends HoleyName> {

  constructor(public name: H) { };

  // Apply the substitution, replacinfg this hole in `s` with the value string.
  public abstract applyFn(s: string, value: string): string;

  // Split according to this hole.
  //
  public abstract split(s: string): string[];

  // Returns true if 's' contains something that this hole matches.
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


// Assumes that regexp matches /.*literal.*/
// Required for the HoleMatcher literal/applyFn property.
interface RegExpHoleOptions {
  regexp: RegExp,
  literal: string,
}

export class RegExpHole<H extends HoleyName> extends Hole<H> {
  regexp: RegExp;
  literal: string;

  constructor(name: H, options?: RegExpHoleOptions) {
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

export class HoleyPrompt<Hs extends HoleyName> {
  public holes: { [Key in Hs]: Hole<Key> };

  constructor(public template: string, holes: Hole<Hs>[] | { [Key in Hs]: Hole<Key> }) {
    if (!Array.isArray(holes)) {
      this.holes = holes;
    } else {
      this.holes = {} as { [Key in Hs]: Hole<Key> };
      for (const h of holes) {
        this.holes[h.name] = h;
        if (!h.occurs(template)) {
          console.error(`Template is missing a variable,\n` +
            `Variable: ${h.name}\n` +
            `Template: ${template}`)
        }
      }
    }
  }

  substStr<OldH extends Hs>(
    hole: OldH | Hole<OldH>,
    replacement: string
  ): HoleyPrompt<Exclude<Hs, OldH>> {
    let holeToReplace: Hole<OldH> =
      typeof (hole) === 'string' ? this.holes[hole] : hole;
    const newTemplate = holeToReplace.applyFn(this.template, replacement);
    const updatedHoles = ({ ...this.holes });
    delete (updatedHoles[holeToReplace.name])
    return new HoleyPrompt(newTemplate, updatedHoles);
  }

  // TODO: would be better if I could express (NewHs & Hs) = 0.
  // i.e. there is no intersection between NewHs and Hs.
  substPrompt<OldH extends Hs, NewHs extends HoleyName>(
    hole: OldH | Hole<OldH>,
    replacement: HoleyPrompt<NewHs>
  ): HoleyPrompt<Exclude<Hs, OldH> | NewHs> {
    const updatedHoles = ({
      ...this.holes
    } as never as HolesMap<Hs | NewHs>);

    //  [] as HoleName<Exclude<H, OldHs> | NewHs>[];
    let newTemplate = this.template;

    let holeToReplace: Hole<OldH> =
      typeof (hole) === 'string' ? this.holes[hole] : hole;

    const subTemplate: HoleyPrompt<NewHs> = replacement;
    newTemplate = holeToReplace.applyFn(
      newTemplate, subTemplate.template)
    delete (updatedHoles[holeToReplace.name]);
    for (const subHole in subTemplate.holes) {
      updatedHoles[subHole] = subTemplate.holes[subHole];
    }

    return new HoleyPrompt(newTemplate, updatedHoles);
  }

  // TODO: would be better if I could express H3 is not member of Hs.
  renameHole<H extends Hs, N extends HoleyName>(
    oldHole: H,
    newHole: Hole<N>,
  ): HoleyPrompt<Exclude<Hs, H> | N> {
    const newTemplate = this.holes[oldHole].applyFn(
      this.template, newHole.literal);
    const newHoles = { ...this.holes } as { [Key in Hs | N]: Hole<Key> };
    delete newHoles[oldHole];
    newHoles[newHole.name] = newHole;
    return new HoleyPrompt(newTemplate, newHoles);
  }

  // TODO: would be better if I could express M is not member of Hs.
  mergeHoles<H extends Hs, M extends HoleyName>(
    oldHoles: H[],
    newHole: Hole<M>,
  ): HoleyPrompt<Exclude<Hs, H> | M> {
    // TODO: make a more efficient version that does it all at once instead of
    // incrementally.
    let newPrompt = this as HoleyPrompt<Exclude<Hs, H> | M>;
    for (const h of oldHoles) {
      newPrompt = this.renameHole(h, newHole);
    }
    return newPrompt;
  }
}

function mergeHolesMap<H1s extends HoleyName, H2s extends HoleyName>(
  h1: HolesMap<H1s | H2s>,
  h2: HolesMap<H2s> | Hole<H2s>[])
  : { [Key in H1s | H2s]: Hole<Key> } {
  for (const h of (Object.values(h2) as Hole<H2s>[])) {
    h1[h.name] = h;
  }
  return h1;
}

export function makePrompt<Hs extends HoleyName>(
  strings: TemplateStringsArray, ...args: (Hole<Hs> | HoleyPrompt<Hs>)[]
): HoleyPrompt<Hs> {

  const holes = args.reduce(
    (holes, a) => {
      if (a instanceof HoleyPrompt) {
        return mergeHolesMap(holes, a.holes);
      } else {
        holes[a.name] = a;
        return holes;
      }
    }, {} as HolesMap<Hs>);

  return new HoleyPrompt(
    args.map((a, i) =>
      strings[i] + (a instanceof HoleyPrompt ? a.template : a.literal)
    ).join(''),
    holes);
}
