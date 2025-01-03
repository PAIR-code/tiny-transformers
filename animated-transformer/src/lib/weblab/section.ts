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

import { JsonValue } from 'src/lib/json/json';
import {
  AbstractSignal,
  DerivedSignal,
  SetableSignal,
  SignalSpace,
} from 'src/lib/signalspace/signalspace';
import { AbstractDataResolver } from './data-resolver';
import { SomeCellController } from '../distr-signal-exec/cell-controller';
import { LabEnv } from '../distr-signal-exec/lab-env';
import {
  CellKind,
  Kind,
  SomeCellKind,
  SomeWorkerCellKind,
  ValueKindFnStruct,
  ValueStruct,
  WorkerCellKind,
} from '../distr-signal-exec/cell-kind';
import { ExpDefKind, Experiment } from './experiment';
import { SignalSender, StreamReceiver, StreamSender } from '../distr-signal-exec/channels';
import { input } from '@angular/core';

export enum SectionKind {
  SubExperiment = 'SubExperiment',
  Markdown = 'Markdown',
  JsonObj = 'JsonObj',
  // Cell to a remote worker. Powered by a CellController.
  WorkerCell = 'WorkerCell',
  // Local cell code, typically UI stuff.
  LocalCell = 'LocalCell',
  // todo: add more...
}

export enum CellSectionInputKind {
  FromJsonSection = 'FromJsonSection',
  FromCellOutput = 'FromCellOutput',
}

export type CellSectionInput =
  | {
      kind: CellSectionInputKind.FromJsonSection;
      sectionId: string;
    }
  | {
      kind: CellSectionInputKind.FromCellOutput;
      cellSectionId: string;
      cellChannelId: string;
    };

export enum CellRefKind {
  // Remote cell defined by the worker registry.
  WorkerRegistry = 'WorkerRegistry',
  // Worker cell defined by inline JS code.
  InlineWorkerJsCode = 'InlineWorkerJsCode',
  // There is no "remote cell", UI manages the input/output stuff.
  Local = 'Local',
}

export type cellRefKind =
  | {
      kind: CellRefKind.WorkerRegistry;
      registryCellKindId: string;
    }
  | {
      kind: CellRefKind.InlineWorkerJsCode;
      js: string;
    }
  | {
      kind: CellRefKind.InlineWorkerJsCode;
      js: string;
    };

export enum CellSectionOutputKind {
  Undefined = 'Undefined',
  Defined = 'Defined',
}

export type CellSectionOutput = {
  // Optionally, the last value. Allows restarting from previous computation.
  lastValue?: JsonValue;
  // True = values should be saved.
  saved: boolean;
};

export type CellSectionContent = {
  // ID of the cell, to lookup from a table of registered cell kinds.
  cellRef: cellRefKind;
  // How inputs to this cell map to either outputs from other cells, or raw
  // JsonObj values.
  inputs: { [inputId: string]: CellSectionInput };
  // OutputIds to the last saved value (undefined when not yet defined)
  outputIds: { [outputId: string]: CellSectionOutput };
  inStreams: { [inStreamId: string]: { cellSectionId: string; cellOutStreamId: string } };
  outStreamIds: string[];
};

function cellKindFromContent(
  c: CellSectionContent,
  registry: Map<string, SomeWorkerCellKind>,
  sectionId: string,
): SomeWorkerCellKind {
  const cRef = c.cellRef;
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
      for (const k of Object.keys(c.inputs)) {
        inputs[k] = Kind<unknown>;
      }
      const inStreams: ValueKindFnStruct = {};
      for (const [k, _] of Object.entries(c.inStreams)) {
        inStreams[k] = Kind<unknown>;
      }
      const outputs: ValueKindFnStruct = {};
      for (const k of Object.keys(c.outputIds)) {
        outputs[k] = Kind<unknown>;
      }
      const outStreams: ValueKindFnStruct = {};
      for (const k of c.outStreamIds) {
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
    default:
      throw new Error(`No such cell ref kind: ${JSON.stringify(cRef)}`);
  }
}

export type SectionData<Kind extends SectionKind, T> = {
  sectionKind: Kind;
  content: T;
};

export type JsonSectionData = {
  sectionKind: SectionKind.JsonObj;
  content: JsonValue;
};

export type MarkdownSectionData = {
  sectionKind: SectionKind.Markdown;
  content: string;
};

export type SubExpSectionData = {
  sectionKind: SectionKind.SubExperiment;
  content: SectionDef[];
};

export type CellSectionData = {
  sectionKind: SectionKind.WorkerCell;
  content: CellSectionContent;
};

export type SomeSectionData =
  | JsonSectionData
  | MarkdownSectionData
  | SubExpSectionData
  | CellSectionData;

type ContentOf<T extends SomeSectionData> = T['content'];

export type SectionRefDef = {
  kind: ExpDefKind.Ref;
  id: string;
  refId: string;
};

export type SectionPathDef = {
  kind: ExpDefKind.Path;
  id: string; // unclear if this should be here, or in the data?
  dataPath: string; // URI to a file containing ExpCellData.
};

export type SectionDataDef = {
  kind: ExpDefKind.Data;
  id: string;
  timestamp: number;
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  sectionData: SomeSectionData;
  // displayKind: ExpCellDisplayKind;
};

export type ExpSectionDataDef = SectionDataDef & {
  sectionData: SubExpSectionData;
};

export type CellSectionDataDef = SectionDataDef & {
  sectionData: CellSectionData;
};

export type SectionDef = SectionRefDef | SectionPathDef | SectionDataDef;

export type DistrSerialization<T, T2> = {
  data: T;
  subpathData?: { [path: string]: T2 };
};

export enum CellSectionStatus {
  NotStarted = 'NotStarted',
  Running = 'Running',
  Finished = 'Finished',
  Static = 'Static',
}

export type SectionInterface<
  I extends ValueStruct,
  IStream extends ValueStruct,
  O extends ValueStruct,
  OStream extends ValueStruct,
> = {
  // Inputs to this section are inputs from somewhere else, or a signal value.
  inputs: { [Key in keyof I]: Promise<AbstractSignal<I[keyof I]>> };
  // Note: From the section's view, streams being given in must be coming out of
  // the somewhere else.
  inStream: {
    [Key in keyof IStream]: StreamReceiver<IStream[Key]>;
  };
  // Note: outputs are possible inputs to other places.
  outputs: {
    [Key in keyof O]: SignalSender<O[Key]>;
  };
  outStream: {
    [Key in keyof OStream]: StreamSender<OStream[Key]>;
  };
};

export type SomeSectionInterface = SectionInterface<
  ValueStruct,
  ValueStruct,
  ValueStruct,
  ValueStruct
>;

export function emptyInterface(): SomeSectionInterface {
  return {
    inputs: {},
    outputs: {},
    inStream: {},
    outStream: {},
  };
}

// // ============================================================================
// // CONSIDER: Have a few different kinds of sections, one for cells, etc.
// export abstract class AbstractSection<
//   I extends ValueStruct,
//   IStream extends ValueStruct,
//   O extends ValueStruct,
//   OStream extends ValueStruct,
// > {
//   // The experiment this section is part of.
//   abstract experiment: Experiment;

//   // Any other sections in the experiment that reference this one.
//   public references: Set<Section> = new Set();

//   // The definition data.
//   abstract def: SectionDef;

//   // The Section data (loaded from path of def, or dereferenced), including
//   // meta-data.
//   abstract data: SetableSignal<SectionDataDef>;
//   // The content part of the data.
//   abstract content: SetableSignal<ContentOf<SomeSectionData>>;

//   abstract interface: SectionInterface<I, IStream, O, OStream>;

//   abstract serialise(): DistrSerialization<SectionDef, SectionDataDef>;
// }

function interfaceFromCell(cell: SomeCellController): SomeSectionInterface {
  return emptyInterface();
}

export type SomeSection = Section<ValueStruct, ValueStruct>;

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
  dataUpdateDep: DerivedSignal<void>;

  // This is how UI code interacts with a section.
  inputs = {} as {
    [Key in keyof I]: AbstractSignal<I[Key]>;
  };
  outputs = {} as {
    [Key in keyof O]: SetableSignal<O[Key]>;
  };

  constructor(
    public experiment: Experiment,
    public def: SectionDef,
    public data: SetableSignal<SectionDataDef>,
    public content: SetableSignal<ContentOf<SomeSectionData>>,
  ) {
    switch (this.data().sectionData.sectionKind) {
      case SectionKind.WorkerCell:
        {
          // this.status === CellSectionStatus.NotStarted ==> content(): CellSectionContent
          this.status = CellSectionStatus.NotStarted;
          const contentAsCellKind: CellSectionContent = this.content() as CellSectionContent;
          const cellKind = cellKindFromContent(
            contentAsCellKind,
            experiment.cellRegistry,
            this.def.id,
          );
          this.cell = this.experiment.env.init(cellKind);

          // this.interface = this.cell;
        }
        break;
      default:
        this.status = CellSectionStatus.Static;
    }

    //

    // Note: assumes that this.data is made up of it's parts, and not the parts
    // are made from the overall data object.
    this.dataUpdateDep = data.space.derived(() => {
      const curContent = this.content();
      const f = (oldData: SectionDataDef) => (oldData.sectionData.content = curContent);
      this.data.change(f);
    });
  }

  // Connect the cell in this section to it's inputs/outputs in the experiment.
  connectCell() {
    if (this.status !== CellSectionStatus.NotStarted) {
      throw new Error('Can only start a connect a not-started cell');
    }
    if (!this.cell) {
      throw new Error('Can only connect a section with a cell');
    }
    // this.status === CellSectionStatus.NotStarted ==> content(): CellSectionContent
    const contentAsCellKind: CellSectionContent = this.content() as CellSectionContent;
    for (const [inputId, cellInputRef] of Object.entries(contentAsCellKind.inputs)) {
      if (cellInputRef.kind === CellSectionInputKind.FromJsonSection) {
        const jsonObjSignal = this.experiment.getJsonSectionContent(cellInputRef.sectionId);
        const sender = this.cell.inputs[inputId].connect();
        this.experiment.space.derived(() => sender.set(jsonObjSignal()));
        this.inputs[inputId as keyof I] = jsonObjSignal as I[keyof I];
        // TODO: think about if we need to disconnect this?
      } else if (cellInputRef.kind === CellSectionInputKind.FromCellOutput) {
        const otherSec = this.experiment.getSection(cellInputRef.cellSectionId);
        this.inputs[inputId as keyof I] = otherSec.outputs[cellInputRef.cellChannelId];
        const cellController = this.experiment.getSectionLabCell(cellInputRef.cellSectionId);
        cellController.outputs[cellInputRef.cellChannelId].addPipeTo(this.cell.inputs[inputId]);
      } else {
        throw Error(`Unknown CellSectionInput (${inputId}): ${JSON.stringify(cellInputRef)}`);
      }
    }
    for (const [inputId, cellInputRef] of Object.entries(contentAsCellKind.inStreams)) {
      const secLabCell = this.experiment.getSectionLabCell(cellInputRef.cellSectionId);
      secLabCell.outStreams[cellInputRef.cellOutStreamId].addPipeTo(this.cell.inStreams[inputId]);
    }
    for (const [outputId, cellOutputRef] of Object.entries(contentAsCellKind.outputIds)) {
      if (cellOutputRef.saved) {
        this.outputs[outputId as keyof O] = this.experiment.space.setable(
          cellOutputRef.lastValue as O[keyof O],
        );
      }
    }
  }

  serialise(): DistrSerialization<SectionDef, SectionDataDef> {
    if (this.def.kind === ExpDefKind.Ref) {
      return { data: this.def };
    } else if (this.def.kind === ExpDefKind.Path) {
      const subpathData = {} as { [path: string]: SectionDataDef };
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
    this.dataUpdateDep.node.dispose();
    // TODO: remove the now un-needed derivedLazy dep.
  }
}
