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

import { RegExpVar } from './variable';

describe('named variables', () => {
  beforeEach(() => {
  });

  it('occurs', () => {
    // You can prompts quite vaturally, you define your variables, and then
    // just use them in a string interpretation.
    const thingVar = new RegExpVar('thing');
    const bigThingVar = new RegExpVar('bigThing');
    // Variables are first class properies, and you can do stuff with them.
    expect(bigThingVar.occurs('blah {{bigThing}}')).toBeTruthy();
    expect(thingVar.occurs('blah {{bigthing}}')).toBeFalsy();
  });

  it('Substituting a var in a string', () => {
    const thingVar = new RegExpVar('thing');
    const s2 = thingVar.subst(`what is a ${thingVar}?`, 'bar');
    expect(s2).toEqual('what is a bar?');
  });

  // Sadly there is no way to override loose equality for classes in JS.
  // it('equals', () => {
  //   // You can prompts quite vaturally, you define your variables, and then
  //   // just use them in a string interpretation.
  //   const thingVar = new RegExpVar('thing');
  //   const thingVar2 = new RegExpVar('thing');
  //   // Variables are first class properies, and you can do stuff with them.
  //   expect(thingVar == thingVar2).toBeTruthy();
  // });
});

