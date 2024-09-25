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

import { DerivedSignal, DerivedNode, SignalSpace, SetableSignal } from './signalspace';

export class SavableValueKind<K extends string, T, S> {
  constructor(
    // ID should be unique for each instance. And the should have compatible
    // toSerializable and fromSerializable between different environments that
    // recieve and send serialised objects (instances of S).
    public id: K,
    public toSerializable: (x: T) => S,
    public fromSerializable: (s: S) => T
  ) {}
}

export class WritableSValue<K extends string, T, S> {
  public proposedValue: SetableSignal<T>;
  constructor(public kind: SavableValueKind<K, T, S>, public value: SetableSignal<T>) {
    this.proposedValue = this.value.space.writable(value());
  }
  updateValue() {
    this.value.set(this.proposedValue.lastValue());
  }
}

export class ComputedSValue<K extends string, T, S> {
  public value: SetableSignal<T>;
  constructor(public kind: SavableValueKind<K, T, S>, public proposedValue: DerivedSignal<T>) {
    this.value = proposedValue.space.writable(proposedValue.lastValue());
  }
  updateValue() {
    this.value.set(this.proposedValue.lastValue());
  }
}
