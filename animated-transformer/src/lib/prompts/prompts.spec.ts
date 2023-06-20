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

import { Prompt, RegExpVar, makePrompt } from './prompts';

describe('prompts', () => {
  beforeEach(() => {
  });

  it('Replacing a var with a string', () => {
    const thingVar = new RegExpVar('thing');
    const p = new Prompt(`what is a ${thingVar}?`,
      [thingVar]);

    const p2 = p.substStr(p.vars.thing, 'bar');

    expect(p2.template).toEqual('what is a bar?');
  });

  it('Replacing a var with a prompt', () => {
    const thingVar = new RegExpVar('thing');
    const p = new Prompt(`what is a ${thingVar}?`,
      [thingVar]);

    const bigVar = new RegExpVar('bigThingName')
    const p2 = new Prompt(`big ${bigVar}?`, [bigVar]);

    const p3 = p.substPrompt(p.vars.thing, p2);

    expect(p3.template).toEqual(`what is a big {{bigThingName}}?`);
    expect(p3.vars.bigThingName.name).toEqual(`bigThingName`);
  });

  it('makePrompt with vars', () => {
    const thingVar = new RegExpVar('thing');
    const thing2Var = new RegExpVar('thing2')
    const p = makePrompt`what is a ${thingVar} to ${thing2Var}?`;

    const bigThingVar = new RegExpVar('bigThing')
    const p2 = makePrompt`big ${bigThingVar}?`;

    const p3 = p.substPrompt(p.vars.thing, p2);

    expect(p3.template).toEqual(`what is a big {{bigThing}} to {{thing2}}?`);
    expect(p3.vars.bigThing.name).toEqual(`bigThing`);
  });

  it('extending prompts by making prompts with prompt-vars', () => {
    const thingVar = new RegExpVar('thing');
    const thing2Var = new RegExpVar('thing2')
    const p = makePrompt`what is a ${thingVar} to ${thing2Var}?`;

    const bigThingVar = new RegExpVar('bigThing')
    const p2 = makePrompt`big ${bigThingVar}?`;
    const p4 = makePrompt`foo ${bigThingVar}, bar ${thingVar}, and ${thing2Var}`;

    // BUG, the following line produces this error:
    /*
    Argument of type 'Prompt<"thing" | "person">' is not assignable to parameter of type 'Variable<"bigThing"> | Prompt<"bigThing">'.
  Type 'Prompt<"thing" | "thing2">' is not assignable to type 'Prompt<"bigThing">'.
    Types of property 'vars' are incompatible.
      Property 'bigThing' is missing in type '{ thing: Variable<"thing">; person: Variable<"person">; }' but required in type '{ bigThing: Variable<"bigThing">; }'.ts(2345)
    */
    // const p3 = makePrompt`foo ${p2}, bar ${p}`;
    // expect(p3.template).toEqual(
    //   `foo what is {{thing}} to {{person}}, bar {{bigThing}}?`);
    // expect(p3.vars.bigThing.name).toEqual(bigThingHole.name);
    // expect(p3.vars.person.name).toEqual(personHole.name);
  });
});

