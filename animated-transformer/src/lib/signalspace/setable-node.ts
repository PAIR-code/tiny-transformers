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

import { DerivedNode } from './derived-node';
import {
  ComputeContextKind,
  defaultDepOptions,
  DepKind,
  SignalDepOptions,
  SignalSpace,
  SignalKind,
  defaultSignalOptions,
  BasicSignalOptions,
} from './signalspace';

// ----------------------------------------------------------------------------
//  Setable options
// ----------------------------------------------------------------------------
export type SetableOptions<T> = BasicSignalOptions<T>;
export const defaultSetableOptions: <T>() => SetableOptions<T> = defaultSignalOptions;

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

// ----------------------------------------------------------------------------
//  SetableNode
// ----------------------------------------------------------------------------
export class SetableNode<T> {
  // The sets of direct downstream deps...
  dependsOnMe = new Map<DerivedNode<unknown>, SignalDepOptions>();

  // During an update pass, this is set to the update in progress...
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

  noteDependsOnMe(
    node: DerivedNode<unknown>,
    depOptions?: Partial<SignalDepOptions>
  ): SignalDepOptions {
    const newOptions: SignalDepOptions = {
      ...defaultDepOptions,
      depKind: node.options.kind === SignalKind.LazyDerived ? DepKind.Lazy : DepKind.Sync,
      ...depOptions,
    };
    const existingDep = this.dependsOnMe.get(node);
    if (existingDep) {
      if (existingDep.depKind === DepKind.Sync || newOptions.depKind === DepKind.Sync) {
        // update DepKind to be Sync.
        newOptions.depKind = DepKind.Sync;
      }
      newOptions.downstreamNullIfNull =
        existingDep.downstreamNullIfNull || newOptions.downstreamNullIfNull;
    }

    this.dependsOnMe.set(node, newOptions);
    node.dependsOnSetables.set(this as SetableNode<unknown>, newOptions);
    return newOptions;
  }

  get(options?: Partial<SignalDepOptions>): T {
    // If this get is called in the process of defining a new derived signal.
    // (that is the first execution of a derived signal)
    const computeContext = this.signalSpace.computeContext();
    if (computeContext.kind === ComputeContextKind.Definition) {
      const defNode = computeContext.node;
      if (options && options.downstreamNullIfNull && !defNode.options.nullTyped) {
        console.warn('downstreamNullIfNull dependency must be in a nullType signal', {
          signal: this,
          defNode,
        });
        throw new Error('downstreamNullIfNull dependency must be in a nullType signal');
      }
      // console.warn(`[def ${defNode.id}] ${this.id}.get(): value=${this.value}`);
      this.noteDependsOnMe(defNode, options);
    }
    return this.value;
  }

  hasDerivedSignals() {
    return this.dependsOnMe.size > 0;
  }

  // Note: for updates, the get part is silent and untracked...!
  // CONSIDER: should this be semantically the same as get + set?
  update(f: (v: T) => T, setOptions?: SignalSetOptions) {
    this.set(f(this.value), setOptions);
  }

  set(v: T, setOptions?: SignalSetOptions) {
    const updateStrategy = setOptions ? setOptions.updateStrategy : SetableUpdateKind.EqCheck;
    if (updateStrategy === SetableUpdateKind.Untracked || !this.hasDerivedSignals()) {
      this.value = v;
      return;
    } else if (
      updateStrategy === SetableUpdateKind.EqCheck &&
      this.options.eqCheck(this.value, v)
    ) {
      return;
    }
    this.value = v;
    this.signalSpace.propegateValueUpdate(this as SetableNode<unknown>);
  }
}
