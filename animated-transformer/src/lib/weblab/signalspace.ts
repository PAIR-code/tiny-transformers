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

export class SignalSpace {
  // Stack of actively being defined computation signals;
  // a "get()" call is assumed to be in the last entry here.
  // e.g. c = makeComputedSignal(() => ... x.get())
  // means that c depends on the value of x. So:
  //  computeGraph.get(x).depOnKey.has(x)
  public computeStack: ComputedSignal<unknown>[] = [];

  public signalSet: Set<SomeSignal<unknown>> = new Set();

  public pendingEffects?: Set<ComputedSignal<unknown>>;

  constructor() {}

  maybeDependeeComputeSignal(): ComputedSignal<unknown> | null {
    return this.computeStack.length > 0
      ? this.computeStack[this.computeStack.length - 1]
      : null;
  }

  makeSignal<T>(value: T): ValueSignal<T> {
    const s = new ValueSignal(this, value);
    return s;
  }

  makeComputedSignal<T>(
    f: () => T,
    options?: ComputeOptions
  ): ComputedSignal<T> {
    const thisComputeSignal = new ComputedSignal<T>(this, f, options);
    return thisComputeSignal;
  }

  noteUpdate(needUpdatingSignals: Iterable<ComputedSignal<unknown>>) {
    for (const c of needUpdatingSignals) {
      c.needsUpdating = true;
      if (c.options.isEffect) {
        if (!this.pendingEffects) {
          this.initPendingEffects();
        }
        this.pendingEffects!.add(c);
      }
    }
  }

  initPendingEffects() {
    this.pendingEffects = new Set();
    // Next tick, we will actually do the update
    setTimeout(() => {
      // Assumes no one deletes signalsNeedingUpdates
      for (const touched of this.pendingEffects!) {
        touched.updateValue();
        for (const dep of touched.dependsOnMe) {
          if (dep.needsUpdating) {
            dep.updateValue();
          }
        }
      }
      delete this.pendingEffects;
    }, 0);
  }
}

export type SignalSetOptions = {
  withoutUpdating: boolean; // default false;
};

export type SignalGetOptions = {
  untracked: boolean; // default false;
};

export type ComputeOptions = {
  // When something is an effect, it gets updated every time it needs it be
  // updated in the next tick. And otherwise, values are updated only when
  // the corresponding s.get() method is called.
  isEffect: boolean; // default false;
};

// export interface Signal<T> {
//   // (options?: SignalGetOptions): T;
//   data: SignalData<T>;
//   dependsOnMe: Set<ComputedSignalClass<unknown>>;
//   get(options?: SignalGetOptions): T;
// }

export class ValueSignal<T> {
  // All these computed signals in the SignalSpace, `c` have a `c.get(this)`.
  dependsOnMe = new Set<ComputedSignal<unknown>>();
  kind = 'valueSignal';

  constructor(public signalSpace: SignalSpace, public value: T) {
    // super('options', 'return this.get(options)');
    signalSpace.signalSet.add(this);
  }
  get(options?: SignalGetOptions): T {
    // Set when we are in the process of defining a new computed siganl.
    if (!options || !options.untracked) {
      const computeDependee = this.signalSpace.maybeDependeeComputeSignal();
      if (computeDependee) {
        this.dependsOnMe.add(computeDependee);
        computeDependee.dependsOnValues.add(this);
      }
    }
    return this.value;
  }
  set(v: T, options?: SignalSetOptions) {
    this.value = v;
    if (!options || !options.withoutUpdating) {
      this.signalSpace.noteUpdate(this.dependsOnMe);
    }
  }
}

export class ComputedSignal<T> {
  kind = 'computedSignal';
  needsUpdating = false;
  dependsOnMe = new Set<ComputedSignal<unknown>>();
  dependsOnComputing = new Set<ComputedSignal<unknown>>();
  dependsOnValues = new Set<ValueSignal<unknown>>();
  lastValue: T;

  constructor(
    public signalSpace: SignalSpace,
    public computeFunction: () => T,
    public options: ComputeOptions = { isEffect: false }
  ) {
    signalSpace.signalSet.add(this);
    this.signalSpace.computeStack.push(this);
    // Note: this.lastValue should be set last, because...
    // Within the `computeFunction()` call, we expect other siganls, s,
    // to be called with s.get(), and these will add all
    this.lastValue = computeFunction();
    this.signalSpace.computeStack.pop();
  }

  updateValue() {
    for (const dep of this.dependsOnComputing) {
      if (dep.needsUpdating) {
        dep.updateValue();
      }
    }
    this.lastValue = this.computeFunction();
  }

  get(options?: SignalGetOptions): T {
    if (!options || !options.untracked) {
      // Set when we are in the process of defining a new computed siganl.
      const computeDependee = this.signalSpace.maybeDependeeComputeSignal();
      if (computeDependee) {
        computeDependee.dependsOnComputing.add(this);
        this.dependsOnMe.add(computeDependee);
        for (const dep of this.dependsOnValues) {
          dep.dependsOnMe.add(computeDependee);
          computeDependee.dependsOnValues.add(dep);
        }
      }
    }
    if (this.needsUpdating) {
      this.updateValue();
    }
    return this.lastValue;
  }
}

export type SomeSignal<T> = ComputedSignal<T> | ValueSignal<T>;

export interface Signal<T> {
  // The get signal value function. If this is a computed signal that
  // needs updating, it will compute the updated value.
  (options?: SignalGetOptions): T;
  // The last value the signal had (doesn't compute updates, even if
  // the signal needs updating).
  lastValue(): T;
}

export interface WritableSignal<T> extends Signal<T> {
  // Sets the value of the signal.
  set<T>(newValue: T, options?: SignalSetOptions): void;
}

export function signal<T>(space: SignalSpace, value: T): WritableSignal<T> {
  const valueSignal = space.makeSignal(value);
  function getFunction() {
    return valueSignal.get();
  }
  const writableSignal: WritableSignal<T> =
    getFunction as unknown as WritableSignal<T>;
  writableSignal.lastValue = () => valueSignal.value;
  writableSignal.set<T> = (value: T) => valueSignal.set(value);
  return writableSignal;
}

export function computed<T>(
  space: SignalSpace,
  f: () => T,
  options?: ComputeOptions
): Signal<T> {
  const computedSignal = space.makeComputedSignal(f, options);
  function getFunction() {
    return computedSignal.get();
  }
  const signal: WritableSignal<T> = getFunction as unknown as WritableSignal<T>;
  signal.lastValue = () => computedSignal.lastValue;
  return signal;
}

export function effect<T>(space: SignalSpace, f: () => T): Signal<T> {
  const computedSignal = space.makeComputedSignal(f, { isEffect: true });
  function getFunction() {
    return computedSignal.get();
  }
  const signal: WritableSignal<T> = getFunction as unknown as WritableSignal<T>;
  signal.lastValue = () => computedSignal.lastValue;
  return signal;
}
