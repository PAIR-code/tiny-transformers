import { DerivedNode } from './derived-signal';
import { SetableNode, SignalSetOptions } from './setable-signal';
import { SignalDepOptions, SignalSpace } from './signalspace';

// ----------------------------------------------------------------------------
export interface AbstractSignal<T> {
  // The get signal's get value function. If this is a derived signal that
  // needs updating, it will compute the updated value.
  (options?: Partial<SignalDepOptions>): T;
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

// ----------------------------------------------------------------------------
//  Options related to a given signal, independently of dependencies.
// ----------------------------------------------------------------------------
export type AbstractOptions<T> = {
  eqCheck: (x: T, y: T) => boolean;
  id?: string;
};

// ----------------------------------------------------------------------------
//  Defaults
// ----------------------------------------------------------------------------
export function defaultEqCheck<T>(x: T, y: T) {
  return x === y;
}
