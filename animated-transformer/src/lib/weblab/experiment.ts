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
import { AbstractDataResolver, jsonDecode, jsonEncode } from '../data-resolver/data-resolver';
import { CellController, CellStatus, SomeCellController } from '../distr-signals/cell-controller';
import { LabEnv } from '../distr-signals/lab-env';
import {
  Section,
  SecDefByPath,
  SecDefOfRef,
  SecDefKind,
  SecDefWithData,
  SecDefOfSecList,
  SecDef,
  SecDefOfWorker,
  SecDefOfPlaceholder,
  ListSection,
} from './section';
import { SignalReceiveChannel } from '../distr-signals/channels';
import { CellKind, ValueStruct } from '../distr-signals/cell-kind';
import { tryer } from '../utils';

export type DistrSerialization<T, T2> = {
  data: T;
  subpathData: { [path: string]: T2 };
};

function sectionListEqCheck(sections1: Section[], sections2: Section[]): boolean {
  if (sections1.length !== sections2.length) {
    return false;
  }
  // TODO: think about if this should be init.id or data.id.
  for (let i = 0; i < sections1.length; i++) {
    if (sections1[i].defData().id !== sections2[i].defData().id) {
      return false;
    }
  }
  return true;
}

export function prefixCacheCodePath(path: string[]): string[] {
  return ['CacheCodePath:', ...path];
}
export function prefixCacheCodeUrl(s: string[]): string[] {
  return ['CacheCodeUrl:', ...s];
}

// ============================================================================
export class Experiment {
  space: SignalSpace;

  // Invariant: Set(sections.values()) === Set(sectionOrdering)
  // Signals an update when list of ids changes.
  //
  section: ListSection;

  // Map from section id to the canonical ExpSection, for faster lookup, and
  // also for finding canonical instance.
  sectionMap: Map<string, Section> = new Map();

  // The definition of this experiment.
  // def: SetableSignal<SecDefOfSecList>;

  // Code paths to JS code
  // jsCode: Map<string, { rawCode: string; objUrl: URL }> = new Map();

  // For auto-complete plugging of cells/outputs.
  secIdsWithOutputs: SetableSignal<Set<string>>;

  constructor(
    public env: LabEnv,
    public ancestors: Experiment[],
    public def: SecDefOfSecList,
    // public initSecDef: SecDefOfSecList,
    // How data gets resolved when loading. Needed for remote cell code paths,
    // etc.
    public cacheResolver: AbstractDataResolver,
    public dataResolver: AbstractDataResolver,
  ) {
    this.space = env.space;
    this.section = new Section(this, def, null) as ListSection;
    this.section.initSubSections();

    this.secIdsWithOutputs = this.space.setable(new Set<string>());

    // this.topLevelSections = this.space.setable<SomeSection[]>([]);
    // this.section.subSections = this.topLevelSections;

    // this.def = this.space.setable<SecDefOfSecList>(initSecDef);
    // Invariant: Set(sections.values()) === Set(sectionOrdering)
    // Signals an update when list of ids changes.
  }

  get id() {
    return this.section.initDef.id;
  }

  get topLevelSections(): SetableSignal<Section[]> {
    return this.section.subSections as SetableSignal<Section[]>;
  }

  appendSectionFromRefDef(secRefDef: SecDefOfRef): Section {
    const section = new Section(this, secRefDef, this.section);
    this.appendSection(section);

    const existingSection = this.sectionMap.get(secRefDef.refId);
    if (!existingSection) {
      throw new Error(`No such reference id to ${secRefDef.refId}`);
    }
    existingSection.references.add(section);
    section.resolveRef(existingSection);
    this.appendSection(section);
    return section;
  }

  noteAddedIoSection(id: string) {
    this.secIdsWithOutputs.change((l) => l.add(id));
  }

  noteRenamedIoSection(oldId: string, newId: string) {
    this.secIdsWithOutputs.change((l) => {
      l.delete(oldId);
      l.add(newId);
    });
  }

  noteDeletedIoSection(id: string) {
    this.secIdsWithOutputs.change((l) => l.delete(id));
  }

  appendSection<S extends Section<any>>(s: S) {
    this.sectionMap.set(s.initDef.id, s);
    this.topLevelSections.change((sections) => sections.push(s));
  }

  // TODO: when the loaded data contains further references and experiments,
  // these are not going to be handled correctly here. This will only work for
  // leaf data right now.
  async appendLeafSectionFromPathDef(
    secPathDef: SecDefByPath,
    resolvedDataDef: SecDefWithData,
  ): Promise<Section<SecDefWithData>> {
    // TODO: some subtly here about when what gets updated & how. e.g.
    // Users of setableDataDef should not be changing sectionData or sectionData.content
    const section = new Section(this, secPathDef, this.section);
    this.appendSection(section);
    return section;
  }

  // TODO: when the loaded data contains further references and experiments,
  // these are not going to be handled correctly here. This will only work for
  // leaf data right now.
  async appendLeafSectionFromDataDef(secDef: SecDefWithData): Promise<Section<SecDefWithData>> {
    const section = new Section(this, secDef, this.section);
    if (section.isIoSection()) {
      if (section.isWorkerSection()) {
        await section.initSectionCellData(this.cacheResolver, this.dataResolver, {
          // TODO: think about if there are case where this needs to be false for
          // manual construction?
          fromCache: true,
        });
        section.connectWorkerCell();
      }
      section.initOutputs();
      section.connectInputsFromOutputs();
    }
    this.appendSection(section);
    return section;
  }

  insertPlaceholderSection(aboveSec: Section) {
    const secDef: SecDefOfPlaceholder = {
      kind: SecDefKind.Placeholder,
      id: `${Date.now()}`,
      display: { collapsed: false },
    };
    const newSection = new Section(this, secDef, this.section);
    this.sectionMap.set(secDef.id, newSection as Section);

    this.topLevelSections.change((oldList) => {
      const index = oldList.findIndex((s) => s === aboveSec);
      oldList.splice(index, 0, newSection);
    });
  }

  getSection(sectionId: string): Section {
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
    if (section.defData().kind === SecDefKind.WorkerCell) {
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
    const data = section.defData();
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

  deleteSection(section: Section) {
    if (!section.parent) {
      throw new Error(`Can't delete top level experiment section`);
    }
    const parentSubsections = section.parent.subSections();
    const idx = parentSubsections.findIndex((x) => x === section);
    section.parent.subSections.change((subsections) => subsections.splice(idx, 1));
    if (section.isWorkerSection()) {
      section.cell.controller.forceStop();
    }
    for (const dep of section.dependsOnMe) {
      dep.deleteSecIdInInputDeps(section.initDef.id);
    }

    this.sectionMap.delete(section.initDef.id);
    section.dispose();
  }
}

type SecListBeingLoaded = {
  // addedSubDefs: string[];
  subSecDefs: SecDef[];
  parentSection: ListSection;
};

export async function loadExperiment(
  cacheResolver: AbstractDataResolver,
  dataResolver: AbstractDataResolver,
  env: LabEnv,
  secListDef: SecDefOfSecList,
  config: {
    fromCache: boolean;
  },
): Promise<Experiment> {
  // Sections that refer to another section, but the reference does not exist.
  const experiment = new Experiment(env, [], secListDef, cacheResolver, dataResolver);
  const topLevelNodeTree: SecListBeingLoaded = {
    // addedSubDefs: [],
    subSecDefs: secListDef.subsections,
    parentSection: experiment.section,
  };

  // Tracking these to connect them after (the various input/output
  // connections/streams need to be initialised before we connect them, that
  // means they all need to be loaded first).
  const ioSections: Section[] = [];

  // First part of loading is to load all paths and data into a NodeBeingLoaded
  // tree, and construct the sections.
  const subsecListsToPopulate: SecListBeingLoaded[] = [topLevelNodeTree];
  // let cur = topLevelNodeTree as SecListBeingLoaded | undefined;

  // Part 1 of loading, populate sectionMap (all non reference sections) and
  // refMap (references to other sections).
  let cur: SecListBeingLoaded | undefined;
  while ((cur = subsecListsToPopulate.pop())) {
    for (const subSecDef of cur.subSecDefs) {
      // cur.addedSubDefs.push(subSecDef.id);
      const section = new Section(experiment, subSecDef, cur.parentSection);
      experiment.sectionMap.set(subSecDef.id, section as Section);
      cur.parentSection.subSections.change((secs) => secs.push(section));
      let subsecDefData: SecDefWithData;
      if (subSecDef.kind === SecDefKind.Path) {
        subsecDefData = jsonDecode(
          await dataResolver.loadStr([subSecDef.dataPath]),
        ) as SecDefWithData;
        section.defData.set(subsecDefData);
      } else {
        subsecDefData = subSecDef;
      }

      switch (subsecDefData.kind) {
        case SecDefKind.SectionList: {
          const listSection = section as ListSection;
          listSection.initSubSections();
          const toAddSubSecsTo: SecListBeingLoaded = {
            parentSection: listSection,
            subSecDefs: listSection.defData().subsections,
          };
          subsecListsToPopulate.push(toAddSubSecsTo);
          break;
        }
        case SecDefKind.UiCell:
        case SecDefKind.WorkerCell: {
          section.initOutputs();
          ioSections.push(section as Section);
          break;
        }
        case SecDefKind.Ref:
        case SecDefKind.Placeholder: {
          break;
        }
        default:
          throw new Error(`Unknown section def kind: ${JSON.stringify(subSecDef)}`);
      }
    }
  }

  // Finally, connect the outputs to inputs, and connect any direct cell connections
  for (const sec of ioSections) {
    sec.connectInputsFromOutputs();
    if (sec.isWorkerSection()) {
      await sec.initSectionCellData(cacheResolver, dataResolver, config);
      sec.connectWorkerCell();
    }
  }

  return experiment;
}

export async function saveExperiment(
  dataResolver: AbstractDataResolver,
  rootExperimentFilePath: string,
  distrSectionDef: DistrSerialization<SecDefWithData, JsonValue>,
): Promise<void> {
  await dataResolver.saveStr([rootExperimentFilePath], jsonEncode(distrSectionDef.data));
  for (const [p, d] of Object.entries(distrSectionDef.subpathData || {})) {
    await dataResolver.saveStr([p], jsonEncode(d));
  }
}
