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
import { DerivedSignal, SetableSignal, SignalSpace } from 'src/lib/signalspace/signalspace';
import { AbstractDataResolver } from '../distr-signal-exec/data-resolver';
import { SomeLabEnvCell } from '../distr-signal-exec/lab-env-cell';
import { LabEnv } from '../distr-signal-exec/lab-env';
import { SomeCellKind } from '../distr-signal-exec/cell-types';
import { ExpDefKind, Experiment } from './experiment';

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

export type CellSectionContent = {
  // ID of the cell, to lookup from a table of registered cell kinds.
  cellRef: string;
  // How inputs to this cell map to either outputs from other cells, or raw
  // JsonObj values.
  inputs: { [inputId: string]: CellSectionInput };
  // Names of the outputs for
  outputIds: string[];
  inStreams: { [inStreamId: string]: { cellId: string; cellOutStreamId: string } };
  outStreamIds: string[];
};

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

// ============================================================================
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

  constructor(
    public experiment: Experiment,
    public def: SectionDef,
    public data: SetableSignal<SectionDataDef>,
    public content: SetableSignal<ContentOf<SomeSectionData>>,
  ) {
    // Consider if this needs to be a dynamic signal.
    if (this.data().sectionData.sectionKind === SectionKind.Cell) {
      this.status = CellSectionStatus.NotStarted;
      this.cell = this.experiment.env.init(cellKind);
    } else {
      this.status = CellSectionStatus.Static;
    }

    // Note: assumes that this.data is made up of it's parts, and not the parts
    // are made from the overall data object.
    this.dataUpdateDep = data.space.derived(() => {
      const curContent = this.content();
      const f = (oldData: SectionDataDef) => (oldData.sectionData.content = curContent);
      this.data.change(f);
    });
  }

  startCell() {
    if (this.status !== CellSectionStatus.NotStarted) {
      throw new Error('Can only start a not-started cell');
    }

    // this.status === CellSectionStatus.NotStarted ==>
    const contentAsCellKind: CellSectionContent = this.content() as CellSectionContent;
    for (const [inputId, cellInputRef] of Object.entries(contentAsCellKind.inputs)) {
      if (cellInputRef.kind === CellSectionInputKind.FromJsonSection) {
        const section = this.experiment.sectionMap.get(cellInputRef.sectionId);
        if (!section) {
          throw Error(`No such section: ${cellInputRef.sectionId}`);
        }
        if (section.data().sectionData.sectionKind !== SectionKind.JsonObj) {
          throw Error(
            `Section Id (${cellInputRef.sectionId}) was not JsonObj (was: ${section.data().sectionData.sectionKind})`,
          );
        }
        this.cell.assignInputFromSignal(inputId, section.content);
      } else if (cellInputRef.kind === CellSectionInputKind.FromCellOutput) {
        const section = this.experiment.sectionMap.get(cellInputRef.cellSectionId);
        if (!section) {
          throw Error(`No such section: ${cellInputRef.cellSectionId}`);
        }
        if (section.data().sectionData.sectionKind !== SectionKind.Cell) {
          throw Error(
            `Section Id (${cellInputRef.cellSectionId}) was not Cell (was: ${section.data().sectionData.sectionKind})`,
          );
        }
        const sectionCellContent = section.content() as CellSectionContent;
        // TODO:
        this.cell.assignInputViaPiping(inputId, sectionCellContent.outputIds);
      } else {
        throw Error(`Unknown CellSectionInput (${inputId}): ${JSON.stringify(cellInputRef)}`);
      }
    }
    this.cellData().content.inStreams;
    this.cell.start();
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
