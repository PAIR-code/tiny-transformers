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

import { Prompt, escapeStr, makePrompt, namedVar, unEscapeStr } from './prompts';
import { RegExpVar } from './variable';

fdescribe('prompts', () => {
  beforeEach(() => {
  });

  it('A mini walkthrough of why this is neat...', () => {
    // You can prompts quite vaturally, you define your variables, and then
    // just use them in a string interpretation.
    const thingVar = namedVar('thing');
    const thing2Var = namedVar('thing2')
    const whatIsAtoBPrompt = makePrompt`what is a ${thingVar} to ${thing2Var}?`;

    // Arguments are auto-completed. e.g. first argument for a variable for
    // string substituion in the prompt `whatIsAtoBPrompt`, it must named
    // 'thing' or 'thing2'; those are the only variables in the prompt.
    let whatIsTabletoBPrompt = whatIsAtoBPrompt.vars.thing.substStr('table');

    // And errors are checked as you type, e.g.
    //
    // whatIsTabletoBPrompt.substStr('thing', 'table');
    //                               ^^^^^^^
    // Error: Argument of type '"thing"' is not assignable to parameter of
    // type '"thing2" | Variable<"thing2">'

    // You can substitute variables for prompts.
    const bigThingVar = namedVar('bigThing');
    const bigPrompt = makePrompt`big ${bigThingVar}?`;
    const whatIsTabletoBigBPrompt =
      whatIsTabletoBPrompt.vars.thing2.substPrompt(bigPrompt);

    // You can also reference the var names directly in a prompt substution
    // call, like so:
    //
    // const whatIsTabletoBigBPrompt =
    //   whatIsTabletoBPrompt.substPrompt('thing2', bigPrompt);

    // When you make new prompts, you can use other prompts as part of them...
    const foo = makePrompt`foo ${whatIsTabletoBigBPrompt}`;

    // Variables are first class properies, and you can do stuff with them.
    expect(foo.vars.bigThing.occurs('blah {{bigThing}}')).toBeTruthy();
  });


  it('Replacing a var with a string', () => {
    const thingVar = new RegExpVar('thing');
    const p = new Prompt(`what is a ${thingVar}?`,
      [thingVar]);

    const p2 = p.vars.thing.substStr('bar');

    expect(p2.template).toEqual('what is a bar?');
  });

  it('Replacing a var with a prompt', () => {
    const thingVar = namedVar('thing');
    const p = new Prompt(`what is a ${thingVar}?`,
      [thingVar]);

    const bigVar = namedVar('bigThingName')
    const p2 = new Prompt(`big ${bigVar}`, [bigVar]);

    const p3 = p.vars.thing.substPrompt(p2);

    expect(p3.template).toEqual(`what is a big {{bigThingName}}?`);
    expect(p3.vars.bigThingName.name).toEqual(`bigThingName`);
  });

  it('makePrompt with vars', () => {
    const thingVar = namedVar('thing');
    const thing2Var = namedVar('thing2')
    const p = makePrompt`what is a ${thingVar} to ${thing2Var}?`;
    console.log('p.template', p.template);

    const bigThingVar = namedVar('bigThing')
    const p2 = makePrompt`big ${bigThingVar}`;

    const p3 = p.vars.thing.substPrompt(p2);

    expect(p3.template).toEqual(`what is a big {{bigThing}} to {{thing2}}?`);
    expect(p3.vars.bigThing.name).toEqual(`bigThing`);
  });

  it('extending prompts by making prompts with prompt-vars', () => {
    const thingVar = namedVar('thing');
    const thing2Var = namedVar('thing2')
    const p = makePrompt`what is a ${thingVar} to ${thing2Var}?`;

    // Cool thing about this: for the first argument, the variable, is
    // auto-completed, and errors are checked as you type.
    //  e.g. first argument is auto-completed to 'thing' or 'thing2'.
    const p2 = p.vars.thing.substStr('table');

  });

  it('escaping', () => {
    const s = 'blah \\\\ {{foo}}';
    expect(escapeStr(s)).toEqual('blah \\\\\\\\ \\{\\{foo}}');
  });

  it('unescaping', () => {
    const s = 'blah \\\\ \\{\\{foo}}';
    expect(unEscapeStr(s)).toEqual('blah \\ {{foo}}');
  });

  it('TypeScript BUG: ', () => {
    const thingVar = namedVar('thing');
    const thing2Var = namedVar('thing2')
    const p = makePrompt`what is a ${thingVar} to ${thing2Var}?`;

    const bigThingVar = namedVar('bigThing')
    const p2 = makePrompt`big ${bigThingVar}`;
    const p4 = makePrompt`foo ${bigThingVar}, bar ${thingVar}, and ${thing2Var}`;

    // BUG, the following line produces this error:
    /*
Argument of type 'Prompt<"thing" | "person">' is not assignable to parameter of type 'Variable<"bigThing"> | Prompt<"bigThing">'.
Type 'Prompt<"thing" | "thing2">' is not assignable to type 'Prompt<"bigThing">'.
Types of property 'vars' are incompatible.
  Property 'bigThing' is missing in type '{ thing: Variable<"thing">; person: Variable<"person">; }' but required in type '{ bigThing: Variable<"bigThing">; }'.ts(2345)
    */
    // const p3 = makePrompt`foo ${p2}, bar ${p}`;

    // TODO: complete the test once the bug is fixed...
    // expect(p3.template).toEqual(
    //   `foo what is {{thing}} to {{person}}, bar {{bigThing}}?`);
    // expect(p3.vars.bigThing.name).toEqual(bigThingHole.name);
    // expect(p3.vars.person.name).toEqual(personHole.name);
  });
});

