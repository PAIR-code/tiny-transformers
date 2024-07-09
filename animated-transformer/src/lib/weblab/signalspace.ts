export class SignalSpace {
  // Stack of actively being defined computation signals;
  // a "get()" call is assumed to be in the last entry here.
  // e.g. c = makeComputedSignal(() => ... x.get())
  // means that c depends on the value of x. So:
  //  computeGraph.get(x).depOnKey.has(x)
  public computeStack: ComputedSignal<unknown>[] = [];

  public signalSet: Set<Signal<unknown>> = new Set();

  public needUpdating?: Set<ComputedSignal<unknown>>;

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

  makeComputedSignal<T>(f: () => T): ComputedSignal<T> {
    const thisComputeSignal = new ComputedSignal<T>(this, f);
    return thisComputeSignal;
  }

  noteUpdate(toUpdate: Iterable<ComputedSignal<unknown>>) {
    if (!this.needUpdating) {
      this.needUpdating = new Set();
      // Next tick, we will actually do the update.
      setTimeout(() => {
        // Assumes no one deletes signalsNeedingUpdates
        for (const touched of this.needUpdating!) {
          for (const dep of touched.dependants) {
            if (dep.data.needsUpdating) {
              dep.updateValue();
            }
          }
        }
      }, 0);
    }
    for (const c of toUpdate) {
      c.data.needsUpdating = true;
      this.needUpdating.add(c);
    }
  }
}

export type ValueSignalData<T> = {
  kind: 'valueSignal';
  value: T;
};
export type ComputedSignalData<T> = {
  kind: 'computedSignal';
  computeFunction: () => T;
  needsUpdating: boolean;
  dependsOnComputing: Set<ComputedSignal<unknown>>;
  lastValue: T;
};

export type SignalData<T> = ValueSignalData<T> | ComputedSignalData<T>;

export type SignalSetOptions = {
  withoutUpdating: boolean; // default false;
};

export type SignalGetOptions = {
  untracked: boolean; // default false;
};

export interface Signal<T> {
  // (options?: SignalGetOptions): T;
  data: SignalData<T>;
  dependants: Set<ComputedSignal<unknown>>;
  get(options?: SignalGetOptions): T;
}

export class ValueSignal<T> implements Signal<T> {
  // All these computed signals in the SignalSpace, `c` have a `c.get(this)`.
  dependants: Set<ComputedSignal<unknown>> = new Set();
  data: ValueSignalData<T>;

  constructor(public signalSpace: SignalSpace, value: T) {
    // super('options', 'return this.get(options)');
    this.data = {
      kind: 'valueSignal',
      value,
    };
    signalSpace.signalSet.add(this);
  }
  get(options?: SignalGetOptions): T {
    // Set when we are in the process of defining a new computed siganl.
    if (!options || !options.untracked) {
      const computeDependee = this.signalSpace.maybeDependeeComputeSignal();
      if (computeDependee) {
        this.dependants.add(computeDependee);
      }
    }
    return this.data.value;
  }
  set(v: T, options?: SignalSetOptions) {
    console.log('noteUpdate...', v, this.data.value, this.dependants);
    this.data.value = v;
    if (!options || !options.withoutUpdating) {
      this.signalSpace.noteUpdate(this.dependants);
    }
  }

  // static call<T>(
  //   thisArg: ValueSignal<T>,
  //   options?: SignalGetOptions | undefined
  // ): T {
  //   return thisArg.get(options);
  // }

  // call(...args: any): T {
  //   return this.get();
  // }
}

export class ComputedSignal<T> implements Signal<T> {
  dependants: Set<ComputedSignal<unknown>> = new Set();
  data: ComputedSignalData<T>;

  constructor(
    public signalSpace: SignalSpace,
    public computeFunction: () => T
  ) {
    signalSpace.signalSet.add(this);
    this.signalSpace.computeStack.push(this);
    this.data = {
      kind: 'computedSignal',
      dependsOnComputing: new Set<ComputedSignal<unknown>>(),
      computeFunction,
      needsUpdating: false,
      lastValue: computeFunction(),
    };
    this.signalSpace.computeStack.pop();
  }

  updateValue() {
    for (const dep of this.data.dependsOnComputing) {
      if (dep.data.needsUpdating) {
        dep.updateValue();
      }
    }
    this.data.lastValue = this.data.computeFunction();
  }

  get(options?: SignalGetOptions): T {
    if (!options || !options.untracked) {
      // Set when we are in the process of defining a new computed siganl.
      const computeDependee = this.signalSpace.maybeDependeeComputeSignal();
      if (computeDependee) {
        computeDependee.data.dependsOnComputing.add(this);
        this.dependants.add(computeDependee);
      }
    }
    if (this.data.needsUpdating) {
      this.updateValue();
    }
    return this.data.lastValue;
  }
}
