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
import { DerivedNode } from './derived-signal';
import {
  ComputeContextKind,
  DepKind,
  SetableDep,
  SignalDepOptions,
  SignalKind,
  SignalSpace,
  SignalSpaceUpdate,
} from './signalspace';

// ----------------------------------------------------------------------------
//  Options when setting a value.
// ----------------------------------------------------------------------------
export enum SetableUpdateKind {
  // Effectively forces the eqCheck to be false - as if this is the first ever
  // set of the value.
  ForceUpdate = 'ForceUpdateKind',
  // treats this set as untracked, and will not trigger downstream dependencies.
  Untracked = 'UntrackedUpdateKind',
  // (default) will run the equality check to decide if downstream derived
  // signals need to be updated.
  EqCheck = 'EqCheckUpdateKind',
}
export type SignalSetOptions = {
  updateStrategy: SetableUpdateKind;
};

// General options for a setable.
export type SetableOptions<T> = AbstractOptions<T> & {
  // If a value is set more than once js-execution-tick, what should the update
  // behvaior be?
  //
  // * 'alwaysUpdate' ==> dependent effects (and intermediate computations) get
  //   called for each.
  //
  // * 'justLatest' ==> dependent effects and computations get called once only,
  //   with the latest value.
  //
  // CONSIDER: introduce a transaction set concept, where updates happen at the
  // end of the transaction (either sync, or in next tick)
  clobberBehvaior: 'alwaysUpdateSync' | 'justLatestNextTick';
};

export function defaultSetableOptions<T>(): SetableOptions<T> {
  return {
    eqCheck: defaultEqCheck,
    clobberBehvaior: 'alwaysUpdateSync',
  };
}

// ----------------------------------------------------------------------------
//  SetableNode
// ----------------------------------------------------------------------------
export class SetableNode<T> {
  // The sets of all downstream deps...
  //
  // Having setables know all downstream dependents is needed. Graphs can be
  // complicated, so you can't guarnteee (without a complication step) an update
  // ordering where all upstream deps are updated before downstream deps (in
  // theory you could compile, and update, an update order for every setable,
  // but that's rather more complex, and saves only a little graph
  // walking/checking, so I think it's not worth it... or can be a later
  // optimization).
  //
  // Lazy deps, those that are updated only when actually needed.
  dependsOnMeLazy = new Set<DerivedNode<unknown>>();
  // Sync deps get updates on every set action (or set transation)
  dependsOnMeSync = new Set<DerivedNode<unknown>>();

  // During an update pass, this is set to the update in progress...
  curUpdate?: SignalSpaceUpdate;
  options: SetableOptions<T>;
  nodeId: number;

  get id() {
    return `s${this.nodeId}_${(this.options && this.options.id) || ''}`;
  }

  constructor(
    public signalSpace: SignalSpace,
    public value: T,
    options?: Partial<SetableOptions<T>>
  ) {
    this.nodeId = signalSpace.nodeCount++;
    this.options = { ...defaultSetableOptions(), ...options };
    signalSpace.signalSet.add(this as SetableNode<unknown>);
  }

  get(options?: Partial<SignalDepOptions>): T {
    // If this get is called in the process of defining a new derived signal.
    // (that is the first execution of a derived signal)
    const depKind = !options ? DepKind.Sync : options.depKind;
    const computeContext = this.signalSpace.computeContext();
    if (computeContext.kind === ComputeContextKind.Definition) {
      const defNode = computeContext.node;
      console.warn(`[def ${defNode.id}] ${this.id}.get(): value=${this.value}`);

      const dep = new SetableDep(this as SetableNode<unknown>, options);
      defNode.dependsOnSetables.add(dep);
      if (depKind === DepKind.Sync || defNode.options.kind === SignalKind.SyncDerived) {
        this.dependsOnMeSync.add(defNode);
      } else {
        this.dependsOnMeLazy.add(defNode);
      }

      if (options && options.downstreamNullIfNull && !defNode.options.nullTyped) {
        console.warn('downstreamNullIfNull dependency must be in a nullType signal', {
          signal: this,
          defNode,
        });
        throw new Error('downstreamNullIfNull dependency must be in a nullType signal');
      }
    }
    return this.value;
  }

  hasDerivedSignals() {
    return this.dependsOnMeSync.size > 0 || this.dependsOnMeLazy.size > 0;
  }

  checkForLoopyUpdates(v: T): boolean {
    if (this.signalSpace.update) {
      if (this.signalSpace.update.changedValueSet.has(this as SetableNode<unknown>)) {
        console.error(
          `A cyclic value update happened in a computation:`,
          '\nvalueSignal & new value:',
          this,
          v,
          '\neffects touched:',
          this.signalSpace.update.syncDepsTouched
        );
        return true;
      } else {
        this.signalSpace.update.changedValueSet.add(this as SetableNode<unknown>);
        return false;
      }
    }
    return false;
  }

  // Note: for updates, the get part is silent and untracked...
  // CONSIDER: should this be semantically the same as get + set?
  update(f: (v: T) => T, setOptions?: SignalSetOptions) {
    this.set(f(this.value), setOptions);
  }

  set(v: T, setOptions?: SignalSetOptions) {
    console.log(`${this.id}: set(${v})`);

    const updateStrategy = setOptions ? setOptions.updateStrategy : 'eqCheck';
    if (updateStrategy === SetableUpdateKind.Untracked || !this.hasDerivedSignals()) {
      console.log(`${this.id}: set, skipping updating effects: ${v}`);
      this.value = v;
      return;
    } else if (
      updateStrategy === SetableUpdateKind.EqCheck &&
      this.options.eqCheck(this.value, v)
    ) {
      return;
    }
    // Else... forcing an update, or using eqCheck, but value != old value.
    if (this.checkForLoopyUpdates(v)) {
      return;
    }
    this.value = v;
    this.curUpdate = this.signalSpace.noteValueUpdate(this as SetableNode<unknown>);
    if (this.dependsOnMeSync.size > 0) {
      console.log(`${this.id}.set(${v}): updating Sync deps`);
      this.signalSpace.updateSyncDeps();
    }
    delete this.curUpdate;
  }
}
