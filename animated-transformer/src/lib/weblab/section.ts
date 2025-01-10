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
import { SomeCellController } from '../distr-signal-exec/cell-controller';
import {
  Kind,
  SomeWorkerCellKind,
  ValueKindFnStruct,
  ValueStruct,
  WorkerCellKind,
} from '../distr-signal-exec/cell-kind';
import { Experiment } from './experiment';
import { SignalSender, StreamReceiver, StreamSender } from '../distr-signal-exec/channels';

// ============================================================================

export enum SecDefKind {
  Ref = 'Ref',
  Path = 'Path',
  Experiment = 'SubExperiment',
  // Markdown = 'Markdown', // TODO: update to View, and then we provide a name for it...
  // JsonObj = 'JsonObj',
  // Cell to a remote worker. Powered by a CellController.
  WorkerCell = 'WorkerCell',
  // Local cell code, typically UI stuff.
  UiCell = 'LocalCell',
  // todo: add more...
}

export type SecDefByRef = {
  kind: SecDefKind.Ref;
  // This cell's ID.
  id: string;
  // Reference to other cell's ID.
  refId: string;
};

export type SecDefByPath = {
  kind: SecDefKind.Path;
  id: string; // unclear if this should be here, or in the data?
  dataPath: string; // URI to a file containing ExpCellData.
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
export type SecDefOfExperiment = {
  kind: SecDefKind.Experiment;
  id: string;
  timestamp: number;
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  subsections: SecDef[];
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
};

export type SecDefOfWorker = {
  kind: SecDefKind.WorkerCell;
  id: string;
  timestamp: number;
  io: IOSectionContent;
  cellCodeRef: CellCodeRef;
};

export type SecDefWithData = SecDefOfWorker | SecDefOfUiView | SecDefOfExperiment;
// | SecDefOfMarkdown
// | SecDefOfJsonValue;

export type SecDef = SecDefWithData | SecDefByRef | SecDefByPath;

// ============================================================================

export type CellSectionInput = {
  cellSectionId: string;
  cellChannelId: string;
};

// ============================================================================

export enum CellRefKind {
  // Remote cell defined by the worker registry.
  WorkerRegistry = 'WorkerRegistry',
  // Worker cell defined by inline JS code.
  InlineWorkerJsCode = 'InlineWorkerJsCode',
  // Path to code that gets loaded into an ObjectURL and used from there.
  PathToWorkerCode = 'PathToWorkerCode',
  // There is no "remote cell", UI manages the input/output stuff.
  LocalUi = 'LocalUi',
}

export type CellCodeRef =
  | {
      kind: CellRefKind.WorkerRegistry;
      registryCellKindId: string;
    }
  | {
      kind: CellRefKind.InlineWorkerJsCode;
      js: string;
    }
  | {
      kind: CellRefKind.PathToWorkerCode;
      path: string;
    }
  | {
      kind: CellRefKind.LocalUi;
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

function cellKindFromContent(
  c: SecDefOfWorker,
  registry: Map<string, SomeWorkerCellKind>,
  sectionId: string,
): SomeWorkerCellKind {
  const cRef = c.cellCodeRef;
  switch (cRef.kind) {
    case CellRefKind.WorkerRegistry: {
      const cellKind = registry.get(cRef.registryCellKindId);
      if (!cellKind) {
        throw new Error(`No such cellkind id: ${cRef.registryCellKindId}`);
      }
      return cellKind;
    }
    case CellRefKind.InlineWorkerJsCode: {
      const blob = new Blob([cRef.js], { type: 'application/javascript' });
      // TODO: think about cleanup... need to track and dispose of this when code
      // is no longer linked to a cell.
      const url = URL.createObjectURL(blob);
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
      return new WorkerCellKind(
        sectionId,
        {
          inputs,
          inStreams,
          outputs,
          outStreams,
        },
        () => new Worker(url),
      );
    }
    // case CellRefKind.PathToWorkerCode: {

    // }
    default:
      throw new Error(`No such cell ref kind: ${JSON.stringify(cRef)}`);
  }
}

// ============================================================================
//
// ============================================================================

export type SomeSection = Section<ValueStruct, ValueStruct>;

// ============================================================================

export enum CellSectionStatus {
  NotStarted = 'NotStarted',
  Running = 'Running',
  Finished = 'Finished',
  Static = 'Static',
}

// ============================================================================
// CONSIDER: Have a few different kinds of sections, one for cells, etc.
export class Section<I extends ValueStruct, O extends ValueStruct> {
  // References to this section.
  references: Set<SomeSection> = new Set();
  status: CellSectionStatus;

  // this.data().sectionData.sectionKind === SectionKind.SubExperiment
  subExperiment?: Experiment;

  // this.data().sectionData.sectionKind === SectionKind.Cell
  cell?: SomeCellController;

  // Consider: this may not be needed if we manage data via disposing the
  // content/data signals in some other way, e.g. with an environment dispose
  // operation? To think about.
  dataUpdateDeps: AbstractSignal<void>[] = [];

  // This is how UI code interacts with a section.
  inputs = {} as {
    [Key in keyof I]: AbstractSignal<I[Key]>;
  };
  outputs = {} as {
    [Key in keyof O]: SetableSignal<O[Key]>;
  };

  space: SignalSpace;

  constructor(
    public experiment: Experiment,
    public def: SecDef,
    public data: SetableSignal<SecDefWithData>,
  ) {
    this.space = this.experiment.space;

    const content = this.data();
    switch (content.kind) {
      case SecDefKind.WorkerCell:
        {
          this.status = CellSectionStatus.NotStarted;
          const cellKind = cellKindFromContent(content, experiment.cellRegistry, this.def.id);
          this.cell = this.experiment.env.init(cellKind);
        }
        break;
      default:
        this.status = CellSectionStatus.Static;
    }
  }

  // This happens after construction, but before connecting cells.
  initInputOutputValues() {
    const data = this.data();
    const secKind = data.kind;
    if (secKind !== SecDefKind.WorkerCell && secKind !== SecDefKind.UiCell) {
      return;
    }
    for (const [outputId, cellOutputRef] of Object.entries(data.io.outputs || [])) {
      if (cellOutputRef.saved) {
        const outputs = data.io.outputs as {
          [outputId: string]: CellSectionOutput;
        };
        const output = this.space.setable(cellOutputRef.lastValue as O[keyof O]);
        this.outputs[outputId as keyof O] = output;
        // Propegate changes to the output setable to the broader content object.
        // TODO: think about tracking this dep to cleanup later?
        this.space.derived(() => {
          const newOutput = output();
          this.data.change((c) => {
            outputs[outputId] = newOutput;
          });
        });
      }
    }

    for (const [inputId, cellInputRef] of Object.entries(data.io.inputs || {})) {
      const otherSec = this.experiment.getSection(cellInputRef.cellSectionId);
      this.inputs[inputId as keyof I] = otherSec.outputs[cellInputRef.cellChannelId];
    }
  }

  // Connect the cell in this section to it's inputs/outputs in the experiment.
  connectWorkerCell() {
    const data = this.data();
    if (this.status !== CellSectionStatus.NotStarted) {
      throw new Error('Can only start a connect a not-started cell');
    }
    if (!this.cell || data.kind !== SecDefKind.WorkerCell) {
      throw new Error('Can only connect a section with a cell');
    }
    for (const [inputId, cellInputRef] of Object.entries(data.io.inputs || {})) {
      // TODO: this is where magic dep-management could happen... we could use
      // old input value as the input here, so that we don't need to
      // re-execute past cells. Would need think about what to do with
      // streams. Likely depends on cell semantics some. e.g. deterministic
      // cells with no streams are clearly fine. Streams might need some kind
      // of saved state of the stream. (which StateIter abstraction has!)
      const otherCellController = this.experiment.getSectionLabCell(cellInputRef.cellSectionId);
      otherCellController.outputs[cellInputRef.cellChannelId].addPipeTo(this.cell.inputs[inputId]);
    }
    for (const [inStreamId, cellInputRef] of Object.entries(data.io.inStreams || {})) {
      const otherCellController = this.experiment.getSectionLabCell(cellInputRef.cellSectionId);
      otherCellController.outStreams[cellInputRef.cellOutStreamId].addPipeTo(
        this.cell.inStreams[inStreamId],
      );
    }
  }

  serialise(): DistrSerialization<SecDef, SecDefWithData> {
    if (this.def.kind === SecDefKind.Ref) {
      return { data: this.def };
    } else if (this.def.kind === SecDefKind.Path) {
      const subpathData = {} as { [path: string]: SecDefWithData };
      subpathData[this.def.dataPath] = this.data();
      return {
        data: this.def,
        subpathData,
      };
    } else {
      // this.def.kind === ExpDefKind.Data
      if (this.subExperiment) {
        return this.subExperiment.serialise();
      } else {
        return {
          data: this.data(),
        };
      }
    }
  }

  dispose() {
    for (const dep of this.dataUpdateDeps) {
      dep.node.dispose();
    }
    // TODO: remove the now un-needed derivedLazy dep.
  }
}
