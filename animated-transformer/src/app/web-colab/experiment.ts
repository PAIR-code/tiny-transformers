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

import { SetableSignal, SignalSpace } from 'src/lib/signalspace/signalspace';

export enum SectionKind {
  SubExperiment = 'SubExperiment',
  Markdown = 'Markdown',
  // todo: add more...
}

export type SectionData =
  | {
      sectionKind: SectionKind.Markdown;
      markdown: string;
    }
  | {
      sectionKind: SectionKind.SubExperiment;
      sections: SectionDef[];
    };

export enum ExpCellDisplayKind {
  RenderedMarkdown = 'RenderedMarkdown',
  SubExperimentSummary = 'SubExperimentSummary',
}

// export enum ExpCellDataStatus {
//   Resolving,
//   HasData,
// }

export enum ExpDefKind {
  Ref = 'Ref',
  Path = 'Path',
  Data = 'Data',
}

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
  sectionData: SectionData;
  displayKind: ExpCellDisplayKind;
};

export type ExpSectionDataDef = {
  kind: ExpDefKind.Data;
  id: string;
  timestamp: number;
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  sectionData: {
    sectionKind: SectionKind.SubExperiment;
    sections: SectionDef[];
  };
  displayKind: ExpCellDisplayKind;
};

export type SectionDef = SectionRefDef | SectionPathDef | SectionDataDef;

export type DistrSerialization<T> = {
  data: T;
  subpathData?: { [path: string]: T };
};

// ============================================================================
export class Section {
  // Only set when
  subExperiment?: Experiment;
  // References to this section.
  references: Set<Section> = new Set();

  constructor(public def: SectionDef, public data: SetableSignal<SectionDataDef>) {}

  serialise(): DistrSerialization<SectionDef> {
    if (this.def.kind === ExpDefKind.Ref) {
      return { data: this.def };
    } else if (this.def.kind === ExpDefKind.Path) {
      const subpathData = {} as { [path: string]: SectionDef };
      subpathData[this.def.dataPath] = this.data();
      return {
        data: this.def,
        subpathData,
      };
    } else {
      if (this.subExperiment) {
        return this.subExperiment.serialise();
      } else {
        return {
          data: this.data(),
        };
      }
    }
  }
}

// ============================================================================
// TODO: maybe this should just be path <--> object ?
export abstract class AbstractDataResolver {
  abstract load(path: string): Promise<SectionDataDef>;
  abstract save(path: string, nodeData: SectionDataDef): Promise<void>;
}

export class InMemoryDataResolver implements AbstractDataResolver {
  constructor(public nodes: { [id: string]: SectionDataDef }) {}

  async load(path: string): Promise<SectionDataDef> {
    if (!(path in this.nodes)) {
      throw new Error(`no such cell path entry: ${path}`);
    }
    return structuredClone(this.nodes[path]);
  }
  async save(path: string, sectionDataDef: SectionDataDef): Promise<void> {
    this.nodes[path] = structuredClone(sectionDataDef);
  }
}

function sectionListEqCheck(sections1: Section[], sections2: Section[]): boolean {
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
  // Invariant: Set(sections.values()) === Set(sectionOrdering)
  // Signals an update when list of ids changes.
  sections = this.space.setable<Section[]>([], { eqCheck: sectionListEqCheck });

  // Map from section id to the canonical ExpSection, for faster lookup, and
  // also for finding canonical instance.
  sectionMap: Map<string, Section> = new Map();

  // From Paths to their sections. Only for cells with paths.
  // cellPathMap: Map<string, ExpSection> = new Map();
  data: SetableSignal<ExpSectionDataDef>;

  constructor(
    public space: SignalSpace,
    public ancestors: Experiment[],
    public initData: ExpSectionDataDef
  ) {
    this.data = this.space.setable<ExpSectionDataDef>(initData);
  }

  get id() {
    return this.data().id;
  }

  appendSectionFromRefDef(node: SectionRefDef): Section {
    const existingSection = this.sectionMap.get(node.refId);
    let section: Section;
    if (!existingSection) {
      throw new Error(`No such reference id to ${node.refId}`);
    }
    section = new Section(node, existingSection.data);
    section.data = existingSection.data;
    existingSection.references.add(section);
    this.sections.change((sections) => sections.push(section));
    return section;
  }

  // TODO: when the loaded data contains further references and experiments,
  // these are not going to be handled correctly here. This will only work for
  // leaf data right now.
  async appendLeafSectionFromPathDef(
    dataResolver: AbstractDataResolver,
    def: SectionPathDef
  ): Promise<Section> {
    const data = await dataResolver.load(def.dataPath);
    const setableData = this.space.setable(data);
    const section = new Section(def, setableData);
    this.sectionMap.set(def.id, section);
    this.sections.change((sections) => sections.push(section));
    return section;
  }

  // TODO: when the loaded data contains further references and experiments,
  // these are not going to be handled correctly here. This will only work for
  // leaf data right now.
  appendLeafSectionFromDataDef(def: SectionDataDef): Section {
    const setableData = this.space.setable(def);
    const section = new Section(def, setableData);
    this.sectionMap.set(def.id, section);
    this.sections.change((sections) => sections.push(section));
    return section;
  }

  // Note: this.data() should contain the same as serialisedSections.map((s) => s.data);
  serialise(): DistrSerialization<SectionDef> {
    const allSubPathData = {} as { [path: string]: SectionDef };

    const serialisedSections = this.sections().map((s) => s.serialise());
    for (const section of serialisedSections) {
      // console.log(`exp serialise section: ${JSON.stringify(section.data, null, 2)}`);
      if (section.subpathData) {
        for (const subpath of Object.keys(section.subpathData)) {
          if (subpath in allSubPathData) {
            throw new Error(
              `There should only ever be one reference to a subpath, but got too for: ${subpath}`
            );
          }
          allSubPathData[subpath] = section.subpathData[subpath];
        }
      }
    }
    const expData: SectionDef = this.data();

    return {
      data: expData,
      subpathData: allSubPathData,
    };
  }
}

// Intermediary type for a section being defined that consists of it's
// subsection IDs and the initial empty experiment.
type NodeBeingLoaded = {
  subSections: string[];
  exp: Experiment;
};

export async function loadExperiment(
  dataResolver: AbstractDataResolver,
  space: SignalSpace,
  data: ExpSectionDataDef
): Promise<Experiment> {
  // Map from section id to the canonical ExpSection, for faster lookup, and
  // also for finding canonical instance.
  const sectionMap: Map<string, Section> = new Map();
  const nodeDataMap: Map<string, SetableSignal<SectionDataDef>> = new Map();
  const refMap: Map<string, SectionRefDef> = new Map();
  // Sections that refer to another section, but the reference does not exist.
  const topLevelExperiment = new Experiment(space, [], data);
  const topLevelNodeTree: NodeBeingLoaded = {
    subSections: [],
    exp: topLevelExperiment,
  };
  const loadingMap: Map<string, NodeBeingLoaded> = new Map();
  loadingMap.set(data.id, topLevelNodeTree);

  // First part of loading is to load all paths and data into a NodeBeingLoaded
  // tree, and construct the sections.
  const loadNodeStack: NodeBeingLoaded[] = [];
  let cur = topLevelNodeTree as NodeBeingLoaded | undefined;
  while (cur) {
    for (const sectionData of cur.exp.data().sectionData.sections) {
      cur.subSections.push(sectionData.id);
      if (sectionData.kind === ExpDefKind.Data) {
        const setableData = space.setable(sectionData);
        nodeDataMap.set(sectionData.id, setableData);
        const expSection = new Section(sectionData, setableData);
        sectionMap.set(sectionData.id, expSection);
        if (sectionData.sectionData.sectionKind === SectionKind.SubExperiment) {
          expSection.subExperiment = new Experiment(
            space,
            [...cur.exp.ancestors, cur.exp],
            sectionData as ExpSectionDataDef
          );
          const beingLoaded = {
            // TODO: all subexp share the same section map, and
            // this would then make sections have, essentially, module imports?
            exp: expSection.subExperiment,
            subSections: [],
          };
          loadNodeStack.push(beingLoaded);
          loadingMap.set(sectionData.id, beingLoaded);
        }
      } else if (sectionData.kind === ExpDefKind.Path) {
        const data = await dataResolver.load(sectionData.dataPath);
        const setableData = space.setable(data);
        nodeDataMap.set(sectionData.id, setableData);
        const expSection = new Section(sectionData, setableData);
        sectionMap.set(sectionData.id, expSection);
      } else if (sectionData.kind === ExpDefKind.Ref) {
        refMap.set(sectionData.id, sectionData);
      }
    }
    // TODO: consider resolving more defined references in other experiments...?
    // or having the top-level experiment know about all sub-experiments?
    cur = loadNodeStack.pop();
  }

  // Second part is to resolve all section references, and set the sections for each experiment.
  for (const toResolve of loadingMap.values()) {
    toResolve.exp.sections.set(
      toResolve.subSections.map((id) => {
        const refData = refMap.get(id);
        if (refData) {
          const maybeSection = sectionMap.get(refData.refId);
          if (!maybeSection) {
            throw new Error(
              `Can not resolve ref section (${id}) to ${refData.refId}: no such section found.`
            );
          }
          return new Section(refData, maybeSection.data);
        } else {
          const maybeSection = sectionMap.get(id);
          if (!maybeSection) {
            throw new Error(`Can not resolve section (${id}): no such section found.`);
          }
          return maybeSection;
        }
      })
    );
    toResolve.exp.sectionMap = sectionMap;
  }

  return topLevelExperiment;
}
