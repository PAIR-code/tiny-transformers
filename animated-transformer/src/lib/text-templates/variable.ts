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
An implementation of named nariables that can occur in a string template.
*/

export abstract class NamedVar<N extends string> {

  constructor(public name: N) { };

  // Apply the substitution, replacing this variable in `s` with the value
  // string.
  public abstract subst(s: string, value: string): string;

  // Split the string whereever this variable occurs.
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
export interface RegExpVarOptions {
  regexp: RegExp,
  literal: string,
}

// Example usage:
//   const r = 'did you know that a {{foo}} is a {{bar}}.'.split(VAR_REGEXP);
// r = ['did you know that a ', '{{foo}}', ' is a ', '{{bar}}', '.']
// Property: every other value (the odd indexes) is a variable.
// We could use `\\{\\{([^(\\}\\})]*)\\}\\}` as our regexp to also remove
// variable marker parenthesis, but we don't do that because it's good to be
// able to easily visually inspect what's what. Maybe we'll change it later.
export const VAR_REGEXP_STR = `(\\{\\{[^(\\}\\})]*\\}\\})`;
export const SPLIT_REGEXP_STR = `\\{\\{([^(\\}\\})]*)\\}\\}`;
export const SPLIT_REGEXP = new RegExp(SPLIT_REGEXP_STR, 'g');
export const VAR_REGEXP = new RegExp(VAR_REGEXP_STR, 'g');
export const PREFIX_REGEXP = new RegExp(`$([^(\\{\\{)]*)`);

export class RegExpVar<N extends string> extends NamedVar<N> {
  regexp: RegExp;
  literal: string;

  constructor(name: N, options?: RegExpVarOptions) {
    super(name);
    if (options) {
      this.regexp = options.regexp;
      this.literal = options.literal
    } else {
      this.regexp = new RegExp(`\\{\\{${this.name}\\}\\}`, 'g');
      this.literal = `{{${this.name}}}`;
    }
  }

  // static splitAllVars(s: string): string[] {
  //   return s.split(VAR_REGEXP);
  // }

  public subst(s: string, value: string): string {
    return s.replace(this.regexp, value);
  }
  public split(s: string): string[] {
    return s.split(this.regexp);
  }

  override toString(): string {
    return this.literal;
  }
}
