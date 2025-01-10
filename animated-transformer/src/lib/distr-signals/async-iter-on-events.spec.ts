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

import { AsyncIterOnEvents } from './async-iter-on-events';

describe('async-iter-on-events', () => {
  beforeEach(async () => {});

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  it('AsyncIterOnEvents simple queue', async () => {
    const i = new AsyncIterOnEvents<number>();
    // These should be queued...
    i.nextEvent(1);
    i.nextEvent(2);
    i.nextEvent(3);
    expect(i.queue).toEqual([1, 2, 3]);
    expect(await i.next()).toEqual({ value: 1 });
    expect(await i.next()).toEqual({ value: 2 });
    expect(await i.next()).toEqual({ value: 3 });
    i.done();
    expect(await i.next()).toEqual({ done: true, value: null });
  });

  it('AsyncIterOnEvents with pending', async () => {
    const i = new AsyncIterOnEvents<number>();

    let iPending = null as number | null;
    i.next().then((v) => {
      iPending = v.value;
    });
    expect(i.queue).toEqual([]);
    expect(iPending).toEqual(null);

    i.nextEvent(65);
    await sleep(0);

    expect(i.queue).toEqual([]);
    expect(iPending).toEqual(65);

    i.nextEvent(1);
    i.nextEvent(2);
    i.nextEvent(3);
    expect(i.queue).toEqual([1, 2, 3]);
    expect(await i.next()).toEqual({ value: 1 });
    expect(await i.next()).toEqual({ value: 2 });
    expect(await i.next()).toEqual({ value: 3 });
    i.done();
    expect(await i.next()).toEqual({ done: true, value: null });
  });
});
