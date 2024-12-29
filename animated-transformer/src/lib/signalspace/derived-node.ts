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

import { SetableNode } from './setable-node';
import {
  ComputeContextKind,
  defaultDepOptions,
  DepKind,
  SignalDepOptions,
  SignalSpace,
  SignalKind,
  defaultEqCheck,
  BasicSignalOptions,
  AbstractSignal,
} from './signalspace';

// ----------------------------------------------------------------------------
//  Defaults
// ----------------------------------------------------------------------------
export enum DerivedNodeState {
  RequiresRecomputing = 'RequiresRecomputing',
  HasSomeUpstreamChanges = 'HasSomeUpstreamChanges',
  UpToDate = 'UpToDate',
}

export type DerivedNodeOptions<T> = BasicSignalOptions<T> & {
  // When true, the type `T` must be of the form `S | null` (null must extend
  // T). The idea is that the value of this derivedNode is `null` if any
  // dependency is wrapped in a `defined`, and that child dep's valuye is null.
  //
  // TODO: generalise nullTyped to it's algebraic nature:
  // It's a pooling operation with optional early exit.
  nullTyped: null extends T ? boolean : false;
  preComputeDeps: Map<AbstractSignal<any>, SignalDepOptions>;

  // Sync means that dependencies in it's compute function definition by default
  // are immidiate (sync). Lazy means that dependencies in the cmompute function
  // definition are by default lazy (i.e. we update this signal only when needed
  // e.g. when there is an explicit call of signal.get()).
  kind: SignalKind.SyncDerived | SignalKind.LazyDerived;
};

export function defaultDerivedOptions<T>(): DerivedNodeOptions<T> {
  return {
    nullTyped: false,
    preComputeDeps: new Map(),
    kind: SignalKind.SyncDerived,
    eqCheck: defaultEqCheck,
  };
}

// ----------------------------------------------------------------------------
//  DerivedNode
// ----------------------------------------------------------------------------
export class DerivedNode<T> {
  // // subset of "dependsOnSetables" that have changed.
  // upstreamSetableChanges?: Set<SetableNode<unknown>>;

  // True when one of dependsOn(Computing|Setables) has changed, and we need to
  // re-run computeFunction.
  state: DerivedNodeState;

  // Directly downstream dependencies (when this is changed, update these).
  dependsOnMe = new Map<DerivedNode<unknown>, SignalDepOptions>();

  // Direct upstream derived node dependencies (to compute this, one needs to
  // compute... 'dependsOnComputing')
  dependsOnComputing = new Map<DerivedNode<unknown>, SignalDepOptions>();

  // Direct upstream setable dependenies (changes to these directly .
  dependsOnSetables = new Map<SetableNode<unknown>, SignalDepOptions>();

  // // This is true when we are set to null because a child dependency is null.
  // // Should only be possible to true when `this.options.nullTyped === true`.
  nullBecauseUpstreamNull = false;
  lastValue: T;
  options: DerivedNodeOptions<T>;
  nodeId: number;

  get id() {
    return `d${this.nodeId}_${(this.options && this.options.id) || ''}`;
  }

  constructor(
    public signalSpace: SignalSpace,
    public computeFunction: () => T,
    options?: Partial<DerivedNodeOptions<T>>,
  ) {
    this.nodeId = signalSpace.nodeCount++;
    this.options = { ...defaultDerivedOptions(), ...options };
    signalSpace.signalSet.add(this as DerivedNode<unknown>);
    this.signalSpace.computeStack.push({
      kind: ComputeContextKind.Definition,
      node: this as DerivedNode<unknown>,
    });
    // TODO: think about this more... there are probably some subtle cases of
    // updates in nested defintions... also, maybe we should just give up on the
    // maybeMonad construction that nullable provides... it's rather a complex
    // implementation...

    // Manually provide some dependencies
    for (const [dep, depOptions] of this.options.preComputeDeps) {
      let finalDepOptions: SignalDepOptions;
      if (dep.node instanceof DerivedNode) {
        finalDepOptions = this.noteDependsOnComputing(dep.node, depOptions);
      } else {
        finalDepOptions = this.noteDependsOnSetable(dep.node, depOptions);
      }
      dep.node.dependsOnMe.set(this as DerivedNode<unknown>, finalDepOptions);
    }
    this.checkUpstreamChanges();
    if (this.nullBecauseUpstreamNull) {
      this.lastValue = null as T;
    } else {
      // Note: this.lastValue should be set last, because... Within the
      // `computeFunction()` call, we expect other siganls, s, to be called with
      // s.get(), and these get calls will add the relevant dependencies.
      this.lastValue = computeFunction();
    }
    this.nullBecauseUpstreamNull = false;
    this.signalSpace.computeStack.pop();
    this.state = DerivedNodeState.UpToDate;
  }

  noteRequiresRecomputing() {
    const initState = this.state;
    this.state = DerivedNodeState.RequiresRecomputing;
    if (initState === DerivedNodeState.UpToDate) {
      for (const depOnMe of this.dependsOnMe.keys()) {
        depOnMe.noteHasSomeUpstreamChanges();
      }
    }
  }
  noteHasSomeUpstreamChanges() {
    if (this.state === DerivedNodeState.UpToDate) {
      this.state = DerivedNodeState.HasSomeUpstreamChanges;
      for (const depOnMe of this.dependsOnMe.keys()) {
        depOnMe.noteHasSomeUpstreamChanges();
      }
    }
  }

  //
  checkUpstreamChanges(): void {
    // let upstreamDepChanged = false;
    for (const [dep, depOptions] of this.dependsOnComputing.entries()) {
      // if (dep.state !== DerivedNodeState.UpToDate) {
      //
      // console.warn(`[${this.id}].checkUpstreamChanges: dependsOnComputing: ${dep.id}`);
      dep.ensureUpToDate();
      // Note: options.downstreamNullIfNull ==> this.options.nullTyped
      if (this.options.nullTyped && depOptions.downstreamNullIfNull && dep.lastValue === null) {
        this.nullBecauseUpstreamNull = true;
        // TODO: consider: this can result in rather complex beaviours because
        // depending on the ordering in the graph, different deps get
        // computed... consider always doing all dep updates first? On the other
        // hand, this is more efficient...
        break;
      }
      // }
    }
    if (this.nullBecauseUpstreamNull) {
      return;
    }
    if (this.options.nullTyped) {
      for (const [setableDep, depOptions] of this.dependsOnSetables.entries()) {
        if (depOptions.downstreamNullIfNull && setableDep.value === null) {
          this.nullBecauseUpstreamNull = true;
          break;
        }
      }
    }
  }

  ensureUpToDate(): void {
    if (this.state === DerivedNodeState.UpToDate) {
      return;
    }
    // A reason we need to track the computeStack is that values can be set
    // within a get call. When that happens, within the set's effect, we need to
    // know we are no longer adding get calls to the dependencies of the
    // definition.
    this.signalSpace.noteStartedDerivedUpdate(this as DerivedNode<unknown>);

    // checkUpstreamChanges may change this.state to "RequiresRecomputing", if
    // it does indeed require recomputing.
    this.checkUpstreamChanges();
    if (this.state === DerivedNodeState.RequiresRecomputing) {
      // console.warn(
      //   `[${this.id}](nullTyped: ${this.options.nullTyped}; nullBecauseUpstreamNull: ${this.nullBecauseUpstreamNull}): RequiresRecomputing...`
      // );
      let newValue: T;
      if (this.nullBecauseUpstreamNull) {
        // This is a lie that has to be caught at runtime by the `defined`
        // operator only being applicable when working within a computation that
        // may be null; it is checked in the node get functions.
        newValue = null as T;
      } else {
        newValue = this.computeFunction();
      }
      this.state = DerivedNodeState.UpToDate;
      this.nullBecauseUpstreamNull = false;

      if (!this.options.eqCheck(this.lastValue, newValue)) {
        this.lastValue = newValue;
        for (const [depOnMe, options] of this.dependsOnMe.entries()) {
          // console.warn(`[${this.id}].ensureUpToDate: depOnMe: ${depOnMe.id}`);
          depOnMe.noteRequiresRecomputing();
          if (options.depKind === DepKind.Sync) {
            depOnMe.ensureUpToDate();
          }
        }
      }
    }

    // Reset the possibility that a child is null, and wants me to be null
    // because of it.
    this.signalSpace.noteEndedDerivedUpdate(this as DerivedNode<unknown>);
    return;
  }

  noteDependsOnSetable(
    node: SetableNode<unknown>,
    depOptions?: Partial<SignalDepOptions>,
  ): SignalDepOptions {
    // A derived dependency is Lazy or Sync depending on the default signal
    // type; but it can be over-written by the dependency kind specified for
    // this specific dependency.
    const newOptions: SignalDepOptions = {
      ...defaultDepOptions,
      depKind: this.options.kind === SignalKind.LazyDerived ? DepKind.Lazy : DepKind.Sync,
      ...depOptions,
    };
    const existingDep = this.dependsOnSetables.get(node);
    // Any sync dep (past or present), means this is a sync dep.
    if (existingDep) {
      if (existingDep.depKind === DepKind.Sync || newOptions.depKind === DepKind.Sync) {
        // update DepKind to be Sync.
        newOptions.depKind = DepKind.Sync;
      }
      newOptions.downstreamNullIfNull =
        existingDep.downstreamNullIfNull || newOptions.downstreamNullIfNull;
    }
    this.dependsOnSetables.set(node, newOptions);
    return newOptions;
  }

  noteDependsOnComputing(
    node: DerivedNode<unknown>,
    depOptions?: Partial<SignalDepOptions>,
  ): SignalDepOptions {
    // A derived dependency is Lazy or Sync depending on the default signal
    // type; but it can be over-written by the dependency kind specified for
    // this specific dependency.
    const newOptions: SignalDepOptions = {
      ...defaultDepOptions,
      depKind: this.options.kind === SignalKind.LazyDerived ? DepKind.Lazy : DepKind.Sync,
      ...depOptions,
    };
    const existingDep = this.dependsOnComputing.get(node);
    if (existingDep) {
      if (existingDep.depKind === DepKind.Sync || newOptions.depKind === DepKind.Sync) {
        // update DepKind to be Sync.
        newOptions.depKind = DepKind.Sync;
      }
      newOptions.downstreamNullIfNull =
        existingDep.downstreamNullIfNull || newOptions.downstreamNullIfNull;
    }
    this.dependsOnComputing.set(node, newOptions);
    return newOptions;
  }

  get(options?: Partial<SignalDepOptions>): T {
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
      // console.warn(`[def ${defNode.id}] ${this.id}.get()`);
      // const dep = new DerivedDep(this as DerivedNode<unknown>, options);
      const depOptions = defNode.noteDependsOnComputing(this as DerivedNode<unknown>, options);
      this.dependsOnMe.set(defNode, depOptions);
    }
    this.ensureUpToDate();
    return this.lastValue;
  }

  // Remove from the space, removing all things that depend on it in the space,
  // and remove any references to this depending on other stuff.
  dispose() {
    this.signalSpace.signalSet.delete(this as DerivedNode<unknown>);

    for (const setable of this.dependsOnSetables.keys()) {
      setable.dependsOnMe.delete(this as DerivedNode<unknown>);
    }
    for (const depOnComputing of this.dependsOnComputing.keys()) {
      depOnComputing.dependsOnMe.delete(this as DerivedNode<unknown>);
    }
    for (const depOnMe of this.dependsOnMe.keys()) {
      depOnMe.dispose();
    }
  }
}
