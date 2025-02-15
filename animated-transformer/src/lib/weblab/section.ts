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
  asyncIterToSignal,
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
};

export type SectionInStreamRef = {
  sectionId: string;
  outStreamId: string;
};

export type CellSectionOutput = {
  // Optionally, the last value. Allows restarting from previous computation.
  lastValue?: JsonValue;
  // True = values should be saved.
  saved: boolean;
};

export type IOSectionContent = {
  // How inputs to this cell map to either outputs from other cells, or raw
  // JsonObj values.
  inputs: { [inputId: string]: SectionInputRef[] };
  // OutputIds to the last saved value (undefined when not yet defined)
  outputs: { [outputId: string]: CellSectionOutput };
  inStreams: { [inStreamId: string]: SectionInStreamRef[] };
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

export type SectionInStreamNameRef = {
  displayId: string;
  id: string;
  ref: SectionInStreamRef;
};

// For both output values, and output streams.
export type SectionOutNameRef = {
  displayId: string;
  id: string;
  hasValue: boolean;
};

// --------------------------------------------------------------------------
//
// --------------------------------------------------------------------------

export class IoSecDepMap<Container extends Section<SecDefWithIo>> {
  // Invariant: contain the same local Id and Section relations:
  // exists k, c. localIdToSecMap[k].has(c) <==> secToLocalIds[c].has(k)
  //
  // From a local id (input/output ID, etc) to a remote section, to the
  // remote section's ids.
  localIdToSecMap = {} as { [key: string]: Map<Container, Set<string>> };

  // From a remote section, to the local ids that depends on that remote
  // section. To get the specific remote ids that are connected, use the
  // ioToSecMap.
  secToLocalIds = new Map<Container, Set<string>>();

  addLocalId(id: string) {
    this.localIdToSecMap[id] = new Map();
  }

  add(ioId: string, sec: Container, secIoId: string) {
    if (!(ioId in this.localIdToSecMap)) {
      this.localIdToSecMap[ioId] = new Map();
    }
    const secMap = this.localIdToSecMap[ioId];
    const idSet = secMap.get(sec);
    if (idSet) {
      idSet.add(secIoId);
    } else {
      secMap.set(sec, new Set([secIoId]));
    }
  }

  hasDepsOn(localId: string): boolean {
    if (!(localId in this.localIdToSecMap)) {
      throw new Error(`hasDepsOn: ${localId} does not exist.`);
    }
    return this.localIdToSecMap[localId].size > 0;
  }

  // TODO: have a constant empty set?
  deleteSection(c: Container): Set<string> {
    const localIds = this.secToLocalIds.get(c);
    if (!localIds) {
      console.error(`IoSecDepMap: deleteSection: no such section ${c.initDef.id}`);
      return new Set();
    }
    for (const i of localIds) {
      this.localIdToSecMap[i].delete(c);
    }
    return localIds;
  }

  renameLocalId(oldLocalId: string, newLocalId: string) {
    throw new Error('not yet implmented');
  }

  renameRemoteId(oldRemoteId: string, newRemoteId: string) {
    throw new Error('not yet implmented');
  }
}

// ============================================================================
//
// ============================================================================
export class Section<
  Def extends SecDefWithData = SecDefWithData,
  // Note: for now, shortcut to treat I and O as including stream names and
  // input names.
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
  inputs = {} as { [Key in keyof I]: SetableSignal<I[Key] | null> };
  outputs = {} as { [Key in keyof O]: SetableSignal<O[Key] | null> };

  // For IO Sections (always empty except for UiCell and Worker)
  inStream = {} as {
    [Key in keyof I]: {
      lastValue: SetableSignal<I[Key] | null>;
      openCount: SetableSignal<number>;
    };
  };
  outStream = {} as {
    [Key in keyof O]: {
      lastValue: SetableSignal<O[Key] | null>;
      done: SetableSignal<boolean>;
    };
  };

  // this Section's inputs that depend in outputs from other sections.
  inDeps = new IoSecDepMap();
  inStreamDeps = new IoSecDepMap();

  // Other Section's inputs that depend in outputs from this section.
  outDeps = new IoSecDepMap();
  outStreamDeps = new IoSecDepMap();

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

  // --------------------------------------------------------------------------

  inputNames(): SectionInputNameRef[] {
    if (!this.isIoSection()) {
      return [];
    }
    const thisSection = this as Section<SecDefWithIo>;
    const names = [...Object.entries(thisSection.defData().io.inputs)]
      .map(([id, refs]) =>
        refs.map((ref) => {
          const displayId = ref
            ? ref.outputId === 'jsonObj'
              ? ref.sectionId
              : `${ref.sectionId}.${ref.outputId}`
            : `${id}`;
          return { displayId, ref, id, hasValue: !!this.inputs[id]() };
        }),
      )
      .flat();
    names.sort((a, b) => (a.displayId > b.displayId ? -1 : 1));
    return names;
  }

  outputNames(): SectionOutNameRef[] {
    if (!this.isIoSection()) {
      return [];
    }
    const thisSection = this as Section<SecDefWithIo>;
    const names = [...Object.entries(thisSection.defData().io.outputs)].map(([id, _out]) => {
      return { displayId: id, id, hasValue: !!this.outputs[id]() };
    });
    names.sort((a, b) => (a.displayId > b.displayId ? -1 : 1));
    return names;
  }

  inStreamNames(): SectionInStreamNameRef[] {
    if (!this.isIoSection()) {
      return [];
    }
    const thisSection = this as Section<SecDefWithIo>;
    const names = [...Object.entries(thisSection.defData().io.inStreams)]
      .map(([id, refs]) =>
        refs.map((ref) => {
          const displayId = ref ? `${ref.sectionId}.${ref.outStreamId}` : `${id}`;
          return { displayId, ref, id };
        }),
      )
      .flat();
    names.sort((a, b) => (a.displayId > b.displayId ? -1 : 1));
    return names;
  }

  outStreamNames(): string[] {
    if (!this.isIoSection()) {
      return [];
    }
    const thisSection = this as Section<SecDefWithIo>;
    const names = thisSection.defData().io.outStreamIds;
    names.sort();
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

  initSubSections() {
    const thisSection = this.assertListSection();
    thisSection.subSections = this.space.setable<Section[]>([]);
  }

  async substPlaceholder(def: SecDefWithData) {
    if (!this.isPlaceholderSection()) {
      throw new Error(`Can only subst Placeholders, but was: ${JSON.stringify(this.defData())}`);
    }
    // const thisSection = this as Section<SecDefOfPlaceholder>; const oldDef =
    // thisSection.defData();
    //
    // Note: no one can depend on a placeholder, so no inDeps or outDeps need
    // updating.
    this.renameId(def.id);
    this.initDef = def;
    this.defData.set(def as Def);
  }

  updateRefSectionTargetId(newId: string) {
    const thisSection = this.assertRefSection();
    thisSection.initDef.refId = newId;
  }

  deleteInDep(sec: Section<SecDefWithIo>) {
    const sectionId = sec.initDef.id;
    const thisSection = this.assertIoSection();
    const data = thisSection.defData();

    const localIdsChanged = this.inDeps.deleteSection(sec);
    for (const i in localIdsChanged) {
      const iToSecMap = this.inDeps.localIdToSecMap[i];
      data.io.inputs[i] = [
        ...iToSecMap.values().map((outsOfSec) =>
          [...outsOfSec].map((outputId) => {
            return { sectionId, outputId };
          }),
        ),
      ].flat();
    }

    const localInStreamsIdsChanged = this.inStreamDeps.deleteSection(sec);
    for (const i in localInStreamsIdsChanged) {
      const iToSecMap = this.inStreamDeps.localIdToSecMap[i];
      data.io.inStreams[i] = [
        ...iToSecMap.values().map((outsOfSec) =>
          [...outsOfSec].map((outStreamId) => {
            return { sectionId, outStreamId };
          }),
        ),
      ].flat();
    }
  }

  renameSecIdInInputDeps(oldId: string, newId: string) {
    throw new Error('not yet implemented.');
    // const thisSection = this.assertIoSection();
    // const data = thisSection.defData();
    // for (const [i, v] of Object.entries(data.io.inputs)) {
    //   if (v && v.sectionId === oldId) {
    //     v.sectionId = newId;
    //   }
    // }
    // for (const [i, v] of Object.entries(data.io.inStreams || {})) {
    //   if (v && v.sectionId === oldId) {
    //     v.sectionId = newId;
    //   }
    // }
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
      refSec.updateRefSectionTargetId(newId);
    }
    this.defData.change(() => (this.initDef.id = newId));

    throw new Error('Renaming of outDeps and outStreamDeps subsections not implemented yet');
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

  initOutputsAndDeps() {
    const thisSection = this.assertIoSection();
    const data = thisSection.defData();
    this.experiment.noteAddedIoSection(data.id);

    console.log(`initOutputs: cell: ${data.id}`);
    for (const [outputId, cellOutputRef] of Object.entries(data.io.outputs || [])) {
      thisSection.outputs[outputId] = thisSection.space.setable(cellOutputRef.lastValue || null);
      this.outDeps.addLocalId(outputId);
    }
    for (const outStreamId of data.io.outStreamIds || []) {
      thisSection.outStream[outStreamId] = {
        lastValue: thisSection.space.setable(null),
        done: thisSection.space.setable(false),
      };
      this.outStreamDeps.addLocalId(outStreamId);
    }
  }

  // This happens after construction, but before connecting to cell workers.
  // This ensures that the input signals in this section are literally the
  // same as the output signals from the section they reference.
  unifyOutputToInputSignalsAndDeps() {
    const thisSection = this.assertIoSection();
    const data = thisSection.defData();

    for (const [inputId, cellInputRefs] of Object.entries(data.io.inputs)) {
      const inputSignal = this.space.setable(null);
      thisSection.inputs[inputId] = inputSignal;
      for (const cellInputRef of cellInputRefs) {
        const otherSection = thisSection.experiment.getSection(
          cellInputRef.sectionId,
        ) as Section<SecDefWithIo>;
        thisSection.inDeps.add(inputId, otherSection, cellInputRef.outputId);
        otherSection.outDeps.add(cellInputRef.outputId, thisSection, inputId);
        this.space.derived(() => inputSignal.set(otherSection.outputs[cellInputRef.outputId]()));
      }
    }

    for (const [inputId, cellInStreamRefs] of Object.entries(data.io.inStreams)) {
      const inStreamValueSignal = this.space.setable(null);
      const inStreamOpenCountSignal = this.space.setable(0);
      thisSection.inStream[inputId] = {
        lastValue: inStreamValueSignal,
        openCount: inStreamOpenCountSignal,
      };

      for (const cellInStreamRef of cellInStreamRefs) {
        const otherSection = thisSection.experiment.getSection(
          cellInStreamRef.sectionId,
        ) as Section<SecDefWithIo>;
        thisSection.inDeps.add(inputId, otherSection, cellInStreamRef.outStreamId);
        otherSection.outDeps.add(cellInStreamRef.outStreamId, thisSection, inputId);
        this.space.derived(() =>
          inStreamValueSignal.set(otherSection.outStream[cellInStreamRef.outStreamId].lastValue()),
        );
        inStreamOpenCountSignal.update((c) => c + 1);
        this.space.derived(() => {
          // Assumes that done cannot become true more than once.
          if (otherSection.outStream[cellInStreamRef.outStreamId].done()) {
            inStreamOpenCountSignal.change((c) => c - 1);
          }
        });
        // input stream is done when all outputs feeding into it are done.
        this.space.derived(() =>
          inStreamValueSignal.set(otherSection.outStream[cellInStreamRef.outStreamId].lastValue()),
        );
      }
    }
    // Note: UI Cells don't have input/output streams. CONSIDER: should they be
    // able to peek into streams using a setable abstraction?
  }

  // Connect the cell in this section to it's inputs/outputs in the experiment.
  // This should happen after initSectionCellData, initOutputs and
  // unifyOutputToInputSignals.
  connectWorker() {
    const thisSection = this.assertWorkerSection();
    const data = thisSection.defData();
    if (!this.cell || this.cell.controller.status() !== CellStatus.NotStarted) {
      console.log('connectWorkerCell: data id:', data.id);
      console.log('connectWorkerCell: cell id:', this.cell!.controller.id);
      throw new Error(`Cell (${this.defData().id}): Can only connect a not-started cell`);
    }

    for (const [inputId, cellInputRefs] of Object.entries(data.io.inputs)) {
      const thisInputSignal = this.cell.controller.inputs[inputId].connect();
      for (const cellInputRef of cellInputRefs) {
        // TODO: this is where magic dep-management could happen... we could use
        // old input value as the input here, so that we don't need to
        // re-execute past cells. Would need think about what to do with
        // streams. Likely depends on cell semantics some. e.g. deterministic
        // cells with no streams are clearly fine. Streams might need some kind
        // of saved state of the stream. (which StateIter abstraction has!)
        const otherSection = this.experiment.getSection(
          cellInputRef.sectionId,
        ) as Section<SecDefWithIo>;
        if (otherSection.isWorkerSection()) {
          otherSection.cell.controller.outputs[cellInputRef.outputId].addPipeTo(
            this.cell.controller.inputs[inputId],
          );
        } else {
          this.space.derived(() =>
            thisInputSignal.set(otherSection.outputs[cellInputRef.outputId]()),
          );
        }
      }
    }

    for (const [outputId, cellOutputRef] of Object.entries(data.io.outputs || [])) {
      // TODO: this will need to be updated if a section is dynamically added
      // that takes an output of an existing cell. Because
      // dependOnMeSections.length may become > 0.
      if (this.outDeps.hasDepsOn(outputId)) {
        const controller = thisSection.cell.controller;
        const onceReady = controller.outputs[outputId].connect();
        onceReady.then((signal) => {
          console.warn(`initOutputs: ${this.initDef.id}: Section output setting [${outputId}]`);
          thisSection.space.derived(() => thisSection.outputs[outputId].set(signal()));
        });

        // When cell outputs happen, update the defData's saved value.
        thisSection.space.derived(() => {
          // TODO: if this was put a line lower, then dependency setup would
          // fail. This is a fragile aspect of siganl spaces. Think about
          // documentation about this case.
          const newOutput = thisSection.outputs[outputId]();
          if (cellOutputRef.saved) {
            thisSection.defData.change(() => (cellOutputRef.lastValue = newOutput));
          }
        });
      }
    }

    // TODO: allow input streams from UI cells also?
    for (const [inStreamId, cellInputRefs] of Object.entries(data.io.inStreams)) {
      for (const cellInputRef of cellInputRefs) {
        const otherCellController = this.experiment.getSectionLabCell(cellInputRef.sectionId);
        otherCellController.outStreams[cellInputRef.outStreamId].addPipeTo(
          this.cell.controller.inStreams[inStreamId],
        );
      }
    }

    for (const outStreamId of data.io.outStreamIds) {
      // TODO: this will need to be updated if a section is dynamically added
      // that takes an output of an existing cell. Because
      // dependOnMeSections.length may become > 0.
      console.log(
        `${this.initDef.id}: connectWorker: ${JSON.stringify([...Object.keys(this.outStreamDeps.localIdToSecMap)])}, (${outStreamId})`,
      );
      const dependOnMeSections = [...this.outStreamDeps.localIdToSecMap[outStreamId].keys()];
      let hasUiSecDep = dependOnMeSections.find((sec) => !sec.isWorkerSection());
      if (hasUiSecDep) {
        const controller = thisSection.cell.controller;
        const streamReceiver = controller.outStreams[outStreamId].connect();
        const signalWrap = asyncIterToSignal(streamReceiver, this.space);
        signalWrap.onceSignal.then((outStreamSignal) =>
          this.space.derived(() => this.outStream[outStreamId].lastValue.set(outStreamSignal())),
        );
        signalWrap.onceDone.then(() => this.outStream[outStreamId].done.set(true));
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

    if (this.isIoSection()) {
      for (const dep of this.inDeps.secToLocalIds.keys()) {
        dep.outDeps.deleteSection(this);
        // dep.deleteOutDep(section);
      }
      for (const dep of this.outDeps.secToLocalIds.keys()) {
        dep.deleteInDep(this);
      }
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
