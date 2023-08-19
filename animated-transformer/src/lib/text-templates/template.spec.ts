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

import { Template, escapeStr, template, nv, unEscapeStr } from './template';

describe('template', () => {
  beforeEach(() => {
  });

  it('A mini walkthrough of why this is neat...', () => {
    // You can make temnplates quite naturally: you can define your variables,
    // and then just use them in a simple interpreted string.
    const thingVar = nv('thing');
    const thing2Var = nv('thing2')
    const whatIsAtoB = template`what is a ${thingVar} to ${thing2Var}?`;

    // You could also of course just inline define them...
    template`what is a ${nv('thing')} to ${nv('thing2')}?`;

    // Arguments can be auto-completed by IDE. e.g. the first you can reference
    // the variables form the 'vars' paramter of a template. e.g. this lets you
    // do string substituion in the template `whatIsAtoB` as follows where the
    // subparams of vars are 'thing' or 'thing2'; those are the only variables
    // in the template, and are auto-completed, and anything else is an 'as you
    // type' type error.
    let whatIsTabletoB = whatIsAtoB.vars.thing.substStr('table');
    expect(whatIsTabletoB.escaped).toEqual(
      'what is a table to {{thing2}}?');

    // You can also reference the var names directly using a template's
    // substution call, like so (and get editor auto-completion):
    whatIsTabletoB.substStr('thing2', 'chair');

    // And errors are checked as you type, e.g.
    //
    // whatIsTabletoB.substStr('thing', 'chair');
    //                         ^^^^^^^
    //   Error: Argument of type '"thing"' is not assignable to parameter of
    //   type '"thing2"'

    // Or you can use the map substitution and even do multiple substitutions at
    // once.
    whatIsAtoB.substs({ thing: 'table', thing2: 'chair' });

    // Variables can be progamatrically renamed in templates.
    const whatIsAtoTarget =
      whatIsAtoB.vars.thing2.renameVar('target');
    // Note: the nice automatic type inference:
    //   whatIsAtoTarget: Template<'thing', 'target'>
    expect(Object.keys(whatIsAtoTarget.vars).sort()).toEqual(
      ['thing', 'target'].sort());
    expect(whatIsAtoTarget.escaped).toEqual(
      'what is a {{thing}} to {{target}}?');

    // Variables can also be merged progamatrically too.
    const whatIsThingtoItself =
      whatIsAtoB.mergeVars(['thing', 'thing2'], 'thing');
    // Note: the nice automatic type inference:
    //   whatIsThingtoItself: Template<'thing'>
    //
    // We can verify that we merged 'thing', 'thing2' into 'thing'
    expect(Object.keys(whatIsThingtoItself.vars).sort()).toEqual(
      ['thing'].sort());

    // And we can verify the underlying escaped string value of the template
    // like so:
    expect(whatIsThingtoItself.escaped).toEqual(
      'what is a {{thing}} to {{thing}}?');

    // You can also substitute variables for templates. New extra variables are
    // corrected added in the newly created template. (whatIsTabletoBigB has the
    // variable 'bigThing' and only that one)
    const bigThingVar = nv('bigThing');
    const big = template`big ${bigThingVar}`;
    const whatIsTabletoBigB =
      whatIsTabletoB.vars.thing2.substTempl(big);

    // When you make new templates, you can also just use other templates as
    // part of them...
    const fooAndBig = template`foo ${whatIsTabletoBigB}`;
    expect(fooAndBig.escaped).toEqual(
      'foo what is a table to big {{bigThing}}?');

    // Also, variables are properies, so you can do things like check if they
    // occur in other escaped string templates too.
    expect(fooAndBig.vars.bigThing.occurs(big.escaped))
      .toBeTruthy();
  });

  it('Replacing a var with a string', () => {
    const thingVar = nv('thing');
    const p = new Template(`what is a ${thingVar}?`,
      [thingVar]);

    const p2 = p.vars.thing.substStr('bar');

    expect(p2.escaped).toEqual('what is a bar?');
  });

  it('Replacing a var with a template', () => {
    const thingVar = nv('thing');
    const p = new Template(`what is a ${thingVar}?`,
      [thingVar]);

    const bigVar = nv('bigThingName')
    const p2 = new Template(`big ${bigVar}`, [bigVar]);

    const p3 = p.vars.thing.substTempl(p2);

    expect(p3.escaped).toEqual(`what is a big {{bigThingName}}?`);
    expect(p3.vars.bigThingName.name).toEqual(`bigThingName`);
  });

  it('make a template with vars', () => {
    const thingVar = nv('thing');
    const thing2Var = nv('thing2')
    const p = template`what is a ${thingVar} to ${thing2Var}?`;
    console.log('p.template', p.escaped);

    const bigThingVar = nv('bigThing')
    const p2 = template`big ${bigThingVar}`;

    const p3 = p.vars.thing.substTempl(p2);

    expect(p3.escaped).toEqual(`what is a big {{bigThing}} to {{thing2}}?`);
    expect(p3.vars.bigThing.name).toEqual(`bigThing`);
  });

  it('templates substition by the variable parameter', () => {
    const thingVar = nv('thing');
    const thing2Var = nv('thing2')
    const p = template`what is a ${thingVar} to ${thing2Var}?`;

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

  it('parts', () => {
    const t = template`what is an ${nv('x')} to a ${nv('y')} anyway?`;
    const prefixes = [...t.parts()].map(x => x.prefix);
    const varNames = [...t.parts()].map(x => x.variable ? x.variable.name : undefined);
    expect(prefixes).toEqual(['what is an ', ' to a ', ' anyway?']);
    expect(varNames).toEqual(['x', 'y', undefined]);

    // More explicitly...
    const parts = t.parts();
    const part1 = parts.next();
    expect(part1.value).toBeDefined();
    expect(part1.value?.prefix).toEqual('what is an ');
    expect(part1.value?.variable?.name).toEqual('x');
    const part2 = parts.next();
    expect(part2.value).toBeDefined();
    expect(part2.value?.prefix).toEqual(' to a ');
    expect(part2.value?.variable?.name).toEqual('y');
    const part3 = parts.next();
    expect(part3.value).toBeDefined();
    expect(part3.value?.prefix).toEqual(' anyway?');
    expect(part3.value?.variable).toEqual(undefined);
    const part4 = parts.next();
    expect(part4.done).toBe(true);
  });

  it('TypeScript BUG: ', () => {
    const thingVar = nv('thing');
    const thing2Var = nv('thing2')
    const p = template`what is a ${thingVar} to ${thing2Var}?`;

    const bigThingVar = nv('bigThing')
    const p2 = template`big ${bigThingVar}`;
    const p4 = template`foo ${bigThingVar}, bar ${thingVar}, and ${thing2Var}`;

    // BUG, the following line produces this error:
    /*
Argument of type 'Template<"thing" | "person">' is not assignable to parameter of type 'Variable<"bigThing"> | Template<"bigThing">'.
Type 'Template<"thing" | "thing2">' is not assignable to type 'Template<"bigThing">'.
Types of property 'vars' are incompatible.
  Property 'bigThing' is missing in type '{ thing: Variable<"thing">; person: Variable<"person">; }' but required in type '{ bigThing: Variable<"bigThing">; }'.ts(2345)
    */
    // const p3 = template`foo ${p2}, bar ${p}`;

    // TODO: complete the test once the bug is fixed...
    // expect(p3.template).toEqual(
    //   `foo what is {{thing}} to {{person}}, bar {{bigThing}}?`);
    // expect(p3.vars.bigThing.name).toEqual(bigThingHole.name);
    // expect(p3.vars.person.name).toEqual(personHole.name);
  });
});

