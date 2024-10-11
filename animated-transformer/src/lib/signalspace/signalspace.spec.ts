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

import { DerivedNode } from './derived-signal';
import { SetableNode } from './setable-signal';
import {
  SignalSpace,
  setable,
  derived,
  derivedLazy,
  defined,
  promisifySignal,
  SignalKind,
} from './signalspace';

fdescribe('signalspace', () => {
  it('Simple signal compute', () => {
    const s = new SignalSpace();
    const ab = new SetableNode(s, 'b' as 'a' | 'b');
    const c = new DerivedNode(s, () => {
      return ab.get() + 'c';
    });
    expect(c.get()).toEqual('bc');
    ab.set('a');
    expect(c.get()).toEqual('ac');
  });

  it('Simple two step signal update', () => {
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

  it('Compound signal graph with lazy node', async () => {
    const s = new SignalSpace();
    const a = new SetableNode(s, 'a');
    const b = new SetableNode(s, 'b');
    const aa = new DerivedNode(s, () => a.get() + 'a');
    const aab = new DerivedNode(s, () => aa.get() + b.get(), { kind: SignalKind.LazyDerived });
    expect(aab.get()).toEqual('aab');
    b.set('B');
    expect(aab.get()).toEqual('aaB');
    a.set('A');
    expect(aab.upstreamDepChanged()).toEqual(true);
    expect(aab.get()).toEqual('AaB');
    expect(aab.upstreamDepChanged()).toEqual(false);
  });

  it('defined in derivedNullable', () => {
    const s = new SignalSpace();
    const { setable, derivedNullable } = s;
    const a = setable<string | null>('a');
    const b = derivedNullable(() => {
      return defined(a) + 'b';
    });
    expect(b()).toEqual('ab');
    a.set(null);
    expect(b()).toEqual(null);
  });

  it('defined in non nullable derived throws error', () => {
    const s = new SignalSpace();
    const { setable, derived } = s;
    const a = setable<string | null>('a');
    expect(() => derived(() => defined(a) + 'b')).toThrow();
  });

  it('simple setable + derived and side effect counting per set', () => {
    const s = new SignalSpace();
    const { setable, derived } = s;
    const a = setable('a');
    let i = 0;
    derived(() => {
      a();
      console.log('i:', i++);
    });
    expect(i).toEqual(1);
    a.set('A');
    expect(i).toEqual(2);
  });

  it('Lazy and Sync signal interaction', async () => {
    const s = new SignalSpace();
    const { setable, derived, derivedLazy } = s;
    const a = setable('a');
    const b = derivedLazy(() => a() + 'b');
    const c = derivedLazy(() => b() + 'c');
    const e = derived(() => b() + 'e');
    expect(c()).toEqual('abc');
    expect(e()).toEqual('abe');
    a.set('A');
    expect(c.lastValue).toEqual('abc');
    expect(e.lastValue).toEqual('Abe');
    expect(c()).toEqual('Abc');
  });

  it('promisifySignal', async () => {
    const s = new SignalSpace();
    const { setable, derived } = s;
    const a = setable(1);
    const b = derived(() => a() + 'b');
    const c = promisifySignal(b);
    expect(c().cur).toEqual('1b');
    const p = c().next;
    a.set(2);
    const cnext = await p;
    expect(cnext).toEqual('2b');
    expect(c().cur).toEqual('2b');
    const p2 = c().next;
    a.set(3);
    expect(await p2).toEqual('3b');
    expect(c().cur).toEqual('3b');
  });

  it('Double setting within lazy values', async () => {
    const s = new SignalSpace();

    let counter = 0;
    const a = setable(s, 'a');
    const e = derivedLazy(s, () => {
      counter += 1;
      return a() + 'e';
    });
    expect(counter).toEqual(1);

    expect(a()).toEqual('a');
    expect(e()).toEqual('ae');
    a.set('A');
    expect(e.lastValue).toEqual('ae');
    expect(counter).toEqual(1);
    expect(e()).toEqual('Ae');
    expect(counter).toEqual(2);
    a.set('aa');
    a.set('AA');
    expect(counter).toEqual(2);
    expect(e()).toEqual('AAe');
    expect(counter).toEqual(3);
  });

  fit('loopy setting of setables within derived values get caught', async () => {
    const s = new SignalSpace();
    const { setable, derived } = s;
    const n = setable(1, { id: 'n' });
    const m = setable(10, { id: 'm' });
    // Uncommenting below causes the set in update call of 'e' to re-execute 'a'
    // (becaue it depends on n), which calls a get on 'n', which makes e to
    // depend on 'n': a speaky dependency creep...
    const a = derived(
      () => {
        return n() + 'a';
      },
      { id: 'a' }
    );
    expect(a()).toEqual('1a');
    derived(
      () => {
        m();
        n.update((v) => v + 1);
      },
      { id: 'e' }
    );
    expect(n()).toEqual(2);
    expect(a()).toEqual('2a');
    m.set(20);
    expect(n()).toEqual(3);
    expect(a()).toEqual('3a');
  });

  xit('Loopy setting within lazy derivations is fine', async () => {
    const s = new SignalSpace();
    const { setable, derivedLazy } = s;
    const n = setable(1);
    const a = derivedLazy(() => {
      return n() + 'a';
    });

    expect(a()).toEqual('1a');
    console.log(
      derivedLazy(() => {
        n.update((v) => v + 1);
      })
    );

    expect(n()).toEqual(2);
    expect(a()).toEqual('2a');
    expect(a()).toEqual('3a');
  });
});
