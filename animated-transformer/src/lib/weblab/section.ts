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
import { SomeLabEnvCell } from '../distr-signal-exec/lab-env-cell';
import { LabEnv } from '../distr-signal-exec/lab-env';
import {
  CellKind,
  Kind,
  SomeCellKind,
  ValueKindFnStruct,
  ValueStruct,
} from '../distr-signal-exec/cell-types';
import { ExpDefKind, Experiment } from './experiment';
import {
  AbstractSignalReceiveEnd,
  AbstractStreamReceiveEnd,
  AbstractSignalSendEnd,
  AbstractStreamSendEnd,
} from '../distr-signal-exec/signal-messages';

export enum SectionKind {
  SubExperiment = 'SubExperiment',
  Markdown = 'Markdown',
  JsonObj = 'JsonObj',
  Cell = 'Cell',
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
      cellOutSignalId: string;
    };

export enum CellRefKind {
  Registry = 'Registry',
  Url = 'Url',
}

export type cellRefKind =
  | {
      kind: CellRefKind.Registry;
      registryCellKindId: string;
    }
  | {
      kind: CellRefKind.Url;
      url: string;
    };

export type CellSectionContent = {
  // ID of the cell, to lookup from a table of registered cell kinds.
  cellRef: cellRefKind;
  // How inputs to this cell map to either outputs from other cells, or raw
  // JsonObj values.
  inputs: { [inputId: string]: CellSectionInput };
  // Names of the outputs for
  outputIds: string[];
  inStreams: { [inStreamId: string]: { cellSectionId: string; cellOutStreamId: string } };
  outStreamIds: string[];
};

function cellKindFromContent(
  c: CellSectionContent,
  registry: Map<string, SomeCellKind>,
  sectionId: string,
): SomeCellKind {
  const cRef = c.cellRef;
  if (cRef.kind === CellRefKind.Registry) {
    const cellKind = registry.get(cRef.registryCellKindId);
    if (!cellKind) {
      throw new Error(`No such cellkind id: ${cRef.registryCellKindId}`);
    }
    return cellKind;
  } else if (cRef.kind === CellRefKind.Url) {
    const url = cRef.url;
    const inputs: ValueKindFnStruct = {};
    for (const [k, _] of Object.entries(c.inputs)) {
      inputs[k] = Kind<unknown>;
    }
    const inStreams: ValueKindFnStruct = {};
    for (const [k, _] of Object.entries(c.inStreams)) {
      inStreams[k] = Kind<unknown>;
    }
    const outputs: ValueKindFnStruct = {};
    for (const k of c.outputIds) {
      outputs[k] = Kind<unknown>;
    }
    const outStreams: ValueKindFnStruct = {};
    for (const k of c.outStreamIds) {
      outStreams[k] = Kind<unknown>;
    }
    return new CellKind({
      cellKindId: sectionId,
      workerFn: () => new Worker(url),
      inputs,
      inStreams,
      outputs,
      outStreams,
    });
  } else {
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
  sectionKind: SectionKind.Cell;
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
  inputs: { [Key in keyof I]: AbstractSignal<I[Key]> | AbstractSignalReceiveEnd<I[Key]> };
  // Note: From the section's view, streams being given in must be coming out of
  // the somewhere else.
  inStream: {
    [Key in keyof IStream]: AbstractStreamSendEnd<IStream[Key]>;
  };
  // Note: outputs are possible inputs to other places.
  outputs: {
    [Key in keyof O]: AbstractSignalReceiveEnd<O[Key]>;
  };
  outStream: {
    [Key in keyof OStream]: AbstractStreamReceiveEnd<OStream[Key]>;
  };
};

export const EmptyInterface = {
  inputs: {},
  outputs: {},
  inStream: {},
  outStream: {},
};

export type SomeSectionInterface = SectionInterface<
  ValueStruct,
  ValueStruct,
  ValueStruct,
  ValueStruct
>;

// ============================================================================
// CONSIDER: Have a few different kinds of sections, one for cells, etc.
export abstract class AbstractSection<
  I extends ValueStruct,
  IStream extends ValueStruct,
  O extends ValueStruct,
  OStream extends ValueStruct,
> {
  // The experiment this section is part of.
  abstract experiment: Experiment;

  // Any other sections in the experiment that reference this one.
  public references: Set<Section> = new Set();

  // The definition data.
  abstract def: SectionDef;

  // The Section data (loaded from path of def, or dereferenced), including
  // meta-data.
  abstract data: SetableSignal<SectionDataDef>;
  // The content part of the data.
  abstract content: SetableSignal<ContentOf<SomeSectionData>>;

  abstract interface: SectionInterface<I, IStream, O, OStream>;

  abstract serialise(): DistrSerialization<SectionDef, SectionDataDef>;
}

// ============================================================================
// CONSIDER: Have a few different kinds of sections, one for cells, etc.
export class Section {
  // References to this section.
  references: Set<Section> = new Set();
  status: CellSectionStatus;

  // this.data().sectionData.sectionKind === SectionKind.SubExperiment
  subExperiment?: Experiment;

  // this.data().sectionData.sectionKind === SectionKind.Cell
  cell?: SomeLabEnvCell;

  // Consider: this may not be needed if we manage data via disposing the
  // content/data signals in some other way, e.g. with an environment dispose
  // operation? To think about.
  dataUpdateDep: DerivedSignal<void>;

  // interface: SomeSectionInterface;

  constructor(
    public experiment: Experiment,
    public def: SectionDef,
    public data: SetableSignal<SectionDataDef>,
    public content: SetableSignal<ContentOf<SomeSectionData>>,
  ) {
    // Consider if this needs to be a dynamic signal.
    if (this.data().sectionData.sectionKind === SectionKind.Cell) {
      // this.status === CellSectionStatus.NotStarted ==> content(): CellSectionContent
      this.status = CellSectionStatus.NotStarted;
      const contentAsCellKind: CellSectionContent = this.content() as CellSectionContent;
      const cellKind = cellKindFromContent(contentAsCellKind, experiment.cellRegistry, this.def.id);
      this.cell = this.experiment.env.init(cellKind);
      // this.interface = this.cell;
    } else {
      this.status = CellSectionStatus.Static;
      // if (this.data().sectionData.sectionKind === SectionKind.JsonObj) {
      //   const content: AbstractSignal<JsonValue> = this.content as AbstractSignal<JsonValue>;
      //   this.interface = {
      //     inputs: {},
      //     outputs: { jsonObj: { onceReady: Promise.resolve(content) } },
      //     inStream: {},
      //     outStream: {},
      //   };
      // } else {
      //   this.interface = EmptyInterface
      // }
    }

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
        this.cell.assignInputFromSignal(inputId, jsonObjSignal);
      } else if (cellInputRef.kind === CellSectionInputKind.FromCellOutput) {
        const secLabCell = this.experiment.getSectionLabCell(cellInputRef.cellSectionId);
        this.cell.assignInputViaPiping(inputId, secLabCell.outputs[cellInputRef.cellOutSignalId]);
      } else {
        throw Error(`Unknown CellSectionInput (${inputId}): ${JSON.stringify(cellInputRef)}`);
      }
    }
    for (const [inputId, cellInputRef] of Object.entries(contentAsCellKind.inStreams)) {
      const secLabCell = this.experiment.getSectionLabCell(cellInputRef.cellSectionId);
      this.cell.assignInStreamViaPiping(
        inputId,
        secLabCell.outStreams[cellInputRef.cellOutStreamId],
      );
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
