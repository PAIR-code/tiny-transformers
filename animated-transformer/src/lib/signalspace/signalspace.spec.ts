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

import { DerivedNode, DerivedNodeState } from './derived-node';
import { SetableNode } from './setable-node';
import { SignalSpace, defined, promisifySignal, SignalKind, DepKind } from './signalspace';

describe('signalspace', () => {
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

  it('Simple derived update with a new object', () => {
    // This test might seem obvious, but new objects help check for loops in change detection flows.
    const s = new SignalSpace();

    class Foo {
      constructor(public value: string) {}
    }

    const a = new SetableNode(s, 'a', { id: 'a' });
    const b = new DerivedNode(
      s,
      () => {
        return new Foo(a.get());
      },
      { id: 'b' }
    );
    const c = new DerivedNode(
      s,
      () => {
        return b.get().value + 'c';
      },
      { id: 'c' }
    );

    expect(b.get().value).toEqual('a');
    expect(c.get()).toEqual('ac');
    a.set('A');
    expect(b.get().value).toEqual('A');
    expect(c.get()).toEqual('Ac');
  });

  it('Compound signal graph with lazy node updates', async () => {
    const s = new SignalSpace();
    const a = new SetableNode(s, 'a', { id: 'a' });
    const b = new SetableNode(s, 'b', { id: 'b' });
    const aa = new DerivedNode(s, () => a.get() + 'a', { id: 'aa' });
    const aab = new DerivedNode(s, () => aa.get() + b.get(), {
      kind: SignalKind.LazyDerived,
      id: 'aab',
    });
    const aabc = new DerivedNode(s, () => aab.get() + 'c', {
      kind: SignalKind.LazyDerived,
      id: 'aabc',
    });
    expect(aab.get()).toEqual('aab');
    b.set('B');
    expect(aab.get()).toEqual('aaB');
    expect(aabc.get()).toEqual('aaBc');
    expect(aab.state).toEqual(DerivedNodeState.UpToDate);
    expect(aabc.state).toEqual(DerivedNodeState.UpToDate);
    a.set('A');
    expect(aab.state).toEqual(DerivedNodeState.RequiresRecomputing);
    expect(aabc.state).toEqual(DerivedNodeState.HasSomeUpstreamChanges);
    expect(aab.get()).toEqual('AaB');
    expect(aab.state).toEqual(DerivedNodeState.UpToDate);
    expect(aabc.state).toEqual(DerivedNodeState.RequiresRecomputing);
    expect(aabc.get()).toEqual('AaBc');
    expect(aab.state).toEqual(DerivedNodeState.UpToDate);
  });

  it('derivedNullable on value', () => {
    const s = new SignalSpace();
    const { setable, derivedNullable } = s;
    const a = setable<{ str: string } | null>({ str: 'a' });
    const b = derivedNullable(() => {
      return defined(a).str + 'b';
    });
    expect(b()).toEqual('ab');
    a.set(null);
    expect(b()).toEqual(null);
  });

  it('derivedNullable on derived', () => {
    const s = new SignalSpace();
    const { setable, derivedNullable } = s;
    const a = setable<{ str: string } | null>({ str: 'a' });
    const b = derivedNullable(() => {
      return { bStr: defined(a).str + 'b' };
    });
    const c = derivedNullable(() => {
      if (defined(b).bStr === 'b') {
        return null;
      }
      const b2 = defined(b);
      return b2.bStr + 'c';
    });
    expect(b()).toEqual({ bStr: 'ab' });
    expect(c()).toEqual('abc');
    a.set(null);
    expect(b()).toEqual(null);
    expect(c()).toEqual(null);
    a.set({ str: '' });
    expect(b()).toEqual({ bStr: 'b' });
    expect(c()).toEqual(null);
  });

  it('derivedNullable on derived, but null at init', () => {
    const s = new SignalSpace();
    const { setable, derivedNullable } = s;
    const a = setable<{ str: string } | null>(null);
    const b = derivedNullable(
      () => {
        return { bStr: defined(a).str + 'b' };
      },
      { definedDeps: [a] }
    );
    const c = derivedNullable(
      () => {
        if (defined(b).bStr === 'b') {
          return null;
        }
        const b2 = defined(b);
        return b2.bStr + 'c';
      },
      { definedDeps: [b] }
    );
    expect(b()).toEqual(null);
    expect(c()).toEqual(null);
    a.set({ str: 'a' });
    expect(b()).toEqual({ bStr: 'ab' });
    expect(c()).toEqual('abc');
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
    const lazyAB = derivedLazy(() => a() + 'b');
    const lazyABC = derivedLazy(() => lazyAB() + 'c');
    const syncEfromLazyAB = derived(() => lazyAB() + 'e');
    expect(lazyABC()).toEqual('abc');
    expect(syncEfromLazyAB()).toEqual('abe');
    a.set('A');
    expect(lazyABC.lastValue()).toEqual('abc');
    expect(syncEfromLazyAB.lastValue()).toEqual('abe');
    expect(lazyABC()).toEqual('Abc');
    expect(syncEfromLazyAB.lastValue()).toEqual('Abe');
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

  it('Double setting with lazy values', async () => {
    const s = new SignalSpace();
    const { setable, derivedLazy } = s;
    let counter = 0;
    const a = setable('a');
    const e = derivedLazy(() => {
      counter += 1;
      return a() + 'e';
    });
    expect(counter).toEqual(1);
    expect(a()).toEqual('a');
    expect(e()).toEqual('ae');
    expect(counter).toEqual(1);
    a.set('A');
    expect(e.lastValue()).toEqual('ae');
    expect(counter).toEqual(1);
    expect(e()).toEqual('Ae');
    expect(counter).toEqual(2);
    expect(e.lastValue()).toEqual('Ae');
    a.set('aa');
    a.set('AA');
    expect(counter).toEqual(2);
    expect(e()).toEqual('AAe');
    expect(counter).toEqual(3);
  });

  it('Defining derived values that perform an untracked set (using update)', async () => {
    const s = new SignalSpace();
    const { setable, derived } = s;
    const n = setable(1, { id: 'n' });
    const m = setable(10, { id: 'm' });
    const na = derived(() => n() + 'a', { id: 'na' });
    expect(na()).toEqual('1a');
    // Make an effect that, on every update to m, increases the value of n.
    derived(
      () => {
        m();
        n.update((v) => v + 1);
      },
      { id: 'e' }
    );
    // The initial definiton of 'e' updates n
    expect(n()).toEqual(2);
    expect(na()).toEqual('2a');
    // Now we update m, n is 3!
    m.set(20);
    expect(n()).toEqual(3);
    expect(na()).toEqual('3a');
  });

  it('Loopy setting of values throws error', async () => {
    const s = new SignalSpace();
    const { setable, derived } = s;
    const n = setable(1);
    expect(() =>
      derived(() => {
        n.set(n() + 1);
      })
    ).toThrow();
  });

  it('Loopy setting of values in lazy, does not and is ok', async () => {
    const s = new SignalSpace();
    const { setable, derivedLazy } = s;
    const n = setable(1);
    const a = setable('a');
    const lazy = derivedLazy(() => {
      n.set(n() + 1);
      a();
      return n();
    });
    // definition updates n to 2.
    expect(lazy()).toEqual(2);
    // Note this is not re-evaluated because nothing changed.
    expect(lazy()).toEqual(2);
    a.set('b');
    expect(lazy.lastValue()).toEqual(2);
    expect(lazy()).toEqual(3);
  });
});
