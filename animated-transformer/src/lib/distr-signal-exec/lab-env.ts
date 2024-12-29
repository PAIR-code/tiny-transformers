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
} from './cell-types';
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

import {
  SignalReceiveEnd,
  StreamReceiveEnd,
  SignalSendEnd,
  StreamSendEnd,
} from './signal-messages';
import { LabEnvCell, LabEnvCellConfig, SomeCellStateKind, SomeLabEnvCell } from './lab-env-cell';

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
      config?: LabEnvCellConfig;
    },
  ): LabEnvCell<I, IStreams, O, OStreams> {
    const id = (uses && uses.config && uses.config.id) || kind.data.cellKindId;
    const envCell = new LabEnvCell(id, this.space, kind, uses);
    envCell.onceFinished.then(() => this.runningCells.delete(envCell as SomeLabEnvCell));
    return envCell;
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
      config?: LabEnvCellConfig;
    },
  ): LabEnvCell<I, IStreams, O, OStreams> {
    const envCell = this.init(kind, uses);
    envCell.start();
    return envCell;
  }

  // pipeSignal<
  //   SourceOut extends ValueStruct,
  //   TargetIn extends ValueStruct,
  //   SourceSignalId extends keyof SourceOut & string,
  //   TargetSignalId extends keyof TargetIn & string,
  // >(
  //   sourceCell: LabEnvCell<ValueStruct, ValueStruct, SourceOut, ValueStruct>,
  //   sourceSignalId: SourceSignalId,
  //   targetCell: LabEnvCell<TargetIn, ValueStruct, ValueStruct, ValueStruct>,
  //   targetSignalId: TargetSignalId,
  //   options?: { keepHereToo: boolean },
  // ) {
  //   sourceCell.outputs[]
  //   const channel = new MessageChannel();
  //   sourceCell.pipeOutputSignal(sourceSignalId, [channel.port1], options);
  //   targetCell.pipeInputSignal(targetSignalId, [channel.port2]);
  //   // TODO: keep track of channels between cells.
  // }

  // pipeStream<
  //   SourceOut extends ValueStruct,
  //   TargetIn extends ValueStruct,
  //   SourceStreamId extends keyof SourceOut & string,
  //   TargetStreamId extends keyof TargetIn & string,
  // >(
  //   sourceCell: LabEnvCell<ValueStruct, ValueStruct, ValueStruct, SourceOut>,
  //   sourceStreamId: SourceStreamId,
  //   targetCell: LabEnvCell<ValueStruct, TargetIn, ValueStruct, ValueStruct>,
  //   targetStreamId: TargetStreamId,
  //   options?: { keepHereToo: boolean },
  // ) {
  //   const channel = new MessageChannel();
  //   sourceCell.pipeOutputStream(sourceStreamId, [channel.port1], options);
  //   targetCell.pipeInputStream(targetStreamId, [channel.port2]);
  //   // TODO: keep track of channels between cells.
  // }
}
