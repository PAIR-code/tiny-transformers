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

/**
 * This is a special opinionated take on Signals, inspired by Angular's
 * implementation, but also a little different. Consider:
 *
 * ```
 * const s = setable(() => ...)
 * const c = derived(() =>  ... s() ...)
 * const e = effect(() => ... s() ...)
 * ```
 *
 * `c` will get updated lazily, i.e. whenever c() or c.get() is called). `e`
 * will be updated eagerly, every time there's any updates to any signals that e
 * depends on, e.g. whenever s.set(...) is called.
 *
 * Cool thing: It's fine to call `s.set` in a derived signal or effect, but if
 * you create a cycle, only one pass through the cycle will happen, and you'll
 * get a JS console error with a trace. But this lets you do safe stuff easily,
 * like make set stuff that was not set before, and that will cause new signal
 * effects. Loops of `.set` are not allowed, and will be caught and produce an
 * error.
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

// ----------------------------------------------------------------------------
export interface AbstractSignal<T> {
  // The get signal's get value function. If this is a derived signal that
  // needs updating, it will compute the updated value.
  (options?: Partial<SignalGetOptions>): T;
  space: SignalSpace;
  // The last value the signal had (doesn't compute updates, even if
  // the signal needs updating).
  lastValue(): T;
  node: SetableNode<T> | DerivedNode<T>;
  // options?: Partial<AbstractOptions<T>>;
}

export interface SetableSignal<T> extends AbstractSignal<T> {
  // Sets the value of the signal.
  set(newValue: T, options?: Partial<SignalSetOptions>): void;
  update(f: (oldValue: T) => T, options?: Partial<SignalSetOptions>): void;
  node: SetableNode<T>;
}

export interface DerivedSignal<T> extends AbstractSignal<T> {
  node: DerivedNode<T>;
}

export type Signal<T> = SetableSignal<T> | DerivedSignal<T>;

// Intended to be a type for the result of setTimeout.
export type Timeout = unknown;

// Manages a single update pass through the signalspace.
type SignalSpaceUpdate = {
  // Values touched in this update.
  valuesUpdated: Set<SetableNode<unknown>>;

  // All effects touched in this update.
  effectsTouched: Set<DerivedNode<unknown>>;

  // Effects left to actually compute the update of.
  pendingEffects: Set<DerivedNode<unknown>>;

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
  updateFn?: Timeout;
  counter: number;
};

// TODO: make a class for an instance of a dependency, and use that. e.g. to
// hold if a specific dependency can/should nullify the parent (if the parent
// allows it).
export class SetableDep<T> {
  constructor(public node: SetableNode<T>, public options?: Partial<SignalGetOptions>) {}
}
export class DerivedDep<T> {
  constructor(public node: DerivedNode<T>, public options?: Partial<SignalGetOptions>) {}
}

// ----------------------------------------------------------------------------
export class SignalSpace {
  updateCounts = 0;

  // True while doing an update on a signal's value...
  public computeStack: DerivedNode<unknown>[] = [];
  // Stack of actively being defined computation signals;
  // a "get()" call is assumed to be in the last entry here.
  // e.g. c = makeComputedSignal(() => ... x.get())
  // means that c depends on the value of x. So:
  //  computeGraph.get(x).depOnKey.has(x)
  public defStack: DerivedNode<unknown>[] = [];

  public signalSet: Set<DerivedNode<unknown> | SetableNode<unknown>> = new Set();

  // Set for the time between a value has been updated, and
  // when the update all effects has been completed.
  public update?: SignalSpaceUpdate;

  constructor() {}

  maybeContextualDefSignal(): DerivedNode<unknown> | null {
    return this.defStack.length > 0 ? this.defStack[this.defStack.length - 1] : null;
  }

  maybeContextualComputeSignal(): DerivedNode<unknown> | null {
    return this.computeStack.length > 0 ? this.computeStack[this.computeStack.length - 1] : null;
  }

  // Called when valueSignal's new value !== to the old value.
  //
  // IDEA: have a forward pass (the timeout) a backward pass (if you
  // call a get, look for changed valueSignal dependencies in
  // your computation).
  // This might flip dep management, and have comutation know the
  // set of all (trans closure w.r.t. compute dep) value dependencies.
  noteUpdate(valueSignal: SetableNode<unknown>, skipTimeout: boolean = false) {
    if (!this.update) {
      this.update = {
        valuesUpdated: new Set(),
        effectsTouched: new Set(),
        pendingEffects: new Set(),
        changedValueSet: new Set(),
        counter: this.updateCounts++,
      };
    }

    if (!skipTimeout) {
      this.update.updateFn = setTimeout(() => this.updatePendingEffects(), 0);
    }

    this.update.valuesUpdated.add(valueSignal);
    // Make sure that we know dependencies may need updating,
    // in case they are called in a c.get() in the same JS
    // execution stage.
    for (const dep of valueSignal.dependsOnMeCompute) {
      dep.updateNeeded = this.update;
      delete dep.lastUpdate;
      // console.log('value computeDepUpdate', {
      //   value: valueSignal.value,
      //   lastValue: dep.lastValue,
      //   mayNeedUpdate: dep.mayNeedUpdating ? this.updateCounts : 'undefined',
      // });
    }
    // We are in the updatePendingEffects...
    for (const dep of valueSignal.dependsOnMeEffects) {
      dep.updateNeeded = this.update;
      delete dep.lastUpdate;
      // console.log('value effectDepUpdate', {
      //   value: valueSignal.value,
      //   lastValue: dep.lastValue,
      //   mayNeedUpdate: dep.mayNeedUpdating ? this.updateCounts : 'undefined',
      // });
      this.update.effectsTouched.add(dep);
      this.update.pendingEffects.add(dep);
    }
  }

  updateInProgress(): this is { update: SignalSpaceUpdate } {
    return (this.update && !this.update.updateFn) || false;
  }

  updatePendingEffects() {
    if (!this.update) {
      console.error(`Should not be called with no updateInProgress.`);
      return;
    }
    // Starts the progress update...
    delete this.update.updateFn;
    while (this.update.pendingEffects.size > 0) {
      for (const currentEffect of this.update.pendingEffects) {
        if (currentEffect.updateNeeded !== currentEffect.lastUpdate) {
          currentEffect.updateValue();
        }
        this.update.pendingEffects.delete(currentEffect);
      }
    }
    delete this.update;
  }

  async pipeFromAsyncIter<T>(iter: AsyncIterable<T>, signal: SetableSignal<T>) {
    for await (const i of iter) {
      signal.set(i);
      this.noteUpdate(signal.node as SetableNode<unknown>);
      this.updatePendingEffects();
    }
  }

  // TODO: T must not be undefined.
  async *toIter<T>(s: Signal<T>): AsyncIterable<T> {
    // const self = this;
    const buffer = [] as Promise<T>[];
    let resolveFn: (v: T) => void;
    let curPromise: Promise<T> = new Promise<T>((resolve) => {
      resolveFn = resolve;
    });
    this.derivedEvery(() => {
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

  // TODO: is there a nicer way to do this?
  ops() {
    return {
      setable: this.setable.bind(this),
      derived: this.derived.bind(this),
      nullDerived: this.nullDerived.bind(this),
      derivedEvery: this.derivedEvery.bind(this),
      alwaysNullDerived: this.alwaysNullDerived.bind(this),
      writableFork: this.writableFork.bind(this),
    };
  }

  // TODO: remove the level of indirection; and just inline the functions here.
  setable<T>(value: T, options?: Partial<SetableOptions<T>>): SetableSignal<T> {
    return setable(this, value, options);
  }
  derived<T>(f: () => T, options?: DerivedOptions<T>): DerivedSignal<T> {
    return derived(this, f, options);
  }
  nullDerived<T>(f: () => T | null, options?: DerivedOptions<T>): DerivedSignal<T | null> {
    return nullDerived(this, f, options);
  }
  derivedEvery<T>(f: () => T, options?: DerivedOptions<T>): DerivedSignal<T> {
    return alwaysDerived(this, f, options);
  }
  alwaysNullDerived<T>(f: () => T | null, options?: DerivedOptions<T>): DerivedSignal<T | null> {
    return alwaysNullDerived(this, f, options);
  }

  writableFork<T>(s: AbstractSignal<T>, options?: Partial<SetableOptions<T>>): SetableSignal<T> {
    if (s.node.kind === 'setable') {
      options = { ...structuredClone(s.node.options), ...options };
    }
    const fork = this.setable(s(), options);
    this.derivedEvery(() => fork.set(s()));
    return fork;
  }
}

// ----------------------------------------------------------------------------
// 'asNew' effectively forces the eqCheck to be false - as if this is the first
// ever set of the value.
//
// 'skipUpdate' treats this set as untracked, and will not trigger downstream
// dependencies.
//
// 'eqCheck' (default) will run the equality check to decide if downstream
// derived signals need to be updated.
export type SignalSetOptions = {
  updateStrategy: 'asNew' | 'skipUpdate' | 'eqCheck'; // default 'eqCheck';
};

export type SignalGetOptions = {
  // CONSIDER: change this to the positive version: tracked, and default true.
  untracked: boolean; // default false;

  // When a given derived parent is nullDerived and this is true, and the value
  // of this signal is null, then force the parent's computation to be null;
  // If true, any derivations using this signal but be nullTyped=true, AND the
  // derivation computation function using depending on this signal will only
  // be executed when this derivation results in a non-null value.

  usersAreNullIfThisIsNull: boolean;
};

export type AbstractOptions<T> = {
  eqCheck: (x: T, y: T) => boolean;
};

export type DerivedOptions<T> = AbstractOptions<T> & {
  // When something is an effect, it gets updated every time it needs it be
  // updated in the next tick. And otherwise, values are updated only when
  // the corresponding s.get() method is called.
  isEffect: boolean; // default false;

  // When true, the type `T` must be of the form `S | null` (null must extend
  // T). The idea is that the value of this derivedNode is `null` if any
  // dependency is wrapped in a `defined`, and that child dep's valuye is null.
  nullTyped: null extends T ? boolean : false;

  // CONSIDER: add clobberBehavior here too. Useful is you have a alwaysUpdate that
  // you want to merge later...
};

export type SetableOptions<T> = AbstractOptions<T> & {
  // If a value is set twice, what should the update behvaior be?
  // * 'alwaysUpdate' ==> any dependent effects and computations get called twice.
  // * 'justLatest' ==> dependent effects and computations get called once only,
  //   with the latest value.
  clobberBehvaior: 'alwaysUpdate' | 'justLatest';
};

function defaultEqCheck<T>(x: T, y: T) {
  return x === y;
}

function defaultDerivedOptions<T>(): DerivedOptions<T> {
  return {
    isEffect: false,
    nullTyped: false,
    eqCheck: defaultEqCheck,
  };
}

function defaultSetableOptions<T>(): SetableOptions<T> {
  return {
    eqCheck: defaultEqCheck,
    clobberBehvaior: 'alwaysUpdate',
  };
}

// ----------------------------------------------------------------------------
//  SetableNode
// ----------------------------------------------------------------------------
export class SetableNode<T> {
  // All these derived signal nodes in the SignalSpace, `c` have a `c.get(this)`
  // somewhere in them.
  dependsOnMeCompute = new Set<DerivedNode<unknown>>();
  dependsOnMeEffects = new Set<DerivedNode<unknown>>();
  lastUpdate?: SignalSpaceUpdate;
  kind = 'setable' as const;
  options: SetableOptions<T>;

  constructor(
    public signalSpace: SignalSpace,
    public value: T,
    options?: Partial<SetableOptions<T>>
  ) {
    this.options = { ...defaultSetableOptions(), ...options };
    signalSpace.signalSet.add(this as SetableNode<unknown>);
  }

  get(options?: Partial<SignalGetOptions>): T {
    // If this get is called in the process of defining a new derived signal.
    // (that is the first execution of a derived signal)
    if (!options || !options.untracked) {
      const contextualCompute = this.signalSpace.maybeContextualDefSignal();
      if (contextualCompute) {
        if (contextualCompute.options.isEffect) {
          this.dependsOnMeEffects.add(contextualCompute);
        } else {
          this.dependsOnMeCompute.add(contextualCompute);
        }
        if (options && options.usersAreNullIfThisIsNull && !contextualCompute.options.nullTyped) {
          console.warn(
            'setable signal with usersAreNullIfThisIsNull cannot be set within a computaton that is not nullTypes',
            contextualCompute
          );
          throw new Error(
            'setable signal with usersAreNullIfThisIsNull outside of derived nullType def'
          );
        }
        contextualCompute.dependsOnValues.add(
          new SetableDep(this as SetableNode<unknown>, options)
        );
      }
    }
    return this.value;
  }

  hasDerivedSignals() {
    return this.dependsOnMeEffects.size > 0 || this.dependsOnMeCompute.size > 0;
  }

  errorForLoopySet(v: T): boolean {
    if (
      this.signalSpace.updateInProgress() &&
      this.signalSpace.update.changedValueSet.has(this as SetableNode<unknown>)
    ) {
      console.error(
        `A cyclic value update happened in a computation:`,
        '\nvalueSignal & new value:',
        this,
        v,
        '\neffects touched:',
        this.signalSpace.update.effectsTouched
      );
      return true;
    }
    return false;
  }

  update(f: (v: T) => T, setOptions?: SignalSetOptions) {
    this.set(f(this.value), setOptions);
  }

  set(v: T, setOptions?: SignalSetOptions) {
    const updateStrategy = setOptions ? setOptions.updateStrategy : 'eqCheck';
    if (
      updateStrategy === 'skipUpdate' ||
      !this.hasDerivedSignals() ||
      (updateStrategy !== 'asNew' && this.options.eqCheck(this.value, v))
    ) {
      return;
    }
    if (this.errorForLoopySet(v)) {
      return;
    }
    // If we try and set an already set value, we have to update all effects
    // before we set the new value (and note the next update). If we didn't do
    // this, the set value would clobber the old one, and you'd only get an
    // effect for the latest set value.
    if (
      this.options.clobberBehvaior === 'alwaysUpdate' &&
      this.dependsOnMeEffects.size > 0 &&
      this.signalSpace.update &&
      this.signalSpace.update.valuesUpdated.has(this as SetableNode<unknown>)
    ) {
      this.signalSpace.updatePendingEffects();
    }
    this.value = v;
    this.signalSpace.noteUpdate(this as SetableNode<unknown>);
    this.lastUpdate = this.signalSpace.update;
  }
}

// ----------------------------------------------------------------------------
//  DerivedNode
// ----------------------------------------------------------------------------
export class DerivedNode<T> {
  kind = 'derived' as const;
  updateNeeded?: SignalSpaceUpdate;
  lastUpdate?: SignalSpaceUpdate;
  lastUpdateChangedValue = true;
  // TODO: use this to check if any child dep changed,
  // and thus this needs recomputation.
  dependsOnMe = new Set<DerivedNode<unknown>>();
  dependsOnComputing = new Set<DerivedDep<unknown>>();
  dependsOnValues = new Set<SetableDep<unknown>>();
  // // This is true when we are set to null because a child dependency is null.
  // // Should only be possible to true when `this.options.nullTyped === true`.
  setToNullDueToNullChild = false;
  lastValue: T;
  options: DerivedOptions<T>;

  constructor(
    public signalSpace: SignalSpace,
    public computeFunction: () => T,
    options?: Partial<DerivedOptions<T>>
  ) {
    this.options = Object.assign(defaultDerivedOptions(), options || {});

    signalSpace.signalSet.add(this as DerivedNode<unknown>);
    this.signalSpace.defStack.push(this as DerivedNode<unknown>);
    // Note: this.lastValue should be set last, because...
    // Within the `computeFunction()` call, we expect other siganls, s,
    // to be called with s.get(), and these will add all
    this.lastValue = computeFunction();
    this.signalSpace.defStack.pop();
  }

  someDependencyChanged(): boolean {
    let someComputeDepChanged = false;
    for (const dep of this.dependsOnComputing) {
      if (dep.node.updateNeeded !== dep.node.lastUpdate) {
        dep.node.updateValue();
        someComputeDepChanged = someComputeDepChanged || dep.node.lastUpdateChangedValue;
        if (
          // this.setToNullDueToNullChild ||
          dep.options &&
          dep.options.usersAreNullIfThisIsNull &&
          this.options.nullTyped && // Should be true by construction, remove?
          dep.node.lastValue === null
        ) {
          this.setToNullDueToNullChild = true;
          return true;
        }
      }
    }
    if (someComputeDepChanged) {
      return true;
    }
    for (const valueDep of this.dependsOnValues) {
      if (
        valueDep.options &&
        valueDep.options.usersAreNullIfThisIsNull &&
        valueDep.node.value === null
      ) {
        this.setToNullDueToNullChild = true;
        return true;
      }
      if (valueDep.node.lastUpdate === this.updateNeeded) {
        return true;
      }
    }
    return false;
  }

  // Assumed to only be called when `this.needsUpdating === true`
  // Meaning that some value under one of the `this.dependsOnComputing`
  // (and maybe sub this.dependsOnValues was changed.)
  //
  // Return true when the value changed.
  updateValue() {
    // console.log('compute.update: ', {
    //   lastValue: this.lastValue,
    //   lastUpdate: this.lastUpdate ? this.lastUpdate.counter : 'undef',
    //   mayNeedUpdating: this.updateNeeded ? this.updateNeeded.counter : 'undef',
    // });
    this.signalSpace.computeStack.push(this as DerivedNode<unknown>);
    this.lastUpdate = this.updateNeeded || this.lastUpdate;
    if (this.someDependencyChanged()) {
      delete this.updateNeeded;
      let newValue: T;

      if (this.setToNullDueToNullChild) {
        // This is a lie that has to be caught at runtime by the `defined`
        // operator only being applicable when working within a computation that
        // may be null; it is checked in the node get functions.
        newValue = null as T;
      } else {
        newValue = this.computeFunction();
      }
      if (this.options.eqCheck(this.lastValue, newValue)) {
        this.lastUpdateChangedValue = false;
      } else {
        this.lastUpdateChangedValue = true;
        this.lastValue = newValue;
      }
    } else {
      delete this.updateNeeded;
      this.lastUpdateChangedValue = false;
    }
    // Reset the possibility that a child is null, and wants me to be null
    // because of it.
    this.setToNullDueToNullChild = false;
    this.signalSpace.computeStack.pop();
  }

  get(options?: Partial<SignalGetOptions>): T {
    if (!options || !options.untracked) {
      // Set when we are in the process of defining a new computed siganl.
      const contextualCompute = this.signalSpace.maybeContextualDefSignal();
      if (contextualCompute) {
        contextualCompute.dependsOnComputing.add(
          new DerivedDep(this as DerivedNode<unknown>, options)
        );
        this.dependsOnMe.add(contextualCompute);
        for (const dep of this.dependsOnValues) {
          contextualCompute.dependsOnValues.add(dep);
          if (contextualCompute.options.isEffect) {
            dep.node.dependsOnMeEffects.add(contextualCompute);
          } else {
            dep.node.dependsOnMeCompute.add(contextualCompute);
          }
        }
        if (options && options.usersAreNullIfThisIsNull && !contextualCompute.options.nullTyped) {
          console.warn(
            'setable signal with usersAreNullIfThisIsNull cannot be set within a computaton that is not nullTypes',
            contextualCompute
          );
          throw new Error(
            'setable signal with usersAreNullIfThisIsNull outside of derived nullType def'
          );
        }
      }
    }
    if (this.updateNeeded !== this.lastUpdate) {
      this.updateValue();
    }
    return this.lastValue;
  }
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
  const signal = function (options?: Partial<SignalGetOptions>) {
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
  const signal = function (options?: Partial<SignalGetOptions>) {
    return derivedNode.get(options);
  };
  signal.node = derivedNode;
  signal.lastValue = () => derivedNode.lastValue;
  signal.space = space;
  signal.options = options;
  return signal;
}

// A special case that allows for `nullme` operators on sub-signals to handle the null cases.
export function nullDerived<T>(
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
  const signal = function (options?: Partial<SignalGetOptions>) {
    return derivedNode.get(options);
  };
  signal.node = derivedNode;
  signal.lastValue = () => derivedNode.lastValue;
  signal.space = space;
  return signal;
}

// // // A special case that allows for `nullme` operators on sub-signals to handle the null cases.
// export function alwaysDefined<T>(
//   s: AbstractSignal<T | null>,
//   options?: Partial<DerivedOptions<T>>
// ): DerivedSignal<T> {
//   options = { ...options, usersAreNullIfThisIsNull: true };
//   const derivedNode = new DerivedNode<T>(s.space, s as () => T, options);
//   // Note: in pure JS we could write `const signal = derivedSignal.get` But for
//   // typescript to do correct incremental type inference, we use the identity
//   // function wrapper.
//   const signal = function () {
//     const parentSignal =
//       s.space.maybeContextualDefSignal() || s.space.maybeContextualComputeSignal();
//     if (!parentSignal || !parentSignal.options.nullTyped) {
//       console.warn('parentSignal:', parentSignal);
//       throw Error(`An 'alwaysDefined' signal, can only be used in a 'nullDerived' signal.`);
//     }
//     return derivedNode.get();
//   };
//   signal.node = derivedNode;
//   signal.lastValue = () => derivedNode.lastValue;
//   signal.space = s.space;
//   return signal;
// }

// ----------------------------------------------------------------------------
// This is an operator to wrap calls to sub-signals that should only be used
// within nullDerived signals. It will cause the parent derived signal to be
// null when this signal is null. i.e. you can say only when this is defined
// do we do this computation.
//
// This approach does not work when `s` is a setable signal (and there is not
// special compute function for it in the derived computation chain... it
// might be possible to make it work by also modifying setable nodes...)

// TODO: make it take regular options with `usersAreNullIfThisIsNull` removed?
export function defined<T>(s: AbstractSignal<T | null>, untracked?: boolean): T {
  // Note: this is a lie; but the contextualCompute computation will make up
  // for it, and not actually depend on sResult being nonNull, so all is
  // ok.
  return s({ usersAreNullIfThisIsNull: true, untracked: untracked || false }) as T;

  // const parentSignal = this.maybeContextualDefSignal() || this.maybeContextualComputeSignal();
  // if (!parentSignal || !parentSignal.options.nullTyped) {
  //   console.warn('parentSignal:', parentSignal);
  //   throw Error(`The 'defined' operator is only defined within a 'nullDerived' signal.`);
  // }

  // const sResult = s({ usersAreNullIfThisIsNull: true, untracked: untracked || false });
  // if (sResult === null || sResult === undefined) {
  //   parentSignal.setToNullDueToNullChild = true;
  //   // Note: this is a lie; but the contextualCompute computation will make up
  //   // for it, and not actually depend on sResult being nonNull, so all is
  //   // ok.
  //   return sResult as T;
  // } else {
  //   return sResult;
  // }
}

// The key characteristic of effects is that they get updated per "set" of a
// child. Computed signals have the option to only re-compute once per tick,
// however many "set" calls of children happen.
export function alwaysDerived<T>(
  space: SignalSpace,
  f: () => T,
  options?: Partial<DerivedOptions<T>>
): DerivedSignal<T> {
  return derived(space, f, Object.assign({ ...options, isEffect: true }));
}

// The key characteristic of effects is that they get updated per "set" of a
// child. Computed signals have the option to only re-compute once per tick,
// however many "set" calls of children happen.
export function alwaysNullDerived<T>(
  space: SignalSpace,
  f: () => T | null,
  options?: Partial<DerivedOptions<T>>
): DerivedSignal<T | null> {
  return nullDerived(space, f, Object.assign({ ...options, isEffect: true }));
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
