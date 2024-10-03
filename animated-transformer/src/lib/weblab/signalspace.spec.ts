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
  SetableNode,
  setable,
  derived,
  alwaysDerived,
  DerivedNode,
  defined,
} from './signalspace';

// if T is void, it's void, otherwiswe it is the return value.
type MaybeReturn<T> = void extends T ? void : T;

describe('signalspace', () => {
  async function waitTick<T>(f?: () => T): Promise<MaybeReturn<T>> {
    return new Promise<T | void>((resolve) => {
      setTimeout(() => {
        if (f) {
          resolve(f());
        } else {
          resolve();
        }
      }, 0);
    }) as Promise<MaybeReturn<T>>;
  }

  it('Simple signal compute', () => {
    const s = new SignalSpace();

    const b = new SetableNode(s, 'b');

    const c = new DerivedNode(s, () => {
      return b.get() + 'c';
    });

    expect(c.get()).toEqual('bc');
    b.set('a');
    expect(c.get()).toEqual('ac');
  });

  it('Compound signal graph compute', async () => {
    const s = new SignalSpace();

    const a = new SetableNode(s, 'a');
    const b = new SetableNode(s, 'b');

    const aa = new DerivedNode(s, () => {
      return a.get() + 'a';
    });

    const aab = new DerivedNode(s, () => {
      return aa.get() + b.get();
    });

    expect(aab.get()).toEqual('aab');
    b.set('B');
    expect(aab.get()).toEqual('aaB');
    console.warn('about to accidentally have a signal update (in a timeout callback...)...');
    a.set('A');
    expect(aab.someDependencyChanged()).toEqual(true);
    expect(aab.get()).toEqual('AaB');
    console.warn('...TODO: fix the above.');
  });

  it('defined in nullDerived', () => {
    const s = new SignalSpace();
    const { setable, nullDerived } = s.ops();
    const a = setable<string | null>('a');
    const b = nullDerived(() => {
      return defined(a) + 'b';
    });
    expect(b()).toEqual('ab');
    a.set(null);
    expect(b()).toEqual(null);
  });

  it('defined in derived throws error', () => {
    const s = new SignalSpace();
    const { setable, derived } = s.ops();
    const a = setable<string | null>('a');
    expect(() =>
      derived(() => {
        return defined(a) + 'b';
      })
    ).toThrow();
  });

  it('Two step signal update', () => {
    const s = new SignalSpace();

    const a = new SetableNode(s, 'a');
    const b = new DerivedNode(s, () => {
      return a.get() + 'b';
    });
    const c = new DerivedNode(s, () => {
      return b.get() + 'c';
    });

    expect(c.get()).toEqual('abc');
    a.set('A');
    expect(c.get()).toEqual('Abc');
  });

  it('Two step effect vs compute signal update', async () => {
    const s = new SignalSpace();

    const a = new SetableNode(s, 'a');
    const b = new DerivedNode(s, () => a.get() + 'b');
    const c = new DerivedNode(s, () => b.get() + 'c');
    const e = new DerivedNode(s, () => b.get() + 'e', { isEffect: true });

    expect(c.get()).toEqual('abc');
    expect(e.get()).toEqual('abe');
    a.set('A');

    const { e2, c2 } = await new Promise<{ c2: string; e2: string }>((resolve) => {
      setTimeout(() => {
        resolve({ c2: c.lastValue, e2: e.lastValue });
      }, 0);
    });

    expect(c2).toEqual('abc');
    expect(e2).toEqual('Abe');
    expect(c.get()).toEqual('Abc');
    expect(c.lastValue).toEqual('Abc');
  });

  it('Double setting values and effects: normal alwaysDerived Values', async () => {
    const s = new SignalSpace();

    let counter = 0;
    const a = setable(s, 'a');
    const e = alwaysDerived(s, () => {
      counter += 1;
      return a() + 'e';
    });
    expect(counter).toEqual(1);

    expect(a()).toEqual('a');
    expect(e()).toEqual('ae');
    a.set('A');

    const { nextTick_a, nextTick_e } = await waitTick(() => {
      return { nextTick_a: a.lastValue(), nextTick_e: e.lastValue() };
    });

    expect(nextTick_a).toEqual('A');
    expect(nextTick_e).toEqual('Ae');
    expect(counter).toEqual(2);
    a.set('aa');
    a.set('AA');
    await waitTick();
    expect(counter).toEqual(4);
  });

  it('Double setting values and effects: normal update justLatest values', async () => {
    const s = new SignalSpace();

    let counter = 0;
    const a = setable(s, 'a', { clobberBehvaior: 'justLatest' });
    const e = alwaysDerived(s, () => {
      counter += 1;
      return a() + 'e';
    });
    expect(counter).toEqual(1);

    expect(a()).toEqual('a');
    expect(e()).toEqual('ae');

    expect(counter).toEqual(1);
    console.log('1:', a.lastValue());
    a.set('A');
    expect(counter).toEqual(1);
    console.log('2:', a.lastValue());
    await waitTick();
    console.log('3:', a.lastValue());

    expect(counter).toEqual(2);
    a.set('aa');
    a.set('AA');
    await waitTick();
    // Contrast this to the previous test where the value is 4!
    expect(counter).toEqual(3);
  });

  it('Two step effect vs compute signal update with angular-style syntax', async () => {
    const s = new SignalSpace();

    const a = setable(s, 'a');
    const b = derived(s, () => {
      return a() + 'b';
    });
    const c = derived(s, () => {
      return b() + 'c';
    });
    const e = alwaysDerived(s, () => {
      return b() + 'e';
    });

    expect(c()).toEqual('abc');
    expect(e()).toEqual('abe');
    a.set('A');

    const { e2, c2 } = await waitTick(() => {
      return { c2: c.lastValue(), e2: e.lastValue() };
    });

    expect(c2).toEqual('abc');
    expect(e2).toEqual('Abe');
    expect(c()).toEqual('Abc');
    expect(c.lastValue()).toEqual('Abc');
  });

  it('An effect that sets a value', async () => {
    const s = new SignalSpace();

    const v1 = setable(s, 'a');
    const v2 = setable(s, 1);
    const v3 = setable(s, '_');
    const b = derived(s, () => {
      return v1() + 'b' + v2() + v3();
    });
    const d = alwaysDerived(s, () => {
      return v2() + 'd';
    });

    await waitTick();

    expect(d()).toEqual('1d');

    const e = alwaysDerived(s, () => {
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
