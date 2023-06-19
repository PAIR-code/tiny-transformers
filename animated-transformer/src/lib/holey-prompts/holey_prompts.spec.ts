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
import { HoleyPrompts, Hole } from './holey_prompts';

describe('holey_prompts', () => {
  beforeEach(() => {
  });

  it('Replacing a hole with a string', () => {
    const p = new HoleyPrompts(`what is a {{thingName}}?`,
      [new Hole('thingName')]);

    const p2 = p.substStr(p.holes.thingName, 'bar');

    expect(p2.template).toEqual('what is a bar?');
  });

  it('Replacing a hole with a prompt', () => {
    const p = new HoleyPrompts(`what is a {{thingName}}?`,
      [new Hole('thingName')]);

    const p2 = new HoleyPrompts(`big {{bigThingName}}?`,
      [new Hole('bigThingName')]);

    const p3 = p.substPrompt(p.holes.thingName, p2);

    expect(p3.template).toEqual(`what is a big {{bigThingName}}?`);
    expect(p3.holes.bigThingName.name).toEqual(`bigThingName`);
  });
});

