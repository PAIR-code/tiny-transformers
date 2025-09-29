/* Copyright 2023 Google LLC. All Rights Reserved.

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

// TODO: using https://www.npmjs.com/package/mini-parse instead.
/* 
import { JsonObj } from '../json/json';

export enum ParserPrimative {
  Literal = 'Literal',
}

export type ParseState<T extends JsonObj> = {
  s: string;
  obj: T;
};

export abstract class Parser<Init extends JsonObj, After extends JsonObj> {
  abstract consume(init: ParseState<Init>): ParseState<After> | null;
}

export class RegexpParse<Names extends string, T extends JsonObj>
  implements Parser<T, T & { [key in Names]: string }>
{
  constructor(
    public re: RegExp,
    public name: Names[],
  ) {}

  consume(init: ParseState<T>): ParseState<T & { [key in Names]: string }> | null {
    // Regexp to pull out the number
    const m = init.s.match(this.re);
    if (!m) {
      return null;
    }
    const obj2 = 
    for()
    m[]
    // Add all the named
  }
}

export class IntegerParse<Name extends string, T extends JsonObj>
  implements Parser<T, T & { [key in Name]: number }>
{
  constructor(public name: Name) {}

  consume(init: ParseState<T>): ParseState<T & { [key in Name]: number }> | null {
    // Regexp to pull out the number
    const m = init.s.match(/^(\d+)/);
    if (!m) {
      return null;
    }
    const n = parseInt(m[0]);
    return {
      s: init.s.substring(m[0].length),
      obj: {
        ...init.obj,
        [this.name]: n,
      },
    };
  }
}

export class LiteralParse<T extends JsonObj> implements Parser<T, T> {
  constructor(public oneOfTheseLiterals: Set<string>) {}

  consume(init: ParseState<T>): ParseState<T> | null {
    // TODO: can make this more efficient by pulling out each chat from init.s,
    // and walking down a trie of matches.
    for (const l of this.oneOfTheseLiterals) {
      if (init.s.startsWith(l)) {
        return {
          s: init.s.substring(l.length),
          obj: init.obj,
        };
      }
    }
    return null;
  }
}

export class ThenParse<Init extends JsonObj, After1 extends JsonObj, After2 extends JsonObj>
  implements Parser<Init, After2>
{
  constructor(
    public first: Parser<Init, After1>,
    public second: Parser<After1, After2>,
  ) {}

  consume(init: ParseState<Init>): ParseState<After2> | null {
    const firstResult = this.first.consume(init);
    return firstResult ? this.second.consume(firstResult) : null;
  }
}

export class OrParse<Init extends JsonObj, After1 extends JsonObj, After2 extends JsonObj>
  implements Parser<Init, After1 | After2>
{
  constructor(
    public first: Parser<Init, After1>,
    public second: Parser<Init, After2>,
  ) {}

  consume(init: ParseState<Init>): ParseState<After1 | After2> | null {
    const firstResult = this.first.consume(init);
    if (firstResult) {
      return firstResult;
    }
    return this.second.consume(init);
  }
}
*/
