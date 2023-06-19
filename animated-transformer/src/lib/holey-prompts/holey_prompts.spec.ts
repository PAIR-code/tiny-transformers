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

// gtensor.spec.ts
import { HoleyPrompt, Hole, RegExpHole, makePrompt } from './holey_prompts';

describe('holey_prompts', () => {
  beforeEach(() => {
  });

  it('Replacing a hole with a string', () => {
    const thingHole = new RegExpHole('thing');
    const p = new HoleyPrompt(`what is a ${thingHole}?`,
      [thingHole]);

    const p2 = p.substStr(p.holes.thing, 'bar');

    expect(p2.template).toEqual('what is a bar?');
  });

  it('Replacing a hole with a prompt', () => {
    const thingHole = new RegExpHole('thing');
    const p = new HoleyPrompt(`what is a ${thingHole}?`,
      [thingHole]);

    const bigHole = new RegExpHole('bigThingName')
    const p2 = new HoleyPrompt(`big ${bigHole}?`, [bigHole]);

    const p3 = p.substPrompt(p.holes.thing, p2);

    expect(p3.template).toEqual(`what is a big {{bigThingName}}?`);
    expect(p3.holes.bigThingName.name).toEqual(`bigThingName`);
  });

  it('makePrompt with holes', () => {
    const thingHole = new RegExpHole('thing');
    const personHole = new RegExpHole('person')
    const p = makePrompt`what is a ${thingHole} to ${personHole}?`;

    const bigThingHole = new RegExpHole('bigThing')
    const p2 = makePrompt`big ${bigThingHole}?`;

    const p3 = p.substPrompt(p.holes.thing, p2);

    expect(p3.template).toEqual(`what is a big {{bigThing}}?`);
    expect(p3.holes.bigThing.name).toEqual(`bigThing`);
  });

  it('makePrompt with prompts', () => {
    const thingHole = new RegExpHole('thing');
    const personHole = new RegExpHole('person')
    const p = makePrompt`what is a ${thingHole} to ${personHole}?`;

    const bigThingHole = new RegExpHole('bigThing')
    const p2 = makePrompt`big ${bigThingHole}?`;

    // BUG, the following line produces this error:
    /*
    Argument of type 'HoleyPrompt<"thing" | "person">' is not assignable to parameter of type 'Hole<"bigThing"> | HoleyPrompt<"bigThing">'.
  Type 'HoleyPrompt<"thing" | "person">' is not assignable to type 'HoleyPrompt<"bigThing">'.
    Types of property 'holes' are incompatible.
      Property 'bigThing' is missing in type '{ thing: Hole<"thing">; person: Hole<"person">; }' but required in type '{ bigThing: Hole<"bigThing">; }'.ts(2345)
    */
    // const p3 = makePrompt`foo ${p2}, bar ${p}`;
    // expect(p3.template).toEqual(
    //   `foo what is {{thing}} to {{person}}, bar {{bigThing}}?`);
    // expect(p3.holes.bigThing.name).toEqual(bigThingHole.name);
    // expect(p3.holes.person.name).toEqual(personHole.name);
  });
});

