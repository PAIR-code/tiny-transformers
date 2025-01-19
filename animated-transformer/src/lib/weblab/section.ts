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

/**
 * A concept of a "Section" for experiments where each experiment is list of
 * sections. Sections can themselves be experiments too, markdown, executable
 * cells or other stuff. A section can be defined by:
 *
 *  - a reference to some existing section (meaning that we show the section at
 *    this point in the list),
 *  - a path section (meaning that we have to load data from the given path to
 *    get the data for that section), or
 *  - an inline object (meaning that the section's data is included directly in
 *    the experiment data as a subobject).
 *
 * Experiments and sections are also serialisable.
 *
 * Loading and saving and inverse. (e.g. save(load()) === identity).
 */

// ============================================================================

import { JsonValue } from 'src/lib/json/json';
import {
  AbstractSignal,
  DerivedSignal,
  SetableSignal,
  SignalSpace,
} from 'src/lib/signalspace/signalspace';
import { CellStatus, SomeCellController } from '../distr-signals/cell-controller';
import { CellKind, Kind, ValueKindFnStruct, ValueStruct } from '../distr-signals/cell-kind';
import { Experiment } from './experiment';
import { AbstractDataResolver } from './data-resolver';
import { Abs } from '@tensorflow/tfjs';

// ============================================================================

export enum SecDefKind {
  Ref = 'Ref',
  Path = 'Path',
  SectionList = 'SectionList',
  // Markdown = 'Markdown', // TODO: update to View, and then we provide a name for it...
  // JsonObj = 'JsonObj',
  // Cell to a remote worker. Powered by a CellController.
  WorkerCell = 'WorkerCell',
  // Local cell code, typically UI stuff.
  UiCell = 'LocalCell',
  // todo: add more...
}

export type SectionDisplay = {
  hidden?: boolean;
  collapsed?: boolean;
  initialLimittedHeightPx?: number;
};

export type SecDefByRef = {
  kind: SecDefKind.Ref;
  // This cell's ID.
  id: string;
  // Reference to other cell's ID.
  refId: string;
  display?: SectionDisplay;
};

export type SecDefByPath = {
  kind: SecDefKind.Path;
  id: string; // unclear if this should be here, or in the data?
  dataPath: string; // URI to a file containing ExpCellData.
  display?: SectionDisplay;
};

// export type SecDefOfJsonValue = {
//   kind: SecDefKind.JsonObj;
//   id: string;
//   timestamp: number;
//   // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
//   jsonValue: JsonValue;
//   // displayKind: ExpCellDisplayKind;
// };

// // TODO: update to be "View" of data.
// export type SecDefOfMarkdown = {
//   kind: SecDefKind.Markdown;
//   id: string;
//   timestamp: number;
//   // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
//   markdown: string;
//   // displayKind: ExpCellDisplayKind;
// };

// TODO: update to be "View" of data.
export type SecDefOfSecList = {
  kind: SecDefKind.SectionList;
  id: string;
  timestamp: number;
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  vsCodePathRoot?: string;
  subsections: SecDef[];
  display?: SectionDisplay;
  // displayKind: ExpCellDisplayKind;
};

//
export enum ViewerKind {
  MarkdownOutView = 'Markdown',
  JsonObjOutView = 'JsonObj',
}

export type SecDefOfUiView = {
  kind: SecDefKind.UiCell;
  id: string;
  timestamp: number;
  io: IOSectionContent;
  uiView: ViewerKind;
  display?: SectionDisplay;
};

export type SecDefOfWorker = {
  kind: SecDefKind.WorkerCell;
  id: string;
  timestamp: number;
  io: IOSectionContent;
  cellCodeRef: CellCodeRef;
  display?: SectionDisplay;
};

export type SecDefWithData = SecDefOfWorker | SecDefOfUiView | SecDefOfSecList;

// | SecDefOfMarkdown
// | SecDefOfJsonValue;

export type SecDef = SecDefWithData | SecDefByRef | SecDefByPath;

// ============================================================================

export type CellSectionInput = {
  sectionId: string;
  outputId: string;
};

// ============================================================================

export enum CellCodeRefKind {
  // Remote cell defined by the worker registry.
  UrlToCode = 'UrlToCode',
  // Worker cell defined by inline JS code.
  InlineWorkerJsCode = 'InlineWorkerJsCode',
  // Path to code that gets loaded into an ObjectURL and used from there.
  PathToWorkerCode = 'PathToWorkerCode',
}

export type CellCodeRef =
  | {
      kind: CellCodeRefKind.UrlToCode;
      jsUrl: string;
      tsSrcPath: string;
    }
  | {
      kind: CellCodeRefKind.InlineWorkerJsCode;
      js: string;
    }
  | {
      kind: CellCodeRefKind.PathToWorkerCode;
      tsSrcPath: string;
      jsPath: string;
    };

// ============================================================================

export type CellSectionOutput = {
  // Optionally, the last value. Allows restarting from previous computation.
  lastValue?: JsonValue;
  // True = values should be saved.
  saved: boolean;
};

export type IOSectionContent = {
  // How inputs to this cell map to either outputs from other cells, or raw
  // JsonObj values.
  inputs?: { [inputId: string]: CellSectionInput };
  // OutputIds to the last saved value (undefined when not yet defined)
  outputs?: { [outputId: string]: CellSectionOutput };
  inStreams?: { [inStreamId: string]: { cellSectionId: string; cellOutStreamId: string } };
  outStreamIds?: string[];
};

// ============================================================================

export type DistrSerialization<T, T2> = {
  data: T;
  subpathData?: { [path: string]: T2 };
};

// ============================================================================

export type SomeSection = Section<SecDefWithData, ValueStruct, ValueStruct>;

// ============================================================================

export enum CellSectionStatus {
  NotStarted = 'NotStarted',
  Running = 'Running',
  Finished = 'Finished',
  Static = 'Static',
}

export function cellIoForCellSection(c: SecDefOfWorker | SecDefOfUiView): {
  inputs: ValueKindFnStruct;
  outputs: ValueKindFnStruct;
  inStreams: ValueKindFnStruct;
  outStreams: ValueKindFnStruct;
} {
  const inputs: ValueKindFnStruct = {};
  for (const k of Object.keys(c.io.inputs || {})) {
    inputs[k] = Kind<unknown>;
  }
  const inStreams: ValueKindFnStruct = {};
  for (const [k, _] of Object.entries(c.io.inStreams || {})) {
    inStreams[k] = Kind<unknown>;
  }
  const outputs: ValueKindFnStruct = {};
  for (const k of Object.keys(c.io.outputs || {})) {
    outputs[k] = Kind<unknown>;
  }
  const outStreams: ValueKindFnStruct = {};
  for (const k of c.io.outStreamIds || []) {
    outStreams[k] = Kind<unknown>;
  }
  return { inputs, inStreams, outputs, outStreams };
}

export type SectionCellData = {
  controller: SomeCellController;
  cellCodeCache: string; // the string of the code...
  cellObjectUrl: string; // url of Object URL to allow cleanup.
};

// ============================================================================

export class Section<
  DataKind extends SecDefWithData,
  I extends ValueStruct,
  O extends ValueStruct,
> {
  // References to this section.
  references: Set<SomeSection> = new Set();
  status: CellSectionStatus = CellSectionStatus.NotStarted;

  // this.data().sectionData.sectionKind === SectionKind.Subsections
  subSections?: SetableSignal<SomeSection[]>;

  // this.data().sectionData.sectionKind === SectionKind.Cell

  // Consider: this may not be needed if we manage data via disposing the
  // content/data signals in some other way, e.g. with an environment dispose
  // operation? To think about.
  dataUpdateDeps: AbstractSignal<void>[] = [];

  // This is how UI code interacts with a section.
  inputs = {} as { [Key in keyof I]: AbstractSignal<I[Key] | null> };
  outputs = {} as { [Key in keyof O]: SetableSignal<O[Key] | null> };

  space: SignalSpace;

  constructor(
    public experiment: Experiment,
    // Note: SecDef can be a reference or path, and it's data() value will then
    // be the referenced sections data, or if it's a path, it will be the data
    // resolved from reading that path.
    public def: SecDef,
    public data: SetableSignal<DataKind>,
    public cell?: SectionCellData,
  ) {
    this.space = this.experiment.space;
    this.def.display = this.def.display || {};

    const content = this.data();
    switch (content.kind) {
      case SecDefKind.SectionList:
        this.subSections = this.space.setable<SomeSection[]>([]);
        break;
      case SecDefKind.WorkerCell:
        this.initOutputs();
        this.status = CellSectionStatus.NotStarted;
        break;
      case SecDefKind.UiCell:
        this.initOutputs();
        this.status = CellSectionStatus.Static;
        break;
      default:
        this.status = CellSectionStatus.Static;
    }
  }

  initOutputs() {
    const data = this.data();
    const secKind = data.kind;
    if (secKind !== SecDefKind.WorkerCell && secKind !== SecDefKind.UiCell) {
      console.warn(`initOutputs called on non-worker or Ui section (called ${secKind}).`);
      return;
    }

    for (const k of Object.keys(data.io.outputs || {})) {
      this.outputs[k as never as keyof O] = this.space.setable(null);
    }

    for (const [outputId, cellOutputRef] of Object.entries(data.io.outputs || [])) {
      if (cellOutputRef.saved) {
        const outputs = data.io.outputs as {
          [outputId: string]: CellSectionOutput;
        };
        if (this.cell && secKind === SecDefKind.WorkerCell) {
          const controller = this.cell.controller;
          for (const k of Object.keys(controller.outputs)) {
            controller.outputs[k].recEnd.onceReady.then((v) =>
              this.experiment.space.derived(() => this.outputs[k].set(v())),
            );
          }
        } else if (!this.cell && secKind === SecDefKind.UiCell) {
          this.outputs[outputId as keyof O].set(cellOutputRef.lastValue as O[keyof O]);
          // Propegate changes to the output setable to the broader content object.
          // TODO: think about tracking this dep to cleanup later?
        } else {
          console.warn(`Strange state: ${secKind} and cell state (${!!this.cell})`);
          return;
        }
        this.space.derived(() => {
          const newOutput = this.outputs[outputId as keyof O]();
          this.data.change((c) => {
            outputs[outputId].lastValue = newOutput;
          });
        });
      }
    }
  }

  // This happens after construction, but before connecting cells.
  connectInputsFromOutputs() {
    const data = this.data();
    const secKind = data.kind;
    if (secKind !== SecDefKind.WorkerCell && secKind !== SecDefKind.UiCell) {
      return;
    }

    for (const [inputId, cellInputRef] of Object.entries(data.io.inputs || {})) {
      const otherSec = this.experiment.getSection(cellInputRef.sectionId);
      this.inputs[inputId as keyof I] = otherSec.outputs[cellInputRef.outputId];
    }
  }

  // Connect the cell in this section to it's inputs/outputs in the experiment.
  connectWorkerCell() {
    const data = this.data();
    if (this.status !== CellSectionStatus.NotStarted) {
      throw new Error(`Cell (${data.id}): Can only start a connect a not-started cell`);
    }
    if (!this.cell || data.kind !== SecDefKind.WorkerCell) {
      throw new Error(`Cell (${data.id}): Can only connect a section with a cell`);
    }
    for (const [inputId, cellInputRef] of Object.entries(data.io.inputs || {})) {
      // TODO: this is where magic dep-management could happen... we could use
      // old input value as the input here, so that we don't need to
      // re-execute past cells. Would need think about what to do with
      // streams. Likely depends on cell semantics some. e.g. deterministic
      // cells with no streams are clearly fine. Streams might need some kind
      // of saved state of the stream. (which StateIter abstraction has!)
      const otherSection = this.experiment.getSection(cellInputRef.sectionId);
      if (otherSection.data().kind === SecDefKind.WorkerCell) {
        if (!otherSection.cell) {
          throw Error(`Worker Cell Section (${cellInputRef.sectionId}) was missing cell property`);
        }
        otherSection.cell.controller.outputs[cellInputRef.outputId].addPipeTo(
          this.cell.controller.inputs[inputId],
        );
      } else {
        const thisInputSignal = this.cell.controller.inputs[inputId].connect();
        this.space.derived(() =>
          thisInputSignal.set(otherSection.outputs[cellInputRef.outputId]()),
        );
      }
    }
    for (const [inStreamId, cellInputRef] of Object.entries(data.io.inStreams || {})) {
      const otherCellController = this.experiment.getSectionLabCell(cellInputRef.cellSectionId);
      otherCellController.outStreams[cellInputRef.cellOutStreamId].addPipeTo(
        this.cell.controller.inStreams[inStreamId],
      );
    }
  }

  async startWorker() {
    const data = this.data();
    if (this.status !== CellSectionStatus.NotStarted) {
      throw new Error(`Cell (${data.id}): Can only start a connect a not-started cell`);
    }
    if (!this.cell || data.kind !== SecDefKind.WorkerCell) {
      throw new Error(`Cell (${data.id}): Can only connect a section with a cell`);
    }

    this.cell.controller.startWithWorker(new Worker(new URL(this.cell.cellObjectUrl)));
  }

  serialise(subpathData: { [path: string]: SecDefWithData }): SecDef {
    switch (this.def.kind) {
      case SecDefKind.Ref:
        return this.def;
      case SecDefKind.Path:
        // Note: paths must always go to SecDefWithData, i.e. UiCell or WorkerCell.
        subpathData[this.def.dataPath] = this.data();
        return this.def;
      case SecDefKind.SectionList:
        if (!this.subSections) {
          throw new Error(`(${this.def.id}) serialise SectionList lacks sections.`);
        }
        const subSectionDefs = this.subSections().map((section) => section.serialise(subpathData));
        return { ...this.def, subsections: subSectionDefs };
      case SecDefKind.UiCell:
      case SecDefKind.WorkerCell:
        return this.data();
    }
  }

  dispose() {
    if (this.cell) {
      URL.revokeObjectURL(this.cell.cellObjectUrl);
      const status = this.cell.controller.status();
      if (
        status === CellStatus.Running ||
        status === CellStatus.StartingWaitingForInputs ||
        status === CellStatus.Stopping
      ) {
        this.cell.controller.forceStop();
      }
      delete this.cell;
    }
    for (const dep of this.dataUpdateDeps) {
      dep.node.dispose();
    }
    // TODO: remove the now un-needed derivedLazy dep.
  }
}
