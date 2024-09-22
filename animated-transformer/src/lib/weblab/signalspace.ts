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
 * const s = signal(() => ...)
 * const c = compute(() =>  ... s() ...)
 * const e = effect(() => ... s() ...)
 *
 * `c` will get updated lazily, i.e. whenever c() or c.get() is called).
 * `e` will be updated eagerly, every time there's any updates to
 * any signals that e depends on, e.g. whenever s.set(...) is called.
 *
 * Cool thing: It's fine to call s.set in a compute or effect, but if you create a cycle,
 * only one pass through the cycle will happen, and you'll get a JS console
 * error with a trace. But this lets you do safe stuff easily, like make set stuff that
 * was not set before, and that will cause new signal effects. Loops of .set are not allowed,
 * And will be caught and produce an error.
 *
 * TODO: think about if this guarentees termination since there is a
 * finite set of dependee signals in any given update call (existing effects can't change
 * the set of things they depend on)...
 * (CONSIDER proof: what about effects that create new signals, and those new signals
 * trigger new effects - they can't trigger old effects because those old effects are
 * already defined.)
 *
 * CONSIDER: ideally, it would be nice to track dependencies in the type system...
 *
 * TODO: Make explicit the notion of a set of updates, and when they are triggered.
 * e.g. updateCachedValue(...) should not directly trigger. Where emit(...) should.
 */

export interface AbstractSignal<T> {
  // The get signal value function. If this is a computed signal that
  // needs updating, it will compute the updated value.
  (options?: SignalGetOptions): T;
  space: SignalSpace;
  // The last value the signal had (doesn't compute updates, even if
  // the signal needs updating).
  lastValue(): T;
}

export interface WritableSignal<T> extends AbstractSignal<T> {
  kind: 'value';
  // Sets the value of the signal.
  set(newValue: T, options?: SignalSetOptions): void;
  update(f: (oldValue: T) => T, options?: SignalSetOptions): void;
  // rawComputation: ComputedSignal<T>;
  rawValue: ValueSignal<T>;
}

export interface ComputedSignal<T> extends AbstractSignal<T> {
  kind: 'computed';
  rawComputation: DerivedSignal<T>;
}

export type Signal<T> = WritableSignal<T> | ComputedSignal<T>;

// Intended to be a type for the result of setTimeout.
export type Timeout = unknown;

// Manages a single update pass through the signalspace.
type SignalSpaceUpdate = {
  // Values touched in this update.
  valuesUpdated: Set<ValueSignal<unknown>>;
  // All effects touched in this update.
  effectsTouched: Set<DerivedSignal<unknown>>;
  // Effects left to actually compute the update of.
  pendingEffects: Set<DerivedSignal<unknown>>;
  // The set of values updated from computations.
  // Used to avoid computation loops.
  //
  // A compute chain should never update the same value
  // more than once, otherwise there may be a loop.
  //
  // TODO: This could be smarter: the same compute never updates
  // the same value more than once.
  computedValuesChanges: Set<ValueSignal<unknown>>;
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
  public computeStack: DerivedSignal<unknown>[] = [];

  public signalSet: Set<SomeSignal> = new Set();

  // Set for the time between a value has been updated, and
  // when the update all effects has been completed.
  public update?: SignalSpaceUpdate;

  constructor() {}

  maybeDependeeComputeSignal(): DerivedSignal<unknown> | null {
    return this.computeStack.length > 0 ? this.computeStack[this.computeStack.length - 1] : null;
  }

  makeSignal<T>(value: T, options?: Partial<ValueOptions<T>>): ValueSignal<T> {
    const s = new ValueSignal(this, value, options);
    return s;
  }

  makeComputedSignal<T>(f: () => T, options?: Partial<ComputeOptions<T>>): DerivedSignal<T> {
    const thisComputeSignal = new DerivedSignal<T>(this, f, options);
    return thisComputeSignal;
  }

  // Called when valueSignal's new value !== to the old value.
  //
  // IDEA: have a forward pass (the timeout) a backward pass (if you
  // call a get, look for changed valueSignal dependencies in
  // your computation).
  // This might flip dep management, and have comutation know the
  // set of all (trans closure w.r.t. compute dep) value dependencies.
  noteUpdate(valueSignal: ValueSignal<unknown>, skipTimeout: boolean = false) {
    if (!this.update) {
      this.update = {
        valuesUpdated: new Set(),
        effectsTouched: new Set(),
        pendingEffects: new Set(),
        computedValuesChanges: new Set(),
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

  async pipeFromAsyncIter<T>(iter: AsyncIterable<T>, signal: WritableSignal<T>) {
    for await (const i of iter) {
      signal.set(i);
      this.noteUpdate(signal.rawValue as ValueSignal<unknown>);
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

  writable<T>(defaultValue: T, valueOptions?: Partial<ValueOptions<T>>): WritableSignal<T> {
    return writable(this, defaultValue, valueOptions);
  }
  computed<T>(f: () => T, options?: ComputeOptions<T>): ComputedSignal<T> {
    return computed(this, f, options);
  }
  effect<T>(f: () => T, options?: ComputeOptions<T>): ComputedSignal<T> {
    return effect(this, f, options);
  }
}

export type SignalSetOptions = {
  withoutUpdating: boolean; // default false;
};

export type SignalGetOptions = {
  // CONSIDER: change this to the positive version: tracked, and default true.
  untracked: boolean; // default false;
};

export type ComputeOptions<T> = {
  // When something is an effect, it gets updated every time it needs it be
  // updated in the next tick. And otherwise, values are updated only when
  // the corresponding s.get() method is called.
  isEffect: boolean; // default false;
  eqCheck: (x: T, y: T) => boolean;
  // TODO: add clobberBehavior here too. Useful is you have a alwaysUpdate that
  // you want to merge later...
};

export type ValueOptions<T> = {
  eqCheck: (x: T, y: T) => boolean;
  // If a value is set twice, what should the update behvaior be?
  // * 'alwaysUpdate' ==> any dependent effects and computations get called twice.
  // * 'justLatest' ==> dependent effects and computations get called once only,
  //   with the latest value.
  clobberBehvaior: 'alwaysUpdate' | 'justLatest';
};

function defaultEqCheck<T>(x: T, y: T) {
  return x === y;
}

function defaultComputeOptions<T>(): ComputeOptions<T> {
  return {
    isEffect: false,
    eqCheck: defaultEqCheck,
  };
}

function defaultValueOptions<T>(): ValueOptions<T> {
  return {
    eqCheck: defaultEqCheck,
    clobberBehvaior: 'alwaysUpdate',
  };
}

export class ValueSignal<T> {
  // All these computed signals in the SignalSpace, `c` have a `c.get(this)`.
  dependsOnMeCompute = new Set<DerivedSignal<unknown>>();
  dependsOnMeEffects = new Set<DerivedSignal<unknown>>();
  lastUpdate?: SignalSpaceUpdate;
  kind = 'valueSignal';
  options: ValueOptions<T>;

  constructor(
    public signalSpace: SignalSpace,
    public value: T,
    options?: Partial<ValueOptions<T>>
  ) {
    this.options = { ...defaultValueOptions(), ...options };
    signalSpace.signalSet.add(this as ValueSignal<unknown>);
  }

  get(options?: SignalGetOptions): T {
    // Set when we are in the process of defining a new computed siganl.
    if (!options || !options.untracked) {
      const computeDependee = this.signalSpace.maybeDependeeComputeSignal();
      if (computeDependee) {
        if (computeDependee.options.isEffect) {
          this.dependsOnMeEffects.add(computeDependee);
        } else {
          this.dependsOnMeCompute.add(computeDependee);
        }
        computeDependee.dependsOnValues.add(this as ValueSignal<unknown>);
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
      this.signalSpace.update.computedValuesChanges.has(this as ValueSignal<unknown>)
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
          this.signalSpace.update.valuesUpdated.has(this as ValueSignal<unknown>))
      ) {
        this.signalSpace.updatePendingEffects();
      }
      this.value = v;
      this.signalSpace.noteUpdate(this as ValueSignal<unknown>);
      this.lastUpdate = this.signalSpace.update;
    }
  }
}

export class DerivedSignal<T> {
  kind = 'computedSignal';
  updateNeeded?: SignalSpaceUpdate;
  lastUpdate?: SignalSpaceUpdate;
  lastUpdateChangedValue = true;
  // TODO: use this to check if any child dep changed,
  // and thus this needs recomputation.
  dependsOnMe = new Set<DerivedSignal<unknown>>();
  dependsOnComputing = new Set<DerivedSignal<unknown>>();
  dependsOnValues = new Set<ValueSignal<unknown>>();
  lastValue: T;
  options: ComputeOptions<T>;

  constructor(
    public signalSpace: SignalSpace,
    public computeFunction: () => T,
    options?: Partial<ComputeOptions<T>>
  ) {
    this.options = Object.assign(defaultComputeOptions(), options || {});

    signalSpace.signalSet.add(this as DerivedSignal<unknown>);
    this.signalSpace.computeStack.push(this as DerivedSignal<unknown>);
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
      const newValue = this.computeFunction();
      if (this.options.eqCheck(this.lastValue, newValue)) {
        this.lastUpdateChangedValue = false;
      } else {
        this.lastUpdateChangedValue = true;
        this.lastValue = newValue;
      }
    } else {
      delete this.updateNeeded;
      this.lastUpdateChangedValue = false;
      return;
    }
  }

  get(options?: SignalGetOptions): T {
    if (!options || !options.untracked) {
      // Set when we are in the process of defining a new computed siganl.
      const computeDependee = this.signalSpace.maybeDependeeComputeSignal();
      if (computeDependee) {
        computeDependee.dependsOnComputing.add(this as DerivedSignal<unknown>);
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

export type SomeSignal = DerivedSignal<unknown> | ValueSignal<unknown>;

// Note: we use the type-safe way to define the return value; as far as I know
// this is the only way to do so in typescript; although it is more implicit than I would like.
export function writable<T>(
  space: SignalSpace,
  value: T,
  valueOptions?: Partial<ValueOptions<T>>
): WritableSignal<T> {
  const valueSignal = space.makeSignal(value, valueOptions);
  const writableSignal = function () {
    return valueSignal.get();
  };
  // const foo = {...writableSignal, { lastValue: 'foo' } };
  writableSignal.lastValue = () => valueSignal.value;
  writableSignal.set = (value: T, options?: SignalSetOptions) => valueSignal.set(value, options);
  writableSignal.update = (f: (v: T) => T, options?: SignalSetOptions) =>
    valueSignal.update(f, options);
  writableSignal.space = space;
  writableSignal.kind = 'value' as const;
  writableSignal.rawValue = valueSignal;
  return writableSignal;
}

export function computed<T>(
  space: SignalSpace,
  f: () => T,
  options?: ComputeOptions<T>
): ComputedSignal<T> {
  const derivedSignal = space.makeComputedSignal(f, options);
  const signal = function () {
    return derivedSignal.get();
  };
  signal.rawComputation = derivedSignal;
  signal.lastValue = () => derivedSignal.lastValue;
  signal.space = space;
  signal.kind = 'computed' as const;
  return signal;
}

export function effect<T>(
  space: SignalSpace,
  f: () => T,
  options?: Partial<ComputeOptions<T>>
): ComputedSignal<T> {
  const derivedSignal = space.makeComputedSignal(f, Object.assign({ ...options, isEffect: true }));
  const signal = function () {
    return derivedSignal.get();
  };
  signal.rawComputation = derivedSignal;
  signal.lastValue = () => derivedSignal.lastValue;
  signal.space = space;
  signal.kind = 'computed' as const;
  return signal;
}
