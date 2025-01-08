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

import { DerivedNode, DerivedNodeState, DerivedNodeOptions } from './derived-node';
import { SetableNode, SetableOptions, SignalSetOptions } from './setable-node';

/**
 * This is a special opinionated take on Signals, inspired by the syntax of
 * Angular's implementation, but allowing for both lazy and eager updates.
 *
 * ```
 * const s = setable(() => ...)
 * const c = derived(() =>  ... s() ...)
 * const e = derivedLazy(() => ... s() ...)
 * ```
 *
 * Semantics:
 *
 *  * setable: holds values that can be set/edited.
 *  * derived: a derived value, updated sync by default from any dependent
 *    signals.
 *  * derivedLazy: computation is evaluted only when requested. This allows many
 *    of it's dependencies to be updated, but only to cause a single actual
 *    computation update when needed.
 *
 * You are allowed to have "set" calls within derived signals; but if you create
 * a loop of settings calls that results in a set causing a change to its own
 * value, then a runtime error is thrown.
 *
 * Under the hood each dependency specifies if it is eager or lazy. Sync means
 * that whenever this particular upstream dependeny changes, the downstream
 * signal gets updated during the same JS event execution as the upsream change
 * happened. Lazy means that when we track when updates are needed, but the
 * downstream computation only happens when the downstream signal value is
 * requested. This allows fine grained control and efficient computation
 * management (e.g. to have many downstreams things change, but only cause a
 * single upstream update).
 *
 * See the unit tests for details and examples of the semantics.
 *
 * TODO: Make an explicit "transaction" for a set of updates.
 *
 * TODO: allow removal of signals (and make it safe from within a derived
 * action)
 */

// ----------------------------------------------------------------------------
export type AbstractSignal<T> = {
  // The get signal's get value function. If this is a derived signal that
  // needs updating, it will compute the updated value.
  (options?: Partial<SignalDepOptions>): T;
  space: SignalSpace;
  // The last value the signal had (doesn't compute updates, even if
  // the signal needs updating).
  lastValue(): T;
  node: SetableNode<T> | DerivedNode<T>;
  // options?: Partial<AbstractOptions<T>>;
};

// ----------------------------------------------------------------------------
export type SetableSignal<T> = AbstractSignal<T> & {
  // Sets the value of the signal.
  set(newValue: T, options?: Partial<SignalSetOptions>): void;
  // Note: propegate signal semantics by default does eqCheck.
  update(f: (oldValue: T) => T, options?: Partial<SignalSetOptions>): void;
  // Note: always forces an update;
  change(f: (changedValue: T) => void): void;
  node: SetableNode<T>;
};

export type DerivedSignal<T> = AbstractSignal<T> & {
  node: DerivedNode<T>;
};

// ----------------------------------------------------------------------------
export type BasicSignalOptions<T> = {
  eqCheck: (x: T, y: T) => boolean;
  id?: string;
};
export function defaultEqCheck<T>(x: T, y: T) {
  return x === y;
}
export function defaultSignalOptions<T>(): BasicSignalOptions<T> {
  return {
    eqCheck: defaultEqCheck,
  };
}

// ----------------------------------------------------------------------------
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

export const defaultDepOptions = {
  depKind: DepKind.Sync,
  downstreamNullIfNull: false,
};

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

// ----------------------------------------------------------------------------
// Manages a single update pass through the signalspace.
export type SignalSpaceUpdate = {
  // Values touched in this update. Used to track loops of setting values.
  valuesUpdated: SetableNode<unknown>[];
  counter: number;
};

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

  // CONSIDER: are there better alterantive to `unknown` here? unknown doesn't
  // have the semantics of valid but unknown, which is what we mean.
  public signalSet: Set<DerivedNode<unknown> | SetableNode<unknown>> = new Set();

  // Set from the time between a value has been updated, and
  // when the update all effects has been completed.
  public update?: SignalSpaceUpdate;

  // Convenience functions so you can write {setable} = new SignalSpace();
  public setable = setable.bind(null, this) as <T>(
    value: T,
    options?: Partial<SetableOptions<T>>,
  ) => SetableSignal<T>;
  public derived = derived.bind(null, this) as <T>(
    f: () => T,
    options?: Partial<DerivedOptions<T>>,
  ) => DerivedSignal<T>;
  public derivedNullable = derivedNullable.bind(null, this) as <T>(
    f: () => T | null,
    options?: Partial<DerivedNullableOptions<T>>,
  ) => DerivedSignal<T | null>;
  // Note the Lazy definition just change the default dependency type to Lazy...
  // we could remove these, and just use the above, but manually specify each
  // dependency as Lazy when we want it. However, it's handy to have some syntax
  // that explicitly expresses lazyness on everything when reading code.
  public derivedLazy = derivedLazy.bind(null, this) as <T>(
    f: () => T,
    options?: Partial<DerivedOptions<T>>,
  ) => DerivedSignal<T>;
  public derivedLazyNullable = derivedLazyNullable.bind(null, this) as <T>(
    f: () => T | null,
    options?: Partial<DerivedNullableOptions<T>>,
  ) => DerivedSignal<T | null>;

  constructor() {}

  computeContext(): ComputeContext {
    if (this.computeStack.length === 0) {
      return { kind: ComputeContextKind.NoComputeContext };
    }
    return this.computeStack[this.computeStack.length - 1];
  }

  // Called whenever a setable value is set and it changes the value.
  propegateValueUpdate(valueSignal: SetableNode<unknown>): void {
    if (!this.update) {
      this.update = {
        // Values in a transaction that were set.
        valuesUpdated: [],
        counter: this.updateCounts++,
      };
    }

    // Error and stop updating if we are looping.
    if (this.update.valuesUpdated.includes(valueSignal)) {
      // console.error(
      //   `A cyclic value update happened in a computation:`,
      //   '\nvalueSignal & new value:',
      //   valueSignal,
      //   this.update.valuesUpdated
      // );
      throw new Error('loopy setting of values');
    }
    //
    this.update.valuesUpdated.push(valueSignal);
    // Make sure that we know dependencies may need updating,
    // in case they are called in a c.get() in the same JS
    // execution tick/stage.
    for (const [dep, options] of valueSignal.dependsOnMe.entries()) {
      if (options.depKind === DepKind.Lazy) {
        dep.noteRequiresRecomputing();
      } else {
        if (dep.state !== DerivedNodeState.RequiresRecomputing) {
          dep.noteRequiresRecomputing();
          dep.ensureUpToDate();
        }
      }
    }

    delete this.update;
  }

  noteStartedDerivedUpdate(node: DerivedNode<unknown>) {
    // TODO: maybe could do loop checking...? I think we don't need to because
    // you cannot define loopy derived compute functions, and all compute
    // functions eventually depend on setables, and setables can only be updated
    // by set calls, and we loop-check setable set calls.
    if (this.computeStack.length > 10) {
      throw new Error('stack too big');
    }
    if (this.update) {
      this.computeStack.push({
        kind: ComputeContextKind.Update,
        node,
      });
    }
  }

  // TODO: think about the argument... maybe we should check this is what was
  // popped?
  noteEndedDerivedUpdate(_node: DerivedNode<unknown>) {
    if (this.update) {
      this.computeStack.pop();
    }
  }

  // Update a signal every time the async iter gets a new item.
  async pipeFromAsyncIter<T>(iter: AsyncIterable<T>, signal: SetableSignal<T>) {
    for await (const i of iter) {
      signal.set(i);
    }
  }

  // Every update to the signal becomes an item in the async iterable.
  // CONSIDER: T must not be undefined?
  async *toIter<T>(s: SetableSignal<T> | DerivedSignal<T>): AsyncIterable<T> {
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

// ----------------------------------------------------------------------------
// Raw functions (CONSIDER moving into the space class)
// ----------------------------------------------------------------------------
// Note: we use the type-safe way to define the return value; as far as I know
// this is the only way to do so in typescript; although it is more implicit than I would like.
function setable<T>(
  space: SignalSpace,
  value: T,
  options?: Partial<SetableOptions<T>>,
): SetableSignal<T> {
  const valueNode = new SetableNode(space, value, options);
  const signal = function (options?: Partial<SignalDepOptions>) {
    return valueNode.get(options);
  };
  // TODO: would be better if this was not a function...
  signal.lastValue = () => valueNode.value;
  signal.set = (value: T, options?: SignalSetOptions) => valueNode.set(value, options);
  signal.update = (f: (v: T) => T, options?: SignalSetOptions) => valueNode.update(f, options);
  signal.change = (f: (v: T) => void) => valueNode.change(f);
  signal.space = space;
  signal.node = valueNode;
  signal.options = options;
  return signal;
}

// A conenience type for specifying DerivedNodeOptions<T>.
export type DerivedOptions<T> = {
  eqCheck: (x: T, y: T) => boolean;
  id: string;
  deps: AbstractSignal<any>[];
  lazyDeps: AbstractSignal<any>[];
};

// A conenience type for specifying DerivedNodeOptions<T>.
export type DerivedNullableOptions<T> = {
  eqCheck: (x: T, y: T) => boolean;
  id: string;
  deps: AbstractSignal<any>[];
  lazyDeps: AbstractSignal<any>[];
  definedDeps: AbstractSignal<any>[];
  definedLazyDeps: AbstractSignal<any>[];
};

function makeDerivedNodeOptions<T>(
  opts?: Partial<DerivedNullableOptions<T>>,
): Partial<DerivedNodeOptions<T>> | undefined {
  if (!opts) return;
  const preComputeDeps = new Map<AbstractSignal<any>, SignalDepOptions>();
  for (const dep of opts.lazyDeps || []) {
    preComputeDeps.set(dep, { depKind: DepKind.Lazy, downstreamNullIfNull: false });
  }
  for (const dep of opts.definedLazyDeps || []) {
    preComputeDeps.set(dep, { depKind: DepKind.Lazy, downstreamNullIfNull: true });
  }
  for (const dep of opts.deps || []) {
    preComputeDeps.set(dep, { depKind: DepKind.Sync, downstreamNullIfNull: false });
  }
  for (const dep of opts.definedDeps || []) {
    preComputeDeps.set(dep, { depKind: DepKind.Sync, downstreamNullIfNull: true });
  }
  const options: Partial<DerivedNodeOptions<T>> = { preComputeDeps };
  // Note: because we use  { ...defaultOptions, ...options } to set the options,
  // we must not have any fields that are set to undefined (these fields should
  // simply not exist).
  if (opts.id) {
    options.id = opts.id;
  }
  if (opts.eqCheck) {
    options.eqCheck = opts.eqCheck;
  }
  return options;
}

function makeDerivedNodeNullableOptions<T>(
  opts?: Partial<DerivedNullableOptions<T>>,
): Partial<DerivedNodeOptions<T | null>> | undefined {
  const nodeOptions = makeDerivedNodeOptions(opts);
  const definedEqCheck = nodeOptions && nodeOptions.eqCheck;
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
  let nullableOptions: Partial<DerivedNodeOptions<T | null>> = {
    ...nodeOptions,
    eqCheck,
    nullTyped: true,
  };
  // Avoid having undefined eqCheck entries.
  if (!eqCheck) {
    delete nullableOptions.eqCheck;
  }
  return nullableOptions;
}

function derivedNodeFn<T>(
  space: SignalSpace,
  f: () => T,
  nodeOptions?: Partial<DerivedNodeOptions<T>>,
): DerivedSignal<T> {
  const derivedNode = new DerivedNode<T>(space, f, nodeOptions);
  const signal = function (getOptions?: Partial<SignalDepOptions>) {
    return derivedNode.get(getOptions);
  };
  signal.node = derivedNode;
  signal.lastValue = () => derivedNode.lastValue;
  signal.space = space;
  signal.options = nodeOptions;
  return signal;
}

function derived<T>(
  space: SignalSpace,
  f: () => T,
  options?: Partial<DerivedOptions<T>>,
): DerivedSignal<T> {
  const nodeOptions = makeDerivedNodeOptions(options as DerivedNullableOptions<T>);
  return derivedNodeFn(space, f, nodeOptions);
}

// A special case that allows for `nullme` operators on sub-signals to handle the null cases.
function derivedNullable<T>(
  space: SignalSpace,
  f: () => T | null,
  options?: Partial<DerivedOptions<T>>,
): DerivedSignal<T | null> {
  const nodeOptions = makeDerivedNodeNullableOptions(options) || {};
  return derivedNodeFn(space, f, nodeOptions);
}

// The key characteristic of effects is that they get updated per "set" of a
// child. Computed signals have the option to only re-compute once per tick,
// however many "set" calls of children happen.
function derivedLazy<T>(
  space: SignalSpace,
  f: () => T,
  options?: Partial<DerivedOptions<T>>,
): DerivedSignal<T> {
  const nodeOptions = makeDerivedNodeOptions(options) || {};
  nodeOptions.kind = SignalKind.LazyDerived;
  return derivedNodeFn(space, f, nodeOptions);
}

// The key characteristic of effects is that they get updated per "set" of a
// child. Computed signals have the option to only re-compute once per tick,
// however many "set" calls of children happen.
function derivedLazyNullable<T>(
  space: SignalSpace,
  f: () => T | null,
  options?: Partial<DerivedOptions<T>>,
): DerivedSignal<T | null> {
  const nodeOptions = makeDerivedNodeNullableOptions(options) || {};
  nodeOptions.kind = SignalKind.LazyDerived;
  // options = { ...options, kind: SignalKind.LazyDerived };
  return derivedNodeFn(space, f, nodeOptions);
}

// ----------------------------------------------------------------------------
// Utilities...
// ----------------------------------------------------------------------------
// 'defined' is an operator to wrap calls to sub-signals that should only be
// used within derivedNullable signals. It will cause the parent derived signal
// to be null when this signal is null. i.e. you can say only when this is
// defined do we do this computation.
//
// This approach does not work when `s` is a setable signal (and there is not
// special compute function for it in the derived computation chain... it might
// be possible to make it work by also modifying setable nodes...)

export function defined<T>(s: AbstractSignal<T | null>, depEvalKind?: DepKind): T {
  // Note: this is a lie; but the contextualCompute computation will make up
  // for it, and not actually depend on s's Result being nonNull, so all is
  // ok.
  return s({ downstreamNullIfNull: true, depKind: depEvalKind || DepKind.Sync }) as T;
}

// The forked value gets updated whenever 's' is updated, but you can also
// change it (but your value will get changed whenever s does too).
export function writableFork<T>(
  s: AbstractSignal<T>,
  options?: Partial<SetableOptions<T>>,
): SetableSignal<T> {
  if (s.node instanceof SetableNode) {
    options = { ...structuredClone(s.node.options), ...options };
  }
  const fork = s.space.setable(s(), options);
  s.space.derived(() => fork.set(s()));
  return fork;
}

// A convenient way to track updates to a signal...
export function promisifySignal<T>(
  s: AbstractSignal<T>,
): DerivedSignal<{ cur: T; next: Promise<T>; rejectFn: () => void }> {
  let resolveFn: (v: T) => void = () => {};
  let rejectFn: () => void = () => {};

  const nextFn = () =>
    new Promise<T>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

  const promisifiedSignal = s.space.derived(() => {
    const cur = s();
    resolveFn(cur);
    return { cur, next: nextFn(), rejectFn };
  });

  return promisifiedSignal;
}

// A convenient way to track updates to a signal...
export function asyncSignalIter<T>(
  s: AbstractSignal<T>,
): AsyncIterator<T> & AsyncIterable<T> & { done: () => void } {
  let stopped = false;
  let nextIsWaiting = false;
  const queue: T[] = [];

  let resolveFn: (v: IteratorResult<T, null>) => void;
  const nextFn = () =>
    new Promise<IteratorResult<T, null>>((resolve) => {
      resolveFn = resolve;
    });
  let nextResult = nextFn();

  const derivedPromiseUpdate = s.space.derived(() => {
    if (!stopped) {
      const cur = s();
      if (nextIsWaiting) {
        resolveFn({ value: cur });
      } else {
        queue.push(cur);
      }
    } else {
      // TODO: dispose of the derived signal value?
    }
  });

  let stopper = () => {
    stopped = true;
    if (nextIsWaiting) {
      resolveFn({ done: true, value: null });
    }
    derivedPromiseUpdate.node.dispose();
  };

  const myIterator = {
    async next(): Promise<IteratorResult<T>> {
      const queuedValue = queue.shift();
      if (queuedValue) {
        return { value: queuedValue };
      }
      if (stopped) {
        return { done: true, value: null };
      } else {
        nextIsWaiting = true;
        nextResult = nextFn();
        const result = await nextResult;
        nextIsWaiting = false;
        return result;
      }
    },
    done: stopper,
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return myIterator;
}

export function asyncIterToSignal<T>(
  iter: AsyncIterable<T>,
  space: SignalSpace,
): { onceDone: Promise<void>; onceSignal: Promise<AbstractSignal<T>> } {
  let resolveDoneFn: () => void;
  const onceDone = new Promise<void>((resolve) => {
    resolveDoneFn = resolve;
  });
  let resolveSignalFn: (signal: SetableSignal<T>) => void;
  let rejectSignalFn: () => void;
  const onceSignal = new Promise<SetableSignal<T>>((resolve, reject) => {
    resolveSignalFn = resolve;
    rejectSignalFn = reject;
  });
  setTimeout(async () => {
    let signal: SetableSignal<T> | undefined;
    for await (const i of iter) {
      if (!signal) {
        signal = space.setable<T>(i);
        resolveSignalFn(signal);
      } else {
        signal.set(i);
      }
    }
    resolveDoneFn();
    if (!signal) {
      rejectSignalFn();
    }
  }, 0);
  return { onceDone, onceSignal };
}
