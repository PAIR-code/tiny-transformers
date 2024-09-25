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
 */

export interface AbstractSignal<T> {
  // The get signal's get value function. If this is a derived signal that
  // needs updating, it will compute the updated value.
  (options?: SignalGetOptions): T;
  space: SignalSpace;
  // The last value the signal had (doesn't compute updates, even if
  // the signal needs updating).
  lastValue(): T;
  options?: Partial<AbstractOptions<T>>;
}

export interface SetableSignal<T> extends AbstractSignal<T> {
  kind: 'setable';
  // Sets the value of the signal.
  set(newValue: T, options?: SignalSetOptions): void;
  update(f: (oldValue: T) => T, options?: SignalSetOptions): void;
  // rawComputation: ComputedSignal<T>;
  node: SetableNode<T>;
  options?: Partial<SetableOptions<T>>;
}

export interface DerivedSignal<T> extends AbstractSignal<T> {
  kind: 'derived';
  node: DerivedNode<T>;
  options?: Partial<DerivedOptions<T>>;
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

export class SignalSpace {
  updateCounts = 0;
  // Stack of actively being defined computation signals;
  // a "get()" call is assumed to be in the last entry here.
  // e.g. c = makeComputedSignal(() => ... x.get())
  // means that c depends on the value of x. So:
  //  computeGraph.get(x).depOnKey.has(x)
  public computeStack: DerivedNode<unknown>[] = [];

  public signalSet: Set<SomeNode> = new Set();

  // Set for the time between a value has been updated, and
  // when the update all effects has been completed.
  public update?: SignalSpaceUpdate;

  constructor() {}

  maybeContextualComputeSignal(): DerivedNode<unknown> | null {
    return this.computeStack.length > 0 ? this.computeStack[this.computeStack.length - 1] : null;
  }

  makeSignal<T>(value: T, options?: Partial<SetableOptions<T>>): SetableNode<T> {
    const s = new SetableNode(this, value, options);
    return s;
  }

  makeDerivedNode<T>(f: () => T, options?: Partial<DerivedOptions<T>>): DerivedNode<T> {
    const thisComputeSignal = new DerivedNode<T>(this, f, options);
    return thisComputeSignal;
  }

  // makeNullableComputedSignal<T>(
  //   f: () => T | null,
  //   options?: Partial<DerivedOptions<T | null>>
  // ): DerivedSignal<T | null> {
  //   options = options || {};
  //   options.nullable = true;
  //   const thisComputeSignal = new DerivedSignal<T | null>(this, f, options);
  //   return thisComputeSignal;
  // }

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
    this.effect(() => {
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

  writable<T>(defaultValue: T, valueOptions?: Partial<SetableOptions<T>>): SetableSignal<T> {
    return setable(this, defaultValue, valueOptions);
  }
  computable<T>(f: () => T, options?: DerivedOptions<T>): DerivedSignal<T> {
    return derived(this, f, options);
  }
  nullComputable<T>(f: () => T | null, options?: DerivedOptions<T>): DerivedSignal<T | null> {
    return nullDerived(this, f, options);
  }
  effect<T>(f: () => T, options?: DerivedOptions<T>): DerivedSignal<T> {
    return alwaysDerived(this, f, options);
  }

  writableFork<T>(s: AbstractSignal<T>): SetableSignal<T> {
    const fork = this.writable(s(), s.options);
    this.effect(() => fork.set(s()));
    return fork;
  }

  nullme<T>(s: AbstractSignal<T | null>): T {
    const contextualCompute = this.maybeContextualComputeSignal();
    if (!contextualCompute || !contextualCompute.nullTyped) {
      throw Error('nullme is only defined within a derived signal.');
    }
    const sResult = s();
    if (sResult === null || sResult === undefined) {
      contextualCompute.nullOnNullChild = true;
      // Note: this is a lie; but the contextualCompute computation will make up
      // for it, and not actually depend on sResult being nonNull, so all is ok.
      return sResult as T;
    } else {
      return sResult;
    }
  }
}

export type SignalSetOptions = {
  withoutUpdating: boolean; // default false;
};

export type SignalGetOptions = {
  // CONSIDER: change this to the positive version: tracked, and default true.
  untracked: boolean; // default false;
};

export type AbstractOptions<T> = {
  eqCheck: (x: T, y: T) => boolean;
};

export type DerivedOptions<T> = AbstractOptions<T> & {
  // When something is an effect, it gets updated every time it needs it be
  // updated in the next tick. And otherwise, values are updated only when
  // the corresponding s.get() method is called.
  isEffect: boolean; // default false;
  // TODO: add clobberBehavior here too. Useful is you have a alwaysUpdate that
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

function defaultComputeOptions<T>(): DerivedOptions<T> {
  return {
    isEffect: false,
    eqCheck: defaultEqCheck,
  };
}

function defaultValueOptions<T>(): SetableOptions<T> {
  return {
    eqCheck: defaultEqCheck,
    clobberBehvaior: 'alwaysUpdate',
  };
}

export class SetableNode<T> {
  // All these derived signal nodes in the SignalSpace, `c` have a `c.get(this)`
  // somewhere in them.
  dependsOnMeCompute = new Set<DerivedNode<unknown>>();
  dependsOnMeEffects = new Set<DerivedNode<unknown>>();
  lastUpdate?: SignalSpaceUpdate;
  kind = 'valueSignal';
  options: SetableOptions<T>;

  constructor(
    public signalSpace: SignalSpace,
    public value: T,
    options?: Partial<SetableOptions<T>>
  ) {
    this.options = { ...defaultValueOptions(), ...options };
    signalSpace.signalSet.add(this as SetableNode<unknown>);
  }

  get(options?: SignalGetOptions): T {
    // Set when we are in the process of defining a new derived siganl.
    if (!options || !options.untracked) {
      const contextualCompute = this.signalSpace.maybeContextualComputeSignal();
      if (contextualCompute) {
        if (contextualCompute.options.isEffect) {
          this.dependsOnMeEffects.add(contextualCompute);
        } else {
          this.dependsOnMeCompute.add(contextualCompute);
        }
        contextualCompute.dependsOnValues.add(this as SetableNode<unknown>);
      }
    }
    return this.value;
  }

  shouldCauseUpdates(setOptions?: SignalSetOptions) {
    return (
      (this.dependsOnMeEffects.size > 0 || this.dependsOnMeCompute.size > 0) &&
      (!setOptions || (setOptions && !setOptions.withoutUpdating))
    );
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
    if (this.options.eqCheck(this.value, v)) {
      return;
    }
    if (this.shouldCauseUpdates(setOptions)) {
      if (this.errorForLoopySet(v)) {
        return;
      }
      // If we try and set an already set value, we have to update all effects
      // before we set the new value.
      if (
        (this.options.clobberBehvaior === 'alwaysUpdate',
        this.dependsOnMeEffects.size > 0 &&
          this.signalSpace.update &&
          this.signalSpace.update.valuesUpdated.has(this as SetableNode<unknown>))
      ) {
        this.signalSpace.updatePendingEffects();
      }
      this.value = v;
      this.signalSpace.noteUpdate(this as SetableNode<unknown>);
      this.lastUpdate = this.signalSpace.update;
    }
  }
}

export class DerivedNode<T> {
  kind = 'computedSignal';
  updateNeeded?: SignalSpaceUpdate;
  lastUpdate?: SignalSpaceUpdate;
  lastUpdateChangedValue = true;
  // TODO: use this to check if any child dep changed,
  // and thus this needs recomputation.
  dependsOnMe = new Set<DerivedNode<unknown>>();
  dependsOnComputing = new Set<DerivedNode<unknown>>();
  dependsOnValues = new Set<SetableNode<unknown>>();
  // When true, the type T must be = S | null (null must extend T) this value is
  // null if any dependency is wrapped in a `nullme`, and the child dep is null.
  //
  // CONSIDER: we could make special creation function that types as never if T
  // doesn't extend null, but this is true...
  nullTyped = false;
  // should only be possible to true when nullTyped is true.
  nullOnNullChild = false;
  lastValue: T;
  options: DerivedOptions<T>;

  constructor(
    public signalSpace: SignalSpace,
    public computeFunction: () => T,
    options?: Partial<DerivedOptions<T>>
  ) {
    this.options = Object.assign(defaultComputeOptions(), options || {});

    signalSpace.signalSet.add(this as DerivedNode<unknown>);
    this.signalSpace.computeStack.push(this as DerivedNode<unknown>);
    // Note: this.lastValue should be set last, because...
    // Within the `computeFunction()` call, we expect other siganls, s,
    // to be called with s.get(), and these will add all
    this.lastValue = computeFunction();
    this.signalSpace.computeStack.pop();
  }

  someDependencyChanged(): boolean {
    let someComputeDepChanged = false;
    for (const dep of this.dependsOnComputing) {
      if (dep.updateNeeded !== dep.lastUpdate) {
        dep.updateValue();
        someComputeDepChanged = someComputeDepChanged || dep.lastUpdateChangedValue;
        if (this.nullOnNullChild) {
          break;
        }
      }
    }
    if (someComputeDepChanged) {
      return true;
    }
    for (const valueDep of this.dependsOnValues) {
      if (valueDep.lastUpdate === this.updateNeeded) {
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
    this.lastUpdate = this.updateNeeded || this.lastUpdate;
    if (this.someDependencyChanged()) {
      delete this.updateNeeded;
      let newValue: T;
      if (this.nullOnNullChild) {
        // This is a lie that has to be caught at runtime by the `nullme`
        // operator only being applicable when working within a computation that
        // may be null.
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
    this.nullOnNullChild = false;
  }

  get(options?: SignalGetOptions): T {
    if (!options || !options.untracked) {
      // Set when we are in the process of defining a new computed siganl.
      const computeDependee = this.signalSpace.maybeContextualComputeSignal();
      if (computeDependee) {
        computeDependee.dependsOnComputing.add(this as DerivedNode<unknown>);
        this.dependsOnMe.add(computeDependee);
        for (const dep of this.dependsOnValues) {
          computeDependee.dependsOnValues.add(dep);
          if (computeDependee.options.isEffect) {
            dep.dependsOnMeEffects.add(computeDependee);
          } else {
            dep.dependsOnMeCompute.add(computeDependee);
          }
        }
      }
    }
    if (this.updateNeeded !== this.lastUpdate) {
      this.updateValue();
    }
    return this.lastValue;
  }
}

export type SomeNode = DerivedNode<unknown> | SetableNode<unknown>;

// Note: we use the type-safe way to define the return value; as far as I know
// this is the only way to do so in typescript; although it is more implicit than I would like.
export function setable<T>(
  space: SignalSpace,
  value: T,
  options?: Partial<SetableOptions<T>>
): SetableSignal<T> {
  const valueNode = space.makeSignal(value, options);
  const signal = function () {
    return valueNode.get();
  };
  // const foo = {...writableSignal, { lastValue: 'foo' } };
  signal.lastValue = () => valueNode.value;
  signal.set = (value: T, options?: SignalSetOptions) => valueNode.set(value, options);
  signal.update = (f: (v: T) => T, options?: SignalSetOptions) => valueNode.update(f, options);
  signal.space = space;
  signal.kind = 'setable' as const;
  signal.node = valueNode;
  signal.options = options;
  return signal;
}

export function derived<T>(
  space: SignalSpace,
  f: () => T,
  options?: Partial<DerivedOptions<T>>
): DerivedSignal<T> {
  const derivedNode = space.makeDerivedNode(f, options);
  const signal = function () {
    return derivedNode.get();
  };
  signal.node = derivedNode;
  signal.lastValue = () => derivedNode.lastValue;
  signal.space = space;
  signal.kind = 'derived' as const;
  signal.options = options;
  return signal;
}

// A special case that allows for `nullme` operators on sub-signals to handle the null cases.
export function nullDerived<T>(
  space: SignalSpace,
  f: () => T | null,
  options?: Partial<DerivedOptions<T>>
): DerivedSignal<T | null> {
  const eqCheck = options && options.eqCheck;
  let nullableEqCheckOptions: Partial<DerivedOptions<T | null>> = {};
  if (eqCheck) {
    nullableEqCheckOptions = {
      ...options,
      eqCheck: (a, b) => {
        if (a !== null && b !== null) {
          return eqCheck(a, b);
        } else if (a === null && b === null) {
          return true;
        } else {
          return false;
        }
      },
    };
  }
  const derivedNode = space.makeDerivedNode(f, nullableEqCheckOptions);
  derivedNode.nullTyped = true;
  // Note: in pure JS we could write `const signal = derivedSignal.get` But for
  // typescript to do correct incremental type inference, we use the identity
  // function wrapper.
  const signal = function () {
    return derivedNode.get();
  };
  signal.node = derivedNode;
  signal.lastValue = () => derivedNode.lastValue;
  signal.space = space;
  signal.kind = 'derived' as const;
  signal.options = nullableEqCheckOptions;
  return signal;
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
