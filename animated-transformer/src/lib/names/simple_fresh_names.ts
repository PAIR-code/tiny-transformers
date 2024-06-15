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
/**
 * A simple library for creating fresh names.
 */

const a_to_z_Chars: string[] = [];
for (let i = 'a'.charCodeAt(0); i <= 'z'.charCodeAt(0); i++) {
  a_to_z_Chars.push(String.fromCharCode(i));
}

export type FreshNamesConfig = {
  defaultPrefix: string;
  defaultPostfix: string;
  nextNameId: number;
  chars: string[];
  usedNameSet: Set<string>;
};

export const defaultFreshNamesConfig: FreshNamesConfig = {
  defaultPrefix: '_',
  defaultPostfix: '',
  nextNameId: 0,
  chars: a_to_z_Chars,
  usedNameSet: new Set<string>(),
};

export class FreshNames {
  constructor(public config: FreshNamesConfig = defaultFreshNamesConfig) {}
  addNames(names: Iterable<string>) {
    for (const n of names) {
      this.config.usedNameSet.add(n);
    }
  }

  makeNextName(options: { prefix?: string; postfix?: string } = {}): string {
    let newName: string | null = null;
    while (!newName) {
      newName = this.nameForId(this.config.nextNameId, options);
      if (this.config.usedNameSet.has(newName)) {
        newName = null;
        this.config.nextNameId++;
      }
    }
    return newName;
  }

  makeAndAddNextName(
    options: { prefix?: string; postfix?: string } = {}
  ): string {
    const newName = this.makeNextName(options);
    this.config.usedNameSet.add(newName);
    return newName;
  }

  nameForId(
    id: number,
    options: { prefix?: string; postfix?: string } = {}
  ): string {
    const charIdx = id % this.config.chars.length;
    console.log('charIdx', charIdx);
    const num = Math.floor(id / this.config.chars.length);
    let numStr = '';
    if (num > 0) {
      numStr = `${num + 1}`;
    }
    console.log('num', num);
    return `${options.prefix ? options.prefix : this.config.defaultPrefix}${
      this.config.chars[charIdx]
    }${numStr}${
      options.postfix ? options.postfix : this.config.defaultPostfix
    }`;
  }
}
