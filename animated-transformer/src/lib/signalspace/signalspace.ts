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

import { AbstractSignal, defaultEqCheck, DerivedSignal, SetableSignal } from './abstract-signal';
import { DerivedNode, DerivedOptions } from './derived-signal';
import { SetableNode, SetableOptions, SignalSetOptions } from './setable-signal';

/**
 * This is a special opinionated take on Signals, inspired by Angular's
 * implementation, but also a little different. Consider:
 *
 * ```
 * const s = setable(() => ...)
 * const c = derived(() =>  ... s() ...)
 * const e = derivedEvery(() => ... s() ...)
 * ```
 *
 * Semantics:
 *
 *  * setable: holds values that can be edited.
 *  * derived: maybe sync, maybe next tick computations, per tick value set
 *    changes
 *  * derivedEvery: thread-sync effects, per value change
 *
 * `c` will get updated lazily, i.e. whenever c() or c.get() is called). `e`
 * will be updated eagerly, every time there's any updates to any signals that e
 * depends on, e.g. whenever s.set(...) is called.
 *
 * Cool thing: It's fine to call `s.set` in a derived signal or effect, but if
 * you create a cycle, only one pass through the cycle will happen, and you'll
 * get a JS console error with a trace. But this lets you do safe stuff easily,
 * like make set stuff that was not set before, and that will cause new signal
 * effects (derivedEvery). Loops of `.set` are not allowed, and will be caught
 * and produce an error.
 *
 * TODO: think about if this guarentees termination since there is a finite set
 * of dependee signals in any given update call (existing effects can't change
 * the set of things they depend on)... (CONSIDER proof: what about effects that
 * create new signals, and those new signals trigger new effects - they can't
 * trigger old effects because those old effects are already defined.)
 *
 * CONSIDER: ideally, it would be nice to track dependencies in the type
 * system...
 *
 * TODO: Make explicit the notion of a set of updates, and when they are
 * triggered. e.g. updateCachedValue(...) should not directly trigger. Where
 * emit(...) should.
 *
 * CONSIDER: maybe alwaysDerived (called effects earlier) should be always
 * derived from what defines it, rather than from the root setable nodes. Right
 * now I think the long range implicit dependency is likely to be surprising and
 * confusing; it's just a bit too subtle.
 */

// Intended to be a type for the result of setTimeout.
export type Timeout = unknown;

// Manages a single update pass through the signalspace.
export type SignalSpaceUpdate = {
  // Values touched in this update.
  valuesUpdated: Set<SetableNode<unknown>>;

  // All sync deps touched in this update.
  syncDepsTouched: Set<DerivedNode<unknown>>;

  // Sync deps left to actually compute the update of.
  syncDepsToUpdate: Set<DerivedNode<unknown>>;

  // The set of values updated from computations.
  // Used to avoid computation loops.
  //
  // A compute chain should never update the same value
  // more than once, otherwise there is be a loop.
  //
  // TODO: This could be smarter: the same compute never updates
  // the same value more than once.
  changedValueSet: Set<SetableNode<unknown>>;

  // The actual function that gets called with timeout of 0
  // to do the updating the signalspace.
  // It gets removed from here after it is called.
  // updateFn?: Timeout;
  counter: number;
};

// ----------------------------------------------------------------------------
//  Options specifying a dependency (relevant within a "get" in the context of a
//  derived signal)
// ----------------------------------------------------------------------------
export enum DepKind {
  // Sync definitions / dependencies mean that, whenever a setable value in the
  // chain
  Sync = 'SyncDepKind',
  Lazy = 'LazyDepKind',
  // There is no "Untracked" dependency, for that you just get the signals
  // current value.
  // Untracked = 'UntrackedDepKind',
}

export type SignalDepOptions = {
  depKind: DepKind; // default DepKind.Tracked;

  // When a given derived parent is nullDerived and this is true, and the value
  // of this signal is null, then force the parent's computation to be null;
  // If true, any derivations using this signal but be nullTyped=true, AND the
  // derivation computation function using depending on this signal will only
  // be executed when this derivation results in a non-null value.
  downstreamNullIfNull: boolean;
};

// TODO: make a class for an instance of a dependency, and use that. e.g. to
// hold if a specific dependency can/should nullify the parent (if the parent
// allows it).
// export class SetableDep {
//   constructor(
//     public nodes: { cause: SetableNode<unknown>, effect: DerivedNode<unknown>},
//     public options?: Partial<SignalDepOptions>) {}
// }
// export class DerivedDep {
//   constructor(
//     public nodes: { cause: DerivedNode<unknown>, effect: DerivedNode<unknown> },
//     public options?: Partial<SignalDepOptions>) {}
// }

export class SetableDep {
  constructor(public node: SetableNode<unknown>, public options?: Partial<SignalDepOptions>) {}
}
export class DerivedDep {
  constructor(public node: DerivedNode<unknown>, public options?: Partial<SignalDepOptions>) {}
}

// ----------------------------------------------------------------------------
//  Information about the context of a computation (e.g. for get or set).
// ----------------------------------------------------------------------------
export enum ComputeContextKind {
  Definition = 'Definition',
  Update = 'Update',
  NoComputeContext = 'NoComputeContext',
}

export type ComputeContext =
  | {
      kind: ComputeContextKind.Definition;
      node: DerivedNode<unknown>;
    }
  | {
      kind: ComputeContextKind.Update;
      node: DerivedNode<unknown>;
    }
  | {
      kind: ComputeContextKind.NoComputeContext;
    };

export enum SignalKind {
  // Setable signals contain root values that can be set, triggering derived
  // siganls to be updated.
  Setable = 'SetableSignalKind',
  // Derived signals have a function and dependendies on other derived signals
  // and setable siganls.
  SyncDerived = 'SyncDerivedSignalKind',
  LazyDerived = 'LazyDerivedSignalKind',
}

// ----------------------------------------------------------------------------
export class SignalSpace {
  nodeCount = 0;
  updateCounts = 0;

  // Stack of actively being defined/updated computation signals. Used to know
  // how/when to connect nodes in the dependency tree. When a signal.get call is
  // made in the context of a 'def' ComputeStackEntry, then we add that the
  // signal making the get call needed to compute the signal in the 'def'
  // ComputeStackEntry. We also track/stack updates.
  public computeStack: ComputeContext[] = [];

  public signalSet: Set<DerivedNode<unknown> | SetableNode<unknown>> = new Set();

  // Set for the time between a value has been updated, and
  // when the update all effects has been completed.
  public update?: SignalSpaceUpdate;

  // Convenience functions so you can write {setable} = new SignalSpace();
  public setable = setable.bind(null, this) as <T>(
    value: T,
    options?: Partial<SetableOptions<T>>
  ) => SetableSignal<T>;
  public derived = derived.bind(null, this) as <T>(
    f: () => T,
    options?: Partial<DerivedOptions<T>>
  ) => DerivedSignal<T>;
  public derivedNullable = derivedNullable.bind(null, this) as <T>(
    f: () => T | null,
    options?: Partial<DerivedOptions<T>>
  ) => DerivedSignal<T | null>;
  public derivedLazy = derivedLazy.bind(null, this) as <T>(
    f: () => T,
    options?: Partial<DerivedOptions<T>>
  ) => DerivedSignal<T>;
  public derivedLazyNullable = derivedLazyNullable.bind(null, this) as <T>(
    f: () => T | null,
    options?: Partial<DerivedOptions<T>>
  ) => DerivedSignal<T | null>;

  constructor() {}

  computeContext(): ComputeContext {
    if (this.computeStack.length === 0) {
      return { kind: ComputeContextKind.NoComputeContext };
    }
    return this.computeStack[this.computeStack.length - 1];
  }

  // propegateValueUpdate(update: SignalSpaceUpdate, derived: DerivedNode<unknown>) {

  //   if(derived)
  // }

  // Called whenever a setable value is set and it changes the value.
  noteValueUpdate(valueSignal: SetableNode<unknown>): SignalSpaceUpdate {
    if (!this.update) {
      this.update = {
        valuesUpdated: new Set(),
        // All sync deps downstream of a member of valuesUpdated.
        syncDepsTouched: new Set(),
        // Remaining downstream deps to update. Subset of syncDepsTouched.
        syncDepsToUpdate: new Set(),
        // Subset of valuesUpdated that were changed during sync updates.
        changedValueSet: new Set(),
        counter: this.updateCounts++,
      };
    }
    this.update.valuesUpdated.add(valueSignal);
    // Make sure that we know dependencies may need updating,
    // in case they are called in a c.get() in the same JS
    // execution tick/stage.
    for (const dep of valueSignal.dependsOnMeLazy) {
      dep.upstreamSetableChanges = this.update.valuesUpdated;
    }
    for (const dep of valueSignal.dependsOnMeSync) {
      dep.upstreamSetableChanges = this.update.valuesUpdated;
      this.update.syncDepsTouched.add(dep);
      this.update.syncDepsToUpdate.add(dep);
    }
    return this.update;
  }

  // updateInProgress(): this is { update: SignalSpaceUpdate } {
  //   return (this.update && !this.update.updateFn) || false;
  // }

  // TODO: updates should be done based on the direct computation references,
  // not on the value updates.
  updateSyncDeps() {
    if (!this.update) {
      console.error(`Should not be called with no updateInProgress.`);
      return;
    }
    // Starts the progress update...
    while (this.update.syncDepsToUpdate.size > 0) {
      for (const dep of this.update.syncDepsToUpdate) {
        if (dep.upstreamSetableChanges) {
          dep.updateFromUpstreamChanges();
        }
        this.update.syncDepsToUpdate.delete(dep);
      }
    }
    if (this.computeStack.length === 0) {
      delete this.update;
    }
    console.log('updatePendingEffects: ended', [...this.computeStack]);
  }

  async pipeFromAsyncIter<T>(iter: AsyncIterable<T>, signal: SetableSignal<T>) {
    for await (const i of iter) {
      signal.set(i);
    }
  }

  // CONSIDER: T must not be undefined?
  async *toIter<T>(s: SetableSignal<T> | DerivedSignal<T>): AsyncIterable<T> {
    // const self = this;
    const buffer = [] as Promise<T>[];
    let resolveFn: (v: T) => void;
    let curPromise: Promise<T> = new Promise<T>((resolve) => {
      resolveFn = resolve;
    });
    this.derived(() => {
      buffer.push(curPromise);
      resolveFn(s());
      curPromise = new Promise<T>((resolve) => {
        resolveFn = resolve;
      });
    });

    return {
      [Symbol.asyncIterator]: () => {
        return {
          async next(): Promise<IteratorResult<T, void>> {
            if (buffer.length > 0) {
              const p = buffer.shift()!;
              const value = await p;
              return { value };
            } else {
              const value = await curPromise;
              return { value };
            }
          },
        };
      },
    };
  }
}

// The forked value gets updated whenever 's' is updated, but you can also
// change it (but your value will get changed whenever s does too).
export function writableFork<T>(
  s: AbstractSignal<T>,
  options?: Partial<SetableOptions<T>>
): SetableSignal<T> {
  if (s.node instanceof SetableNode) {
    options = { ...structuredClone(s.node.options), ...options };
  }
  const fork = s.space.setable(s(), options);
  s.space.derived(() => fork.set(s()));
  return fork;
}

// ----------------------------------------------------------------------------
// Raw functions (CONSIDER moving into the space class)
// ----------------------------------------------------------------------------
// Note: we use the type-safe way to define the return value; as far as I know
// this is the only way to do so in typescript; although it is more implicit than I would like.
export function setable<T>(
  space: SignalSpace,
  value: T,
  options?: Partial<SetableOptions<T>>
): SetableSignal<T> {
  const valueNode = new SetableNode(space, value, options);
  const signal = function (options?: Partial<SignalDepOptions>) {
    return valueNode.get(options);
  };
  // const foo = {...writableSignal, { lastValue: 'foo' } };
  signal.lastValue = () => valueNode.value;
  signal.set = (value: T, options?: SignalSetOptions) => valueNode.set(value, options);
  signal.update = (f: (v: T) => T, options?: SignalSetOptions) => valueNode.update(f, options);
  signal.space = space;
  signal.node = valueNode;
  signal.options = options;
  return signal;
}

export function derived<T>(
  space: SignalSpace,
  f: () => T,
  options?: Partial<DerivedOptions<T>>
): DerivedSignal<T> {
  const derivedNode = new DerivedNode<T>(space, f, options);
  const signal = function (options?: Partial<SignalDepOptions>) {
    return derivedNode.get(options);
  };
  signal.node = derivedNode;
  signal.lastValue = () => derivedNode.lastValue;
  signal.space = space;
  signal.options = options;
  return signal;
}

// A special case that allows for `nullme` operators on sub-signals to handle the null cases.
export function derivedNullable<T>(
  space: SignalSpace,
  f: () => T | null,
  options?: Partial<DerivedOptions<T>>
): DerivedSignal<T | null> {
  const definedEqCheck = (options && options.eqCheck) || defaultEqCheck;
  let eqCheck: ((x: T | null, y: T | null) => boolean) | undefined;
  if (definedEqCheck) {
    eqCheck = (a, b) => {
      if (a !== null && b !== null) {
        return definedEqCheck(a, b);
      } else if (a === null && b === null) {
        return true;
      } else {
        return false;
      }
    };
  }

  let nullableOptions: Partial<DerivedOptions<T | null>> = {
    ...options,
    eqCheck,
    nullTyped: true,
  };

  const derivedNode = new DerivedNode<T | null>(space, f, nullableOptions);

  // Note: in pure JS we could write `const signal = derivedSignal.get` But for
  // typescript to do correct incremental type inference, we use the identity
  // function wrapper.
  const signal = function (options?: Partial<SignalDepOptions>) {
    return derivedNode.get(options);
  };
  signal.node = derivedNode;
  signal.lastValue = () => derivedNode.lastValue;
  signal.space = space;
  return signal;
}

// ----------------------------------------------------------------------------
// This is an operator to wrap calls to sub-signals that should only be used
// within derivedNullable signals. It will cause the parent derived signal to be
// null when this signal is null. i.e. you can say only when this is defined
// do we do this computation.
//
// This approach does not work when `s` is a setable signal (and there is not
// special compute function for it in the derived computation chain... it
// might be possible to make it work by also modifying setable nodes...)

export function defined<T>(s: AbstractSignal<T | null>, depEvalKind?: DepKind): T {
  // Note: this is a lie; but the contextualCompute computation will make up
  // for it, and not actually depend on s's Result being nonNull, so all is
  // ok.
  return s({ downstreamNullIfNull: true, depKind: depEvalKind || DepKind.Sync }) as T;
}

// The key characteristic of effects is that they get updated per "set" of a
// child. Computed signals have the option to only re-compute once per tick,
// however many "set" calls of children happen.
export function derivedLazy<T>(
  space: SignalSpace,
  f: () => T,
  options?: Partial<DerivedOptions<T>>
): DerivedSignal<T> {
  options = { ...options, kind: SignalKind.LazyDerived };
  return derived(space, f, options);
}

// The key characteristic of effects is that they get updated per "set" of a
// child. Computed signals have the option to only re-compute once per tick,
// however many "set" calls of children happen.
export function derivedLazyNullable<T>(
  space: SignalSpace,
  f: () => T | null,
  options?: Partial<DerivedOptions<T>>
): DerivedSignal<T | null> {
  options = { ...options, kind: SignalKind.LazyDerived };
  return derivedNullable(space, f, options);
}

export function promisifySignal<T>(
  s: AbstractSignal<T>
): DerivedSignal<{ cur: T; next: Promise<T> }> {
  let resolveFn: (v: T) => void = () => {};

  const promisifiedSignal = s.space.derived(() => {
    const oldResolveFn = resolveFn;
    const next = new Promise<T>((resolve) => {
      resolveFn = resolve;
    });
    const cur = s();
    oldResolveFn(cur);
    return { cur, next };
  });

  return promisifiedSignal;
}
