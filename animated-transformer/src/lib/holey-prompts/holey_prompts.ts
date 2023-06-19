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

type HoleyName = string;

export abstract class HoleMatcher {
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
    return this.split(s).length > 1;
  }

  // Provides a literal string for the substitution.
  // Key property:
  //   Forall s: x.applyFn(s, x.literalStr()) === s
  public abstract literal: string;
}


// Assumes that regexp matches /.*literal.*/
// Required for the HoleMatcher literal/applyFn property.
interface RegExpMatcherOptions {
  regexp: RegExp,
  literal: string,
}

export class RegExpMatcher extends HoleMatcher {
  regexp: RegExp;
  literal: string;

  constructor(public name: HoleyName, options?: RegExpMatcherOptions) {
    super();
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
}

export class Hole<H extends HoleyName> {
  public matcher: HoleMatcher;
  constructor(public name: H, matcher?: HoleMatcher) {
    this.matcher = matcher || new RegExpMatcher(this.name);
  }
}

export class HoleyPrompts<Hs extends HoleyName> {
  public holes: { [Key in Hs]: Hole<Key> };

  constructor(public template: string, holes: Hole<Hs>[] | { [Key in Hs]: Hole<Key> }) {
    if (!Array.isArray(holes)) {
      this.holes = holes;
    } else {
      this.holes = {} as { [Key in Hs]: Hole<Key> };
      for (const h of holes) {
        this.holes[h.name] = h;
        if (!h.matcher.occurs(template)) {
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
  ): HoleyPrompts<Exclude<Hs, OldH>> {
    let holeToReplace: Hole<OldH> =
      typeof (hole) === 'string' ? this.holes[hole] : hole;
    const newTemplate = holeToReplace.matcher.applyFn(this.template, replacement);
    const updatedHoles = ({ ...this.holes });
    delete (updatedHoles[holeToReplace.name])
    return new HoleyPrompts(newTemplate, updatedHoles);
  }

  // TODO: would be better if I could express (NewHs & Hs) = 0.
  // i.e. there is no intersection between NewHs and Hs.
  substPrompt<OldH extends Hs, NewHs extends HoleyName>(
    hole: OldH | Hole<OldH>,
    replacement: HoleyPrompts<NewHs>
  ): HoleyPrompts<Exclude<Hs, OldH> | NewHs> {
    const updatedHoles = ({
      ...this.holes
    } as never as { [Key in Hs | NewHs]: Hole<Key> });

    //  [] as HoleName<Exclude<H, OldHs> | NewHs>[];
    let newTemplate = this.template;

    let holeToReplace: Hole<OldH> =
      typeof (hole) === 'string' ? this.holes[hole] : hole;

    const subTemplate: HoleyPrompts<NewHs> = replacement;
    newTemplate = holeToReplace.matcher.applyFn(
      newTemplate, subTemplate.template)
    delete (updatedHoles[holeToReplace.name]);
    for (const subHole in subTemplate.holes) {
      updatedHoles[subHole] = subTemplate.holes[subHole];
    }

    return new HoleyPrompts(newTemplate, updatedHoles);
  }

  // TODO: would be better if I could express H3 is not member of Hs.
  renameHole<H extends Hs, N extends HoleyName>(
    oldHole: H,
    newHole: Hole<N>,
  ): HoleyPrompts<Exclude<Hs, H> | N> {
    const newTemplate = this.holes[oldHole].matcher.applyFn(
      this.template, newHole.matcher.literal);
    const newHoles = { ...this.holes } as { [Key in Hs | N]: Hole<Key> };
    delete newHoles[oldHole];
    newHoles[newHole.name] = newHole;
    return new HoleyPrompts(newTemplate, newHoles);
  }

  // TODO: would be better if I could express M is not member of Hs.
  mergeHoles<H extends Hs, M extends HoleyName>(
    oldHoles: H[],
    newHole: Hole<M>,
  ): HoleyPrompts<Exclude<Hs, H> | M> {
    // TODO: make a more efficient version that does it all at once instead of
    // incrementally.
    let newPrompt = this as HoleyPrompts<Exclude<Hs, H> | M>;
    for (const h of oldHoles) {
      newPrompt = this.renameHole(h, newHole);
    }
    return newPrompt;
  }
}

