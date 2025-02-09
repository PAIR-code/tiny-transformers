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
import { CellController, CellStatus, SomeCellController } from '../distr-signals/cell-controller';
import { CellKind, Kind, ValueKindFnStruct, ValueStruct } from '../distr-signals/cell-kind';
import { Experiment, prefixCacheCodePath, prefixCacheCodeUrl } from './experiment';
import { AbstractDataResolver } from '../data-resolver/data-resolver';
import { Abs, data } from '@tensorflow/tfjs';
import { tryer } from '../utils';

// ============================================================================

export enum SecDefKind {
  // A reference to another section
  Ref = 'Ref',
  // A path to a cell/section defined in a separate file.
  Path = 'Path',
  // A placeholder for a section being defined.
  Placeholder = 'Placeholder',
  // A section that is a list of other sections.
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
  // hidden?: boolean;
  collapsed: boolean;
  // initialLimittedHeightPx?: number;
};

export type SecDefOfPlaceholder = {
  kind: SecDefKind.Placeholder;
  id: string;
  display: SectionDisplay;
  // TODO: consider lazy loading, and placeholders being used to show the status
  // of something being loaded...
  //
  // loadingState?: { loadingError?: string; loading: boolean;
  // };
};

export type SecDefOfRef = {
  kind: SecDefKind.Ref;
  // This cell's ID.
  id: string;
  // Reference to other cell's ID.
  refId: string;
  display: SectionDisplay;
};

export type SecDefByPath = {
  kind: SecDefKind.Path;
  id: string; // unclear if this should be here, or in the data?
  dataPath: string; // URI to a file containing ExpCellData.
  display: SectionDisplay;
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
  display: SectionDisplay;
  // displayKind: ExpCellDisplayKind;
};

//
export enum ViewerKind {
  MarkdownOutView = 'Markdown',
  JsonObjOutView = 'JsonObj',
  ExampleTableView = 'ExampleTableView',
  SimpleChartView = 'SimpleChartView',
}

export type SecDefOfUiView = {
  kind: SecDefKind.UiCell;
  id: string;
  timestamp: number;
  io: IOSectionContent;
  uiView: ViewerKind;
  display: SectionDisplay;
};

export type SecDefOfWorker = {
  kind: SecDefKind.WorkerCell;
  id: string;
  timestamp: number;
  io: IOSectionContent;
  cellCodeRef: CellCodeRef;
  display: SectionDisplay;
};

export type SecDefWithIo = SecDefOfWorker | SecDefOfUiView;
export type SecDefWithData = SecDefWithIo | SecDefOfSecList | SecDefOfPlaceholder | SecDefOfRef;
export type SecDef = SecDefWithData | SecDefByPath;

// ============================================================================

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

export type SectionInputRef = {
  sectionId: string;
  outputId: string;
} | null;

export type SectionInStreamRef = {
  sectionId: string;
  outStreamId: string;
} | null;

export type CellSectionOutput = {
  // Optionally, the last value. Allows restarting from previous computation.
  lastValue?: JsonValue;
  // True = values should be saved.
  saved: boolean;
};

export type IOSectionContent = {
  // How inputs to this cell map to either outputs from other cells, or raw
  // JsonObj values.
  inputs: { [inputId: string]: SectionInputRef };
  // OutputIds to the last saved value (undefined when not yet defined)
  outputs: { [outputId: string]: CellSectionOutput };
  inStreams: { [inStreamId: string]: SectionInStreamRef };
  outStreamIds: string[];
};

// ============================================================================

export type DistrSerialization<T, T2> = {
  data: T;
  subpathData?: { [path: string]: T2 };
};

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
  for (const k of Object.keys(c.io.inputs)) {
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
  // status: CellSectionStatus;
  controller: SomeCellController;
  cellCodeCache: string; // the string of the code...
  cellObjectUrl: string; // url of Object URL to allow cleanup.
};

function isIoSecDef(d: SecDef): d is SecDefWithIo {
  return d.kind === SecDefKind.UiCell || d.kind === SecDefKind.WorkerCell;
}

function isSecListDef(d: SecDef): d is SecDefOfSecList {
  return d.kind === SecDefKind.SectionList;
}

function isWorkerSection(
  s: Section<any>,
): s is Section<SecDefOfWorker> & { cell: SectionCellData } {
  return s.initDef.kind === SecDefKind.WorkerCell;
}

function isUiSection(s: Section<any>): s is Section<SecDefOfUiView> {
  return s.initDef.kind === SecDefKind.UiCell;
}

export type PathSection = Section & { initDef: SecDefByPath };
export type ListSection = Section<SecDefOfSecList> & { subSections: SetableSignal<Section[]> };
export type WorkerSection = Section<SecDefOfWorker> & { cell: SectionCellData };
export type RefSection = Section<SecDefOfRef> & { initDef: SecDefOfRef };

export type SectionInputNameRef = {
  displayId: string;
  id: string;
  ref: SectionInputRef;
  hasValue: boolean;
};

export type SectionOutputNameRef = {
  displayId: string;
  id: string;
  hasValue: boolean;
};

// ============================================================================
//
// ============================================================================
export class Section<
  Def extends SecDefWithData = SecDefWithData,
  I extends ValueStruct = ValueStruct,
  O extends ValueStruct = ValueStruct,
> {
  // The kind of cell this.
  defData: SetableSignal<Def>;

  // References to this section.
  references: Set<Section> = new Set();
  space: SignalSpace;

  // Memory management cleanup utility: hold references to derived signals.
  //
  // Consider: this may not be needed if we manage data via disposing the
  // content/data signals in some other way, e.g. with an environment dispose
  // operation? To think about.
  dataUpdateDeps: AbstractSignal<void>[] = [];

  // --------------------------------------------------------------------------
  // For cells initialised by Ref
  // refDef?: SecDefByRef;
  // // For cells initialised by Path
  // pathDef?: SecDefByPath;
  // For WorkerCell
  cell?: SectionCellData;
  // For Subsections
  subSections?: SetableSignal<Section[]>;

  // For IO Sections (always empty except for UiCell and Worker)
  inputs = {} as { [Key in keyof I]: AbstractSignal<I[Key] | null> };
  outputs = {} as { [Key in keyof O]: SetableSignal<O[Key] | null> };
  dependsOnMe: Set<Section<SecDefWithIo>> = new Set();
  dependsOnOutputsFrom: Set<Section<SecDefWithIo>> = new Set();

  inputNames(): SectionInputNameRef[] {
    if (!this.isIoSection()) {
      return [];
    }
    const thisSection = this as Section<SecDefWithIo>;
    const names = [...Object.entries(thisSection.defData().io.inputs)].map(([id, ref]) => {
      const displayId = ref
        ? ref.outputId === 'jsonObj'
          ? id
          : `${ref.sectionId}.${ref.outputId}`
        : `${id}`;
      return { displayId, ref, id, hasValue: !!this.inputs[id]() };
    });
    names.sort((a, b) => (a.displayId > b.displayId ? -1 : 1));
    return names;
  }

  outputNames(): SectionOutputNameRef[] {
    if (!this.isIoSection()) {
      return [];
    }
    const thisSection = this as Section<SecDefWithIo>;
    const names = [...Object.entries(thisSection.defData().io.outputs)].map(([id, out]) => {
      return { displayId: id, id, hasValue: !!this.outputs[id]() };
    });
    names.sort((a, b) => (a.displayId > b.displayId ? -1 : 1));
    return names;
  }

  // --------------------------------------------------------------------------
  isPathSection(): this is PathSection {
    return this.initDef.kind === SecDefKind.Path;
  }

  isIoSection(): this is Section<SecDefWithIo> {
    return this.defData().kind === SecDefKind.UiCell || this.initDef.kind === SecDefKind.WorkerCell;
  }
  assertIoSection(): Section<SecDefWithIo> {
    if (!this.isIoSection()) {
      throw new Error(`assertIoSection failed on defData: ${JSON.stringify(this.defData())}`);
    }
    return this as Section<SecDefWithIo>;
  }

  isWorkerSection(): this is WorkerSection {
    return this.defData().kind === SecDefKind.WorkerCell;
  }
  assertWorkerSection(): WorkerSection {
    if (!this.isWorkerSection()) {
      throw new Error(`assertWorkerSection failed on defData: ${JSON.stringify(this.defData())}`);
    }
    return this;
  }

  isPlaceholderSection(): this is Section<SecDefOfPlaceholder> {
    return this.defData().kind === SecDefKind.Placeholder;
  }

  isRefSection(): this is RefSection {
    return this.defData().kind === SecDefKind.Ref;
  }
  assertRefSection(): RefSection {
    if (!this.isRefSection()) {
      throw new Error(
        `Can only update ref target id of ref, but was: ${JSON.stringify(this.initDef)}`,
      );
    }
    return this;
  }

  isListSection(): this is ListSection {
    return this.initDef.kind === SecDefKind.SectionList;
  }
  assertListSection(): ListSection {
    if (!this.isListSection()) {
      throw new Error(
        `Can only update ref target id of ref, but was: ${JSON.stringify(this.initDef)}`,
      );
    }
    return this;
  }

  // --------------------------------------------------------------------------
  constructor(
    public experiment: Experiment,
    // Note: SecDef can be a reference or path, and it's data() value will then
    // be the referenced sections data, or if it's a path, it will be the data
    // resolved from reading that path.
    public initDef: SecDef,
    // The section we are part of. or null for root section.
    public parent: ListSection | null,
  ) {
    this.space = this.experiment.space;
    this.initDef.display = this.initDef.display || {};
    if (initDef.kind === SecDefKind.Path) {
      const placeholderDef: SecDefOfPlaceholder = {
        kind: SecDefKind.Placeholder,
        id: initDef.id,
        display: { collapsed: false },
        // loadingState: {
        //   loading: true,
        // },
      };
      this.defData = this.space.setable(placeholderDef as Def);
    } else {
      this.defData = this.space.setable(initDef as Def);
    }
  }

  initSubSections() {
    const thisSection = this.assertListSection();
    thisSection.subSections = this.space.setable<Section[]>([]);
  }

  async substPlaceholder(def: SecDefWithData) {
    if (!this.isPlaceholderSection()) {
      throw new Error(`Can only subst Placeholders, but was: ${JSON.stringify(this.defData())}`);
    }
    // const thisSection = this as Section<SecDefOfPlaceholder>;
    // const oldDef = thisSection.defData();
    this.renameId(def.id);
    this.initDef = def;
    this.defData.set(def as Def);
  }

  updateTargetId(newId: string) {
    const thisSection = this.assertRefSection();
    thisSection.initDef.refId = newId;
  }

  deleteSecIdInInputDeps(oldSectionId: string) {
    const thisSection = this.assertIoSection();
    const data = thisSection.defData();
    const inputs = data.io.inputs;
    for (const [i, v] of Object.entries(inputs)) {
      if (v && v.sectionId === oldSectionId) {
        inputs[i] = null;
      }
    }
    const inStreams = data.io.inStreams || {};
    for (const [i, v] of Object.entries(inStreams)) {
      if (v && v.sectionId === oldSectionId) {
        inStreams[i] = null;
      }
    }
  }

  renameSecIdInInputDeps(oldId: string, newId: string) {
    const thisSection = this.assertIoSection();
    const data = thisSection.defData();
    for (const [i, v] of Object.entries(data.io.inputs)) {
      if (v && v.sectionId === oldId) {
        v.sectionId = newId;
      }
    }
    for (const [i, v] of Object.entries(data.io.inStreams || {})) {
      if (v && v.sectionId === oldId) {
        v.sectionId = newId;
      }
    }
  }

  renameId(newId: string) {
    const oldId = this.initDef.id;
    if (oldId === newId) {
      return;
    }
    this.initDef.id = newId;

    if (this.cell) {
      this.experiment.noteRenamedIoSection(oldId, newId);
    }
    this.experiment.sectionMap.delete(oldId);
    this.experiment.sectionMap.set(newId, this as Section<any>);

    for (const refSec of this.references) {
      refSec.updateTargetId(newId);
    }
    this.defData.change(() => (this.initDef.id = newId));
    for (const dep of this.dependsOnMe) {
      dep.renameSecIdInInputDeps(oldId, newId);
    }
  }

  resolveRef(s: Section<SecDefWithData>) {
    this.defData.set(s.defData() as Def);
  }

  async initSectionCellData(
    cacheResolver: AbstractDataResolver,
    dataResolver: AbstractDataResolver,
    config: {
      fromCache: boolean;
    },
  ): Promise<void> {
    const thisSection = this.assertWorkerSection();
    const secDef = thisSection.defData();
    console.log(`initSectionCellData: WokrerCell: ${secDef.id}`);
    const cellKind = new CellKind(secDef.id, cellIoForCellSection(secDef));
    const controller = new CellController(this.experiment.env, secDef.id, cellKind);

    switch (secDef.cellCodeRef.kind) {
      case CellCodeRefKind.PathToWorkerCode: {
        try {
          const pathList = config.fromCache
            ? prefixCacheCodePath([secDef.cellCodeRef.jsPath])
            : // Match paths, splitting by "/" char, but skipping any that are escaped i.e. "\/"
              secDef.cellCodeRef.jsPath.split(/(?<!\\)\//);
          const [loadCodeErr, buffer] = await tryer(dataResolver.loadArrayBuffer(pathList));
          if (loadCodeErr) {
            console.error(loadCodeErr);
            throw new Error(
              `Unable to load code path (${secDef.cellCodeRef.jsPath}) in experiment, pathList: ${JSON.stringify(pathList)}`,
            );
          }
          if (cacheResolver !== dataResolver) {
            await cacheResolver.saveArrayBuffer(
              prefixCacheCodePath([secDef.cellCodeRef.jsPath]),
              buffer,
            );
          }

          const dec = new TextDecoder('utf-8');
          const cellCodeCache = dec.decode(buffer);
          const blob = new Blob([cellCodeCache], { type: 'application/javascript' });
          const cellObjectUrl = URL.createObjectURL(blob);
          thisSection.cell = { controller, cellCodeCache, cellObjectUrl } as SectionCellData;
        } catch (e) {
          console.error(e);
          const cellCodeCache = 'throw new Error("Failed to init path based cell")';
          const blob = new Blob([cellCodeCache], { type: 'application/javascript' });
          const cellObjectUrl = URL.createObjectURL(blob);
          thisSection.cell = { controller, cellCodeCache, cellObjectUrl };
        }
        break;
      }
      case CellCodeRefKind.InlineWorkerJsCode: {
        const blob = new Blob([secDef.cellCodeRef.js], { type: 'application/javascript' });
        const cellObjectUrl = URL.createObjectURL(blob);
        thisSection.cell = { controller, cellCodeCache: secDef.cellCodeRef.js, cellObjectUrl };
        break;
      }
      case CellCodeRefKind.UrlToCode: {
        try {
          let buffer: ArrayBuffer;
          if (config.fromCache) {
            buffer = await dataResolver.loadArrayBuffer(
              prefixCacheCodeUrl([secDef.cellCodeRef.jsUrl]),
            );
          } else {
            const response = await fetch(secDef.cellCodeRef.jsUrl);
            if (!response.ok) {
              throw new Error(`Response status: ${response.status}`);
            }
            buffer = await response.arrayBuffer();
          }
          if (cacheResolver !== dataResolver) {
            cacheResolver.saveArrayBuffer(prefixCacheCodeUrl([secDef.cellCodeRef.jsUrl]), buffer);
          }
          const dec = new TextDecoder('utf-8');
          const cellCodeCache = dec.decode(buffer);
          const blob = new Blob([cellCodeCache], { type: 'application/javascript' });
          const cellObjectUrl = URL.createObjectURL(blob);
          thisSection.cell = { controller, cellCodeCache, cellObjectUrl };
        } catch (e) {
          console.error(e);
          const cellCodeCache = 'throw new Error("Failed to init url based cell")';
          const blob = new Blob([cellCodeCache], { type: 'application/javascript' });
          const cellObjectUrl = URL.createObjectURL(blob);
          thisSection.cell = { controller, cellCodeCache, cellObjectUrl };
        }
        break;
      }
      default:
        throw new Error(`bad cellCodeRef: ${JSON.stringify(secDef.cellCodeRef)}`);
    }
  }

  initOutputs() {
    const thisSection = this.assertIoSection();
    const data = thisSection.defData();
    this.experiment.noteAddedIoSection(data.id);

    console.log(`initOutputs: cell: ${data.id}`);
    for (const [outputId, cellOutputRef] of Object.entries(data.io.outputs || [])) {
      thisSection.outputs[outputId] = thisSection.space.setable(cellOutputRef.lastValue || null);
    }
  }

  // This happens after construction, but before connecting cells.
  unifyOutputToInputSignals() {
    const thisSection = this.assertIoSection();
    const data = thisSection.defData();

    for (const [inputId, cellInputRef] of Object.entries(data.io.inputs)) {
      if (cellInputRef) {
        console.log(
          `connectUiInputs: input: ${data.id}; ${inputId} <-- ${cellInputRef.sectionId}.${cellInputRef.outputId}`,
        );

        const otherSection = thisSection.experiment.getSection(
          cellInputRef.sectionId,
        ) as Section<SecDefWithIo>;
        thisSection.dependsOnOutputsFrom.add(otherSection);
        otherSection.dependsOnMe.add(thisSection);
        thisSection.dependsOnMe.add(otherSection);
        thisSection.inputs[inputId] = otherSection.outputs[cellInputRef.outputId];
      }
    }
    // Note: UI Cells don't have input/output streams. CONSIDER: should they be
    // able to peek into streams using a setable abstraction?
  }

  // Connect the cell in this section to it's inputs/outputs in the experiment.
  // This should happen after
  connectWorker() {
    const thisSection = this.assertWorkerSection();
    const data = thisSection.defData();
    if (!this.cell || this.cell.controller.status() !== CellStatus.NotStarted) {
      console.log('connectWorkerCell: data id:', data.id);
      console.log('connectWorkerCell: cell id:', this.cell!.controller.id);
      throw new Error(`Cell (${this.defData().id}): Can only connect a not-started cell`);
    }

    for (const [inputId, cellInputRef] of Object.entries(data.io.inputs)) {
      if (cellInputRef) {
        // TODO: this is where magic dep-management could happen... we could use
        // old input value as the input here, so that we don't need to
        // re-execute past cells. Would need think about what to do with
        // streams. Likely depends on cell semantics some. e.g. deterministic
        // cells with no streams are clearly fine. Streams might need some kind
        // of saved state of the stream. (which StateIter abstraction has!)
        const otherSection = this.experiment.getSection(
          cellInputRef.sectionId,
        ) as Section<SecDefWithIo>;
        this.dependsOnOutputsFrom.add(otherSection);
        otherSection.dependsOnMe.add(thisSection as Section<SecDefWithIo>);
        if (otherSection.isWorkerSection()) {
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
    }

    for (const [outputId, cellOutputRef] of Object.entries(data.io.outputs || [])) {
      const controller = thisSection.cell.controller;
      const onceReady = controller.outputs[outputId].connect();
      onceReady.then((signal) => {
        console.warn(`initOutputs: ${this.initDef.id}: Section output setting [${outputId}]`);
        thisSection.experiment.space.derived(() => thisSection.outputs[outputId].set(signal()));
      });

      // When cell outputs happen, update the def & saved value.
      thisSection.space.derived(() => {
        const newOutput = thisSection.outputs[outputId]();
        thisSection.defData.change(() => {
          cellOutputRef.lastValue = newOutput;
        });
      });
    }

    for (const [inStreamId, cellInputRef] of Object.entries(data.io.inStreams)) {
      if (cellInputRef) {
        const otherCellController = this.experiment.getSectionLabCell(cellInputRef.sectionId);
        otherCellController.outStreams[cellInputRef.outStreamId].addPipeTo(
          this.cell.controller.inStreams[inStreamId],
        );
      }
    }
  }

  async startWorker() {
    const thisSection = this.assertWorkerSection();
    thisSection.cell.controller.startWithWorker(
      new Worker(new URL(thisSection.cell.cellObjectUrl)),
    );
  }

  serialise(subpathData: { [path: string]: SecDefWithData }): SecDef {
    return serialise(this as Section<any>, this.initDef, subpathData);
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
      this.cell.controller.disconnect();
      delete this.cell;
    }
    for (const dep of this.dataUpdateDeps) {
      dep.node.dispose();
    }

    this.experiment.noteDeletedIoSection(this.initDef.id);
    // TODO: remove the now un-needed derivedLazy dep.
  }
}

// ----------------------------------------------------------------------------
function serialise(
  section: Section,
  def: SecDef,
  subpathData: { [path: string]: SecDefWithData },
): SecDef {
  switch (def.kind) {
    case SecDefKind.Path:
      // Note: paths must always have data as SecDefWithData.
      subpathData[def.dataPath] = serialise(
        section,
        section.defData(),
        subpathData,
      ) as SecDefWithData;
      return def;
    case SecDefKind.SectionList:
      if (!section.subSections) {
        throw new Error(`(${def.id}) serialise SectionList lacks sections.`);
      }
      const subSectionDefs = section.subSections().map((section) => section.serialise(subpathData));
      return { ...def, subsections: subSectionDefs };
    case SecDefKind.Ref:
    case SecDefKind.UiCell:
    case SecDefKind.WorkerCell:
    case SecDefKind.Placeholder:
      return section.defData();
  }
}
