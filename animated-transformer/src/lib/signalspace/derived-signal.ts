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

import { AbstractOptions, defaultEqCheck } from './abstract-signal';
import { SetableNode } from './setable-signal';
import {
  ComputeContextKind,
  DepKind,
  DerivedDep,
  SetableDep,
  SignalDepOptions,
  SignalKind,
  SignalSpace,
  SignalSpaceUpdate,
} from './signalspace';

export type DerivedOptions<T> = AbstractOptions<T> & {
  // When true, the type `T` must be of the form `S | null` (null must extend
  // T). The idea is that the value of this derivedNode is `null` if any
  // dependency is wrapped in a `defined`, and that child dep's valuye is null.
  nullTyped: null extends T ? boolean : false;

  // Sync means the signal is updated synchronously from its dependencies. Lazy
  // means that it is computed only when needed (e.g. when there is an explicit
  // signal.get() call).
  //
  // When something has alwaysUpdateSync, it gets updated every time it needs it
  // be updated synchronously. And otherwise, values are updated only when the
  // corresponding s.get() method is called, or an end-of-tick timeout happens.
  kind: SignalKind.SyncDerived | SignalKind.LazyDerived;

  // CONSIDER: add clobberBehavior here too. Useful is you have a alwaysUpdate
  // that you want to merge later...
};

export function defaultDerivedOptions<T>(): DerivedOptions<T> {
  return {
    nullTyped: false,
    kind: SignalKind.SyncDerived,
    eqCheck: defaultEqCheck,
  };
}

// ----------------------------------------------------------------------------
//  DerivedNode
// ----------------------------------------------------------------------------
export class DerivedNode<T> {
  // These are critical for lazy updates. If we only supported sync updates,
  // these would not be needed. But you need to know is a dependency's
  // last-update not the same as the update you need. If it is the same, you
  // don't need to recompute it, but if it's different, you do.
  //
  // updateNeeded is the latest update that needs to be applied to this node.
  // This is set whenever an upstream setable signal is set.
  // updateNeeded?: SignalSpaceUpdate;
  // lastUpdate is the last update that was applied to this node.
  // lastUpdate?: SignalSpaceUpdate;

  upstreamSetableChanges?: Set<SetableNode<unknown>>;

  // get needsUpdating() {
  //   return this.updateNeeded !== this.lastUpdate;
  // }

  // TODO: use this to check if any child dep changed,
  // and thus this needs recomputation.
  dependsOnMeSync = new Set<DerivedNode<unknown>>();
  dependsOnMeLazy = new Set<DerivedNode<unknown>>();

  // Direct dependencies on Derived Notes.
  dependsOnComputing = new Set<DerivedDep>();

  // Direct dependenies on Setable Nodes.
  dependsOnSetables = new Set<SetableDep>();

  // // This is true when we are set to null because a child dependency is null.
  // // Should only be possible to true when `this.options.nullTyped === true`.
  nullBecauseUpstreamNull = false;
  lastValue: T;
  options: DerivedOptions<T>;
  nodeId: number;

  get id() {
    return `d${this.nodeId}_${(this.options && this.options.id) || ''}`;
  }

  constructor(
    public signalSpace: SignalSpace,
    public computeFunction: () => T,
    options?: Partial<DerivedOptions<T>>
  ) {
    this.nodeId = signalSpace.nodeCount++;
    this.options = { ...defaultDerivedOptions(), ...options };
    signalSpace.signalSet.add(this as DerivedNode<unknown>);
    this.signalSpace.computeStack.push({
      kind: ComputeContextKind.Definition,
      node: this as DerivedNode<unknown>,
    });
    // Note: this.lastValue should be set last, because...
    // Within the `computeFunction()` call, we expect other siganls, s,
    // to be called with s.get(), and these will add all
    this.lastValue = computeFunction();
    this.signalSpace.computeStack.pop();
  }

  upstreamDepChanged(): boolean {
    let upstreamDepChanged = false;
    for (const dep of this.dependsOnComputing) {
      if (dep.node.upstreamSetableChanges) {
        upstreamDepChanged = upstreamDepChanged || dep.node.updateFromUpstreamChanges();
        if (
          // this.setToNullDueToNullChild ||
          dep.options &&
          dep.options.downstreamNullIfNull &&
          this.options.nullTyped && // Should be true by construction, remove?
          dep.node.lastValue === null
        ) {
          this.nullBecauseUpstreamNull = true;
          // return true here is confusing because we are really using it as a
          // fast exit to set this value here to null and not think about it any
          // more.
          return true;
        }
      }
    }
    if (upstreamDepChanged) {
      return true;
    }
    if (this.upstreamSetableChanges) {
      for (const valueDep of this.dependsOnSetables) {
        if (
          valueDep.options &&
          valueDep.options.downstreamNullIfNull &&
          valueDep.node.value === null
        ) {
          this.nullBecauseUpstreamNull = true;
          // return true here is confusing because we are really using it as a
          // fast exit to set this value here to null and not think about it any
          // more.
          return true;
        }
        if (this.upstreamSetableChanges.has(valueDep.node)) {
          return true;
        }
      }
    }
    return false;
  }

  // Assumed to only be called when `this.needsUpdating === true`
  // Meaning that some value under one of the `this.dependsOnComputing`
  // (and maybe sub this.dependsOnValues was changed.)
  //
  // Return true when the value changed.
  updateFromUpstreamChanges(): boolean {
    let valueChanged = false;
    // console.log('compute.update: ', {
    //   lastValue: this.lastValue,
    //   lastUpdate: this.lastUpdate ? this.lastUpdate.counter : 'undef',
    //   mayNeedUpdating: this.updateNeeded ? this.updateNeeded.counter : 'undef',
    // });
    this.signalSpace.computeStack.push({
      kind: ComputeContextKind.Update,
      node: this as DerivedNode<unknown>,
    });

    if (this.upstreamDepChanged()) {
      // this.lastUpdate = this.updateNeeded || this.lastUpdate;
      // delete this.updateNeeded;
      let newValue: T;
      if (this.nullBecauseUpstreamNull) {
        // This is a lie that has to be caught at runtime by the `defined`
        // operator only being applicable when working within a computation that
        // may be null; it is checked in the node get functions.
        newValue = null as T;
      } else {
        newValue = this.computeFunction();
      }
      if (!this.options.eqCheck(this.lastValue, newValue)) {
        valueChanged = true;
        this.lastValue = newValue;
      }
    }
    // Reset the possibility that a child is null, and wants me to be null
    // because of it.
    this.nullBecauseUpstreamNull = false;
    this.signalSpace.computeStack.pop();
    delete this.upstreamSetableChanges;
    return valueChanged;
  }

  get(options?: Partial<SignalDepOptions>): T {
    const computeContext = this.signalSpace.computeContext();
    if (computeContext.kind === ComputeContextKind.Definition) {
      const defNode = computeContext.node;
      console.warn(`[def ${defNode.id}] ${this.id}.get()`);
      const dep = new DerivedDep(this as DerivedNode<unknown>, options);
      defNode.dependsOnComputing.add(dep);
      const depKind = !options ? DepKind.Sync : options.depKind;
      if (depKind === DepKind.Sync || defNode.options.kind === SignalKind.SyncDerived) {
        this.dependsOnMeSync.add(defNode);
      } else {
        this.dependsOnMeLazy.add(defNode);
      }

      for (const dep of this.dependsOnSetables) {
        defNode.dependsOnSetables.add(dep);
        if (depKind === DepKind.Sync || defNode.options.kind === SignalKind.SyncDerived) {
          dep.node.dependsOnMeSync.add(defNode);
        } else {
          dep.node.dependsOnMeLazy.add(defNode);
        }
      }
      if (options && options.downstreamNullIfNull && !defNode.options.nullTyped) {
        console.warn('downstreamNullIfNull dependency must be in a nullType signal', {
          signal: this,
          defNode,
        });
        throw new Error('downstreamNullIfNull dependency must be in a nullType signal');
      }
    }
    if (this.upstreamSetableChanges) {
      this.updateFromUpstreamChanges();
    }
    return this.lastValue;
  }
}
