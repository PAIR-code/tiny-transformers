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
  SignalInput,
  SignalInputStream,
  SignalOutput,
  SignalOutputStream,
} from './signal-messages';
import { LabEnvCell, SomeCellStateKind } from './lab-env-cell';

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export class LabEnv {
  constructor(public space: SignalSpace) {}

  // metadata: Map<string, ItemMetaData> = new Map();
  public runningCells: {
    [name: string]: SomeCellStateKind;
  } = {};

  init<
    I extends ValueStruct,
    IStreams extends ValueStruct,
    O extends ValueStruct,
    OStreams extends ValueStruct,
  >(
    kind: CellKind<I, IStreams, O, OStreams>,
    inputs?: { [Key in keyof I]: AbstractSignal<I[Key]> | SignalInput<I[Key]> },
  ): LabEnvCell<I, IStreams, O, OStreams> {
    this.runningCells[kind.data.cellName] = kind as SomeCellStateKind;
    const envCell = new LabEnvCell(
      kind.data.cellName,
      this.space,
      kind,
      { inputs },
      // { logCellMessagesName: spec.data.cellName }
    );
    envCell.onceFinished.then(() => delete this.runningCells[kind.data.cellName]);
    return envCell;
  }

  start<
    I extends ValueStruct,
    IStreams extends ValueStruct,
    O extends ValueStruct,
    OStreams extends ValueStruct,
  >(
    kind: CellKind<I, IStreams, O, OStreams>,
    inputs?: AbstractSignalStructFn<I>,
  ): LabEnvCell<I, IStreams, O, OStreams> {
    const envCell = this.init(kind, inputs);
    envCell.start();
    return envCell;
  }

  pipeSignal<
    SourceOut extends ValueStruct,
    TargetIn extends ValueStruct,
    SignalId extends keyof SourceOut & keyof TargetIn & string,
  >(
    sourceCell: LabEnvCell<ValueStruct, ValueStruct, SourceOut, ValueStruct>,
    signalId: SignalId,
    targetCell: LabEnvCell<TargetIn, ValueStruct, ValueStruct, ValueStruct>,
    options?: { keepHereToo: boolean },
  ) {
    const channel = new MessageChannel();
    sourceCell.pipeOutputSignal(signalId, [channel.port1], options);
    targetCell.pipeInputSignal(signalId, [channel.port2]);
    // TODO: keep track of channels between cells.
  }

  pipeStream<
    SourceOut extends ValueStruct,
    TargetIn extends ValueStruct,
    SignalId extends keyof SourceOut & keyof TargetIn & string,
  >(
    sourceCell: LabEnvCell<ValueStruct, ValueStruct, ValueStruct, SourceOut>,
    signalId: SignalId,
    targetCell: LabEnvCell<ValueStruct, TargetIn, ValueStruct, ValueStruct>,
    options?: { keepHereToo: boolean },
  ) {
    const channel = new MessageChannel();
    sourceCell.pipeOutputStream(signalId, [channel.port1], options);
    targetCell.pipeInputStream(signalId, [channel.port2]);
    // TODO: keep track of channels between cells.
  }
}
