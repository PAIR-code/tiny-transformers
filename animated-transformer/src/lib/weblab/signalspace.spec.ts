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
});
