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

import {
  AbstractSignalStructFn,
  ValueStruct,
  CellKind,
  PromiseStructFn,
  PromisedSetableSignalsFn,
  SetableSignalStructFn,
  AsyncIterableFn,
  AsyncOutStreamFn,
} from './cell-kind';
import {
  LabMessage,
  LabMessageKind,
  SetSignalValueMessage,
  StreamValue,
} from 'src/lib/distr-signal-exec/lab-message-types';
import { AbstractSignal, SignalSpace } from '../signalspace/signalspace';

export type ItemMetaData = {
  timestamp: Date;
};

import { SignalReceiveEnd, StreamReceiveEnd, SignalSendEnd, StreamSendEnd } from './channel-ends';
import {
  CellController,
  LabEnvCellConfig,
  SomeCellStateKind,
  SomeLabEnvCell,
} from './cell-controller';

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export class LabEnv {
  constructor(public space: SignalSpace) {}

  // metadata: Map<string, ItemMetaData> = new Map();
  public runningCells: Set<SomeLabEnvCell> = new Set();
  // public runningCells: {
  //   [name: string]: SomeCellStateKind;
  // } = {};

  init<
    I extends ValueStruct,
    IStreams extends ValueStruct,
    O extends ValueStruct,
    OStreams extends ValueStruct,
  >(
    kind: CellKind<I, IStreams, O, OStreams>,
    uses?: {
      // Use AbstractSignal, or pipe from SignalReceiveEnd.
      inputs?: { [Key in keyof Partial<I>]: AbstractSignal<I[Key]> | SignalReceiveEnd<I[Key]> };
      // pipe from receiving end of another stream (in env context, that's a cell output)
      inStreams?: { [Key in keyof IStreams]: StreamReceiveEnd<IStreams[Key]> };
      config?: Partial<LabEnvCellConfig>;
    },
  ): CellController<I, IStreams, O, OStreams> {
    // ID should be unique w.r.t. the LabEnv.
    const id = (uses && uses.config && uses.config.id) || kind.data.cellKindId;
    const cell = new CellController(this, id, kind, uses);
    cell.init();
    return cell;
  }

  start<
    I extends ValueStruct,
    IStreams extends ValueStruct,
    O extends ValueStruct,
    OStreams extends ValueStruct,
  >(
    kind: CellKind<I, IStreams, O, OStreams>,
    uses?: {
      // Use AbstractSignal, or pipe from SignalReceiveEnd.
      inputs?: { [Key in keyof Partial<I>]: AbstractSignal<I[Key]> | SignalReceiveEnd<I[Key]> };
      // pipe from receiving end of another stream (in env context, that's a cell output)
      inStreams?: { [Key in keyof IStreams]: StreamReceiveEnd<IStreams[Key]> };
      config?: Partial<LabEnvCellConfig>;
    },
  ): CellController<I, IStreams, O, OStreams> {
    const cell = this.init(kind, uses);
    cell.start();
    return cell;
  }
}
