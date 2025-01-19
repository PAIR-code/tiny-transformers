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
 * A concept of Experiments where each experiment is list of sections. Sections
 * can themselves be experiments too, markdown ,or other stuff. A section can be
 * defined by:
 *
 *  - a reference to some existing section (meaning that we show the section at
 *    this point in the list),
 *  - a path section (meaning that we have to load data from the given path to
 *    get the data for that section), or
 *  - an inline object (meaning that the section's data is included directly in
 *    the experiment data as a subobject).
 *
 * Experiments are also serialisable.
 *
 * Loading and Saving and inverse. (e.g. save(load()) === identity).
 */

import { JsonValue } from 'src/lib/json/json';
import { AbstractSignal, SetableSignal, SignalSpace } from 'src/lib/signalspace/signalspace';
import { AbstractDataResolver } from './data-resolver';
import { CellController, SomeCellController } from '../distr-signals/cell-controller';
import { LabEnv } from '../distr-signals/lab-env';
import {
  Section,
  SecDefByPath,
  SecDefByRef,
  SomeSection,
  SecDefKind,
  SecDefWithData,
  SecDefOfSecList,
  SecDef,
  CellCodeRefKind,
  SectionCellData,
  cellIoForCellSection,
} from './section';
import { SignalReceiveChannel } from '../distr-signals/channels';
import { CellKind, ValueStruct } from '../distr-signals/cell-kind';

export type DistrSerialization<T, T2> = {
  data: T;
  subpathData?: { [path: string]: T2 };
};

function sectionListEqCheck(sections1: SomeSection[], sections2: SomeSection[]): boolean {
  if (sections1.length !== sections2.length) {
    return false;
  }
  // TODO: think about if this should be init.id or data.id.
  for (let i = 0; i < sections1.length; i++) {
    if (sections1[i].data().id !== sections2[i].data().id) {
      return false;
    }
  }
  return true;
}

// ============================================================================
export class Experiment {
  space: SignalSpace;

  // Invariant: Set(sections.values()) === Set(sectionOrdering)
  // Signals an update when list of ids changes.
  //
  topLevelSections: SetableSignal<SomeSection[]>;
  section: Section<SecDefOfSecList, ValueStruct, ValueStruct>;

  // Map from section id to the canonical ExpSection, for faster lookup, and
  // also for finding canonical instance.
  sectionMap: Map<string, SomeSection> = new Map();

  // The definition of this experiment.
  // def: SetableSignal<SecDefOfSecList>;

  // Code paths to JS code
  jsCode: Map<string, { rawCode: string; objUrl: URL }> = new Map();

  constructor(
    public env: LabEnv,
    public ancestors: Experiment[],
    public def: SecDefOfSecList,
    // public initSecDef: SecDefOfSecList,
    // How data gets resolved when loading. Needed for remote cell code paths,
    // etc.
    public dataResolver: AbstractDataResolver<JsonValue>,
  ) {
    this.space = env.space;

    const setableDefData = this.space.setable(def);
    this.section = new Section<SecDefOfSecList, ValueStruct, ValueStruct>(
      this,
      def,
      setableDefData,
    );
    this.topLevelSections = this.space.setable<SomeSection[]>([]);
    this.section.subSections = this.topLevelSections;

    // this.def = this.space.setable<SecDefOfSecList>(initSecDef);
    // Invariant: Set(sections.values()) === Set(sectionOrdering)
    // Signals an update when list of ids changes.
  }

  get id() {
    return this.section.def.id;
  }

  // get def(): SecDefOfSecList {
  //   return this.section.def as SecDefOfSecList;
  // }

  appendSectionFromRefDef(secRefDef: SecDefByRef): SomeSection {
    const existingSection = this.sectionMap.get(secRefDef.refId);
    let section: SomeSection;
    if (!existingSection) {
      throw new Error(`No such reference id to ${secRefDef.refId}`);
    }
    section = new Section(this, secRefDef, existingSection.data);
    existingSection.references.add(section);
    this.topLevelSections.change((sections) => sections.push(section));
    return section;
  }

  // TODO: when the loaded data contains further references and experiments,
  // these are not going to be handled correctly here. This will only work for
  // leaf data right now.
  async appendLeafSectionFromPathDef(
    secPathDef: SecDefByPath,
    resolvedDataDef: SecDefWithData,
  ): Promise<SomeSection> {
    // TODO: some subtly here about when what gets updated & how. e.g.
    // Users of setableDataDef should not be changing sectionData or sectionData.content
    const setableDataDef = this.space.setable(resolvedDataDef);
    const section = new Section(this, secPathDef, setableDataDef);
    this.sectionMap.set(secPathDef.id, section);
    this.topLevelSections.change((sections) => sections.push(section));
    return section;
  }

  // TODO: when the loaded data contains further references and experiments,
  // these are not going to be handled correctly here. This will only work for
  // leaf data right now.
  appendLeafSectionFromDataDef(secDef: SecDefWithData): SomeSection {
    const setableDataDef = this.space.setable(secDef);
    const section = new Section(this, secDef, setableDataDef);
    if (secDef.kind === SecDefKind.WorkerCell) {
      section.connectWorkerCell();
      section.initOutputs();
      section.connectInputsFromOutputs();
    } else if (secDef.kind === SecDefKind.UiCell) {
      section.initOutputs();
      section.connectInputsFromOutputs();
    } else {
      throw new Error(`unknown section kind in section: ${JSON.stringify(secDef)}`);
    }

    this.sectionMap.set(secDef.id, section);
    this.topLevelSections.change((sections) => sections.push(section));
    return section;
  }

  getSection(sectionId: string): SomeSection {
    const section = this.sectionMap.get(sectionId);
    if (!section) {
      throw Error(`No such section: ${sectionId}`);
    }
    return section;
  }

  // //
  // getJsonSectionContent(sectionId: string): AbstractSignal<JsonValue> {
  //   const section = this.getSection(sectionId);
  //   const data = section.data();
  //   if (data.kind !== SecDefKind.JsonObj) {
  //     throw Error(`Section Id (${sectionId}) was not JsonObj (was: ${data.kind})`);
  //   }
  //   return data.jsonValue;
  // }
  getSectionOutput(
    sectionId: string,
    outputId: string,
  ): AbstractSignal<unknown> | SignalReceiveChannel<unknown> {
    const section = this.getSection(sectionId);
    if (section.data().kind === SecDefKind.WorkerCell) {
      if (!section.cell) {
        throw Error(`Section Id (${sectionId}) was missing cell property`);
      }
      return section.cell.controller.outputs[outputId];
    } else {
      return section.outputs[outputId];
    }
  }

  getSectionLabCell(sectionId: string): SomeCellController {
    const section = this.getSection(sectionId);
    const data = section.data();
    if (data.kind !== SecDefKind.WorkerCell) {
      throw Error(`Section Id (${sectionId}) was not Cell (was: ${data.kind})`);
    }
    if (!section.cell) {
      throw Error(`Section Id (${sectionId}) was missing cell property`);
    }
    return section.cell.controller;
  }

  // Note: this.data() should contain the same as serialisedSections.map((s) => s.data);
  serialise(): DistrSerialization<SecDefWithData, SecDefWithData> {
    const subpathData = {} as { [path: string]: SecDefWithData };
    const subSectionDefs = this.topLevelSections().map((s) => s.serialise(subpathData));
    const data: SecDefWithData = { ...this.def, subsections: subSectionDefs };
    return { data, subpathData };
  }
}

type SecListBeingLoaded = {
  addedSubDefs: string[];
  subDefsToAdd: SecDef[];
  section: Section<SecDefOfSecList, ValueStruct, ValueStruct>;
};

export async function loadExperiment(
  dataResolver: AbstractDataResolver<JsonValue>,
  env: LabEnv,
  secListDef: SecDefOfSecList,
): Promise<Experiment> {
  const space = env.space;
  // const nodeDataMap: Map<string, SetableSignal<SecDefWithData>> = new Map();
  const refMap: Map<string, SecDefByRef> = new Map();

  // Sections that refer to another section, but the reference does not exist.
  const experiment = new Experiment(env, [], secListDef, dataResolver);
  // Map of all sections.
  const sectionMap: Map<string, SomeSection> = experiment.sectionMap;

  const topLevelNodeTree: SecListBeingLoaded = {
    addedSubDefs: [],
    subDefsToAdd: secListDef.subsections,
    section: experiment.section,
  };

  const sectionLists: Map<string, SecListBeingLoaded> = new Map();
  sectionLists.set(secListDef.id, topLevelNodeTree);

  // Tracking these to connect them after (the various input/output
  // connections/streams need to be initialised before we connect them, that
  // means they all need to be loaded first).
  const ioSections: SomeSection[] = [];

  // First part of loading is to load all paths and data into a NodeBeingLoaded
  // tree, and construct the sections.
  const loadNodeStack: SecListBeingLoaded[] = [];
  let cur = topLevelNodeTree as SecListBeingLoaded | undefined;

  // Part 1 of loading, populate sectionMap (all non reference sections) and
  // refMap (references to other sections).
  while (cur) {
    for (const subSecDef of cur.subDefsToAdd) {
      cur.addedSubDefs.push(subSecDef.id);

      switch (subSecDef.kind) {
        case SecDefKind.Path: {
          const data = await dataResolver.load(subSecDef.dataPath);
          const setableDataDef = space.setable<SecDefWithData>(data as SecDefWithData);
          // Paths always resolve to WorkerCell or UiCell
          // nodeDataMap.set(subSecDef.id, setableDataDef);
          const section = new Section(experiment, subSecDef, setableDataDef);
          sectionMap.set(subSecDef.id, section);
          ioSections.push(section);
          break;
        }
        case SecDefKind.Ref: {
          refMap.set(subSecDef.id, subSecDef);
          break;
        }
        case SecDefKind.SectionList: {
          const setableDataDef = space.setable(subSecDef);
          const section = new Section(experiment, subSecDef, setableDataDef);
          sectionMap.set(subSecDef.id, section as SomeSection);
          const beingLoaded: SecListBeingLoaded = {
            section,
            subDefsToAdd: subSecDef.subsections,
            addedSubDefs: [],
          };
          loadNodeStack.push(beingLoaded);
          sectionLists.set(subSecDef.id, beingLoaded);
          break;
        }
        case SecDefKind.UiCell: {
          const setableDataDef = space.setable(subSecDef);
          const section = new Section(experiment, subSecDef, setableDataDef);
          sectionMap.set(subSecDef.id, section as SomeSection);
          ioSections.push(section as SomeSection);
          break;
        }
        case SecDefKind.WorkerCell: {
          let cell: SectionCellData;
          const cellKind = new CellKind(subSecDef.id, cellIoForCellSection(subSecDef));
          const controller = new CellController(env, subSecDef.id, cellKind);

          switch (subSecDef.cellCodeRef.kind) {
            case CellCodeRefKind.PathToWorkerCode: {
              const buffer = await dataResolver.loadArrayBuffer(subSecDef.cellCodeRef.jsPath);
              const dec = new TextDecoder('utf-8');
              const cellCodeCache = dec.decode(buffer);
              const blob = new Blob([cellCodeCache], { type: 'application/javascript' });
              const cellObjectUrl = URL.createObjectURL(blob);
              cell = { controller, cellCodeCache, cellObjectUrl };
              break;
            }
            case CellCodeRefKind.InlineWorkerJsCode: {
              const blob = new Blob([subSecDef.cellCodeRef.js], { type: 'application/javascript' });
              const cellObjectUrl = URL.createObjectURL(blob);
              cell = { controller, cellCodeCache: subSecDef.cellCodeRef.js, cellObjectUrl };
              break;
            }
            case CellCodeRefKind.UrlToCode: {
              const buffer = await dataResolver.loadArrayBuffer(subSecDef.cellCodeRef.jsUrl);
              const dec = new TextDecoder('utf-8');
              const cellCodeCache = dec.decode(buffer);
              const blob = new Blob([cellCodeCache], { type: 'application/javascript' });
              const cellObjectUrl = URL.createObjectURL(blob);
              cell = { controller, cellCodeCache, cellObjectUrl };
              break;
            }
            default:
              throw new Error(`bad cellCodeRef: ${JSON.stringify(subSecDef.cellCodeRef)}`);
          }

          const setableDataDef = space.setable(subSecDef);
          const section = new Section(experiment, subSecDef, setableDataDef, cell);

          sectionMap.set(subSecDef.id, section as SomeSection);
          ioSections.push(section as SomeSection);
          break;
        }
        default:
          throw new Error(`Unknown section def kind: ${JSON.stringify(subSecDef)}`);
      }
    }
    // TODO: consider resolving more defined references in other experiments...?
    // or having the top-level experiment know about all sub-experiments?
    cur = loadNodeStack.pop();
  }

  // Second part is to resolve all section references, and set the subsections
  // for all sectionLists.
  for (const secListBeingLoaded of sectionLists.values()) {
    secListBeingLoaded.section.subSections = space.setable(
      secListBeingLoaded.addedSubDefs.map((id) => {
        const refData = refMap.get(id);
        if (refData) {
          const maybeSection = sectionMap.get(refData.refId);
          if (!maybeSection) {
            throw new Error(
              `Can not resolve ref section (${id}) to ${refData.refId}: no such section found.`,
            );
          }
          return new Section(experiment, refData, maybeSection.data);
        } else {
          const maybeSection = sectionMap.get(id);
          if (!maybeSection) {
            throw new Error(`Can not resolve section (${id}): no such section found.`);
          }
          return maybeSection;
        }
      }),
    );
  }

  // Finally, connect the outputs to inputs, and connect any direct cell connections
  for (const sec of ioSections) {
    sec.connectInputsFromOutputs();
    if (sec.data().kind === SecDefKind.WorkerCell) {
      sec.connectWorkerCell();
    }
  }

  return experiment;
}

export async function saveExperiment(
  dataResolver: AbstractDataResolver<JsonValue>,
  path: string,
  distrSectionDef: DistrSerialization<SecDefWithData, SecDefWithData>,
): Promise<void> {
  await dataResolver.save(path, distrSectionDef.data);
  for (const [p, d] of Object.entries(distrSectionDef.subpathData || {})) {
    await dataResolver.save(p, d);
  }
}
