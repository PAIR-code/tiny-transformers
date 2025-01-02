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

import { ValueStruct, CellKind, WorkerCellKind } from './cell-kind';
import { SignalSpace } from '../signalspace/signalspace';

import {
  CellController,
  LabEnvCellConfig,
  SomeCellController,
  InConnections,
} from './cell-controller';

// TODO: maybe define a special type of serializable
// object that includes things with a toSerialise function?

export class LabEnv {
  constructor(public space: SignalSpace) {}

  public runningCells: Set<SomeCellController> = new Set();

  init<
    I extends ValueStruct,
    IStreams extends ValueStruct,
    O extends ValueStruct,
    OStreams extends ValueStruct,
  >(
    kind: WorkerCellKind<I, IStreams, O, OStreams>,
    uses?: InConnections<I, IStreams> & { config?: Partial<LabEnvCellConfig> },
  ): CellController<I, IStreams, O, OStreams> {
    // ID should be unique w.r.t. the LabEnv.
    const id = (uses && uses.config && uses.config.id) || kind.cellKindId;
    const cell = new CellController(this, id, kind, uses);
    return cell;
  }

  start<
    I extends ValueStruct,
    IStreams extends ValueStruct,
    O extends ValueStruct,
    OStreams extends ValueStruct,
  >(
    kind: WorkerCellKind<I, IStreams, O, OStreams>,
    uses?: InConnections<I, IStreams> & { config?: Partial<LabEnvCellConfig> },
  ): CellController<I, IStreams, O, OStreams> {
    const cell = this.init(kind, uses);
    cell.start();
    return cell;
  }
}
