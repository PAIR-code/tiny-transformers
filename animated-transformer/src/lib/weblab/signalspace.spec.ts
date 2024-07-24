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

import {
  SignalSpace,
  ValueSignal,
  signal,
  computed,
  effect,
} from './signalspace';

describe('signalspace', () => {
  async function waitTick(): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 0);
    });
  }

  it('Simple signal compute', () => {
    const s = new SignalSpace();

    const b = new ValueSignal(s, 'b');

    const c = s.makeComputedSignal(() => {
      return b.get() + 'c';
    });

    expect(c.get()).toEqual('bc');
    b.set('a');
    expect(c.get()).toEqual('ac');
  });

  it('Compound signal graph compute', () => {
    const s = new SignalSpace();

    const a = new ValueSignal(s, 'a');
    const b = new ValueSignal(s, 'b');

    const aa = s.makeComputedSignal(() => {
      return a.get() + 'a';
    });

    const aab = s.makeComputedSignal(() => {
      return aa.get() + b.get();
    });

    expect(aab.get()).toEqual('aab');
    b.set('B');
    expect(aab.get()).toEqual('aaB');
    a.set('A');
    expect(aab.someDependencyChanged()).toEqual(true);
    expect(aab.get()).toEqual('AaB');
  });

  it('Two step signal update', () => {
    const s = new SignalSpace();

    const a = new ValueSignal(s, 'a');
    const b = s.makeComputedSignal(() => {
      return a.get() + 'b';
    });
    const c = s.makeComputedSignal(() => {
      return b.get() + 'c';
    });

    expect(c.get()).toEqual('abc');
    a.set('A');
    expect(c.get()).toEqual('Abc');
  });

  it('Two step effect vs compute signal update', async () => {
    const s = new SignalSpace();

    const a = new ValueSignal(s, 'a');
    const b = s.makeComputedSignal(() => {
      return a.get() + 'b';
    });
    const c = s.makeComputedSignal(() => {
      return b.get() + 'c';
    });
    const e = s.makeComputedSignal(
      () => {
        return b.get() + 'e';
      },
      { isEffect: true }
    );

    expect(c.get()).toEqual('abc');
    expect(e.get()).toEqual('abe');
    a.set('A');

    const { e2, c2 } = await new Promise<{ c2: string; e2: string }>(
      (resolve) => {
        setTimeout(() => {
          resolve({ c2: c.lastValue, e2: e.lastValue });
        }, 0);
      }
    );

    expect(c2).toEqual('abc');
    expect(e2).toEqual('Abe');
    expect(c.get()).toEqual('Abc');
    expect(c.lastValue).toEqual('Abc');
  });

  it('Two step effect vs compute signal update with angular-style syntax', async () => {
    const s = new SignalSpace();

    const a = signal(s, 'a');
    const b = computed(s, () => {
      return a() + 'b';
    });
    const c = computed(s, () => {
      return b() + 'c';
    });
    const e = effect(s, () => {
      return b() + 'e';
    });

    expect(c()).toEqual('abc');
    expect(e()).toEqual('abe');
    a.set('A');

    const { e2, c2 } = await new Promise<{ c2: string; e2: string }>(
      (resolve) => {
        setTimeout(() => {
          resolve({ c2: c.lastValue(), e2: e.lastValue() });
        }, 0);
      }
    );

    expect(c2).toEqual('abc');
    expect(e2).toEqual('Abe');
    expect(c()).toEqual('Abc');
    expect(c.lastValue()).toEqual('Abc');
  });

  it('An effect that sets a value', async () => {
    const s = new SignalSpace();

    const v1 = signal(s, 'a');
    const v2 = signal(s, 1);
    const v3 = signal(s, '_');
    const b = computed(s, () => {
      return v1() + 'b' + v2() + v3();
    });
    const d = effect(s, () => {
      return v2() + 'd';
    });

    await waitTick();

    expect(d()).toEqual('1d');

    const e = effect(s, () => {
      v2.update((v) => v + 1);
      // v2.set(v2({ untracked: true }) + 1);
      return v1() + 'e';
    });

    // Although e's effect function was called, and
    // v2 was updated; the signal has yet to propegate
    // so the value value of of d is still 1d.
    expect(v2.lastValue()).toEqual(2);
    expect(d.lastValue()).toEqual('1d');
    // But if we explicitly get the value, it will be updated,
    // because it was marked as needing update when v2 was set.
    expect(d()).toEqual('2d');

    // // Now that d2 was set, the last value is updated too.
    // expect(d.lastValue()).toEqual('2d');
    // //
    // expect(e()).toEqual('2e');

    // v1.set('aa');

    // await waitTick();

    // expect(d.lastValue()).toEqual('3d');
    // expect(d()).toEqual('3d');
    // expect(e()).toEqual('3e');
  });
});
