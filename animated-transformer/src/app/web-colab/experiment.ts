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
import { SetableSignal, SignalSpace } from 'src/lib/signalspace/signalspace';

export enum SectionKind {
  SubExperiment = 'SubExperiment',
  Markdown = 'Markdown',
  JsonObj = 'JsonObj',
  // todo: add more...
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

export type SomeSectionData = SectionData<SectionKind, any>;

// export enum ExpCellDisplayKind {
//   RenderedMarkdown = 'RenderedMarkdown',
//   SubExperimentSummary = 'SubExperimentSummary',
// }

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
  sectionData: SomeSectionData;
  // displayKind: ExpCellDisplayKind;
};

export type ExpSectionDataDef = {
  kind: ExpDefKind.Data;
  id: string;
  timestamp: number;
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  sectionData: SubExpSectionData;
  // displayKind: ExpCellDisplayKind;
};

export type SectionDef = SectionRefDef | SectionPathDef | SectionDataDef;

export type DistrSerialization<T, T2> = {
  data: T;
  subpathData?: { [path: string]: T2 };
};

// ============================================================================
export class Section {
  // Only set when
  subExperiment?: Experiment;
  // References to this section.
  references: Set<Section> = new Set();

  constructor(
    public def: SectionDef,
    public data: SetableSignal<SectionDataDef>,
    public content: SetableSignal<{}>,
  ) {
    data.space.derived(() => {
      const curContent = this.content();
      const f = (oldData: SectionDataDef) => (oldData.sectionData.content = curContent);
      this.data.change(f);
    });
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
      //
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
    // TODO: remove the now un-needed derivedLazy dep.
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
    public initData: ExpSectionDataDef,
  ) {
    this.data = this.space.setable<ExpSectionDataDef>(initData);
  }

  get id() {
    return this.data().id;
  }

  appendSectionFromRefDef(secRefDef: SectionRefDef): Section {
    const existingSection = this.sectionMap.get(secRefDef.refId);
    let section: Section;
    if (!existingSection) {
      throw new Error(`No such reference id to ${secRefDef.refId}`);
    }
    section = new Section(secRefDef, existingSection.data, existingSection.content);
    section.data = existingSection.data;
    existingSection.references.add(section);
    this.sections.change((sections) => sections.push(section));
    this.data.change((data) => data.sectionData.content.push(secRefDef));
    return section;
  }

  // TODO: when the loaded data contains further references and experiments,
  // these are not going to be handled correctly here. This will only work for
  // leaf data right now.
  async appendLeafSectionFromPathDef(
    secPathDef: SectionPathDef,
    resolvedDataDef: SectionDataDef,
  ): Promise<Section> {
    // TODO: some subtly here about when what gets updated & how. e.g.
    // Users of setableDataDef should not be changing sectionData or sectionData.content
    const setableDataDef = this.space.setable(resolvedDataDef);
    const setableDataContent = this.space.setable(resolvedDataDef.sectionData.content);
    const section = new Section(secPathDef, setableDataDef, setableDataContent);
    this.sectionMap.set(secPathDef.id, section);
    this.sections.change((sections) => sections.push(section));
    this.data.change((data) => data.sectionData.content.push(secPathDef));
    return section;
  }

  // TODO: when the loaded data contains further references and experiments,
  // these are not going to be handled correctly here. This will only work for
  // leaf data right now.
  appendLeafSectionFromDataDef(def: SectionDataDef): Section {
    const setableDataDef = this.space.setable(def);
    const setableDataContent = this.space.setable(def.sectionData.content);
    const section = new Section(def, setableDataDef, setableDataContent);
    this.sectionMap.set(def.id, section);
    this.sections.change((sections) => sections.push(section));
    this.data.change((data) => data.sectionData.content.push(def));
    return section;
  }

  // Note: this.data() should contain the same as serialisedSections.map((s) => s.data);
  serialise(): DistrSerialization<SectionDataDef, SectionDataDef> {
    const allSubPathData = {} as { [path: string]: SectionDataDef };
    const serialisedSections = this.sections().map((s) => s.serialise());
    for (const section of serialisedSections) {
      if (section.subpathData) {
        for (const subpath of Object.keys(section.subpathData)) {
          if (subpath in allSubPathData) {
            throw new Error(
              `There should only ever be one reference to a subpath, but got two for: ${subpath}`,
            );
          }
          allSubPathData[subpath] = section.subpathData[subpath];
        }
      }
    }

    const expData: SectionDataDef = this.data();
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
  data: ExpSectionDataDef,
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
    for (const sectionData of cur.exp.data().sectionData.content) {
      cur.subSections.push(sectionData.id);
      if (sectionData.kind === ExpDefKind.Data) {
        const setableDataDef = space.setable(sectionData);
        const setableDataContent = space.setable(sectionData.sectionData.content);
        nodeDataMap.set(sectionData.id, setableDataDef);
        const expSection = new Section(sectionData, setableDataDef, setableDataContent);
        sectionMap.set(sectionData.id, expSection);
        if (sectionData.sectionData.sectionKind === SectionKind.SubExperiment) {
          expSection.subExperiment = new Experiment(
            space,
            [...cur.exp.ancestors, cur.exp],
            sectionData as ExpSectionDataDef,
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
        const setableDataDef = space.setable(data);
        const setableDataContent = space.setable(data.sectionData.content);
        nodeDataMap.set(sectionData.id, setableDataDef);
        const expSection = new Section(sectionData, setableDataDef, setableDataContent);
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
              `Can not resolve ref section (${id}) to ${refData.refId}: no such section found.`,
            );
          }
          return new Section(refData, maybeSection.data, maybeSection.content);
        } else {
          const maybeSection = sectionMap.get(id);
          if (!maybeSection) {
            throw new Error(`Can not resolve section (${id}): no such section found.`);
          }
          return maybeSection;
        }
      }),
    );
    toResolve.exp.sectionMap = sectionMap;
  }

  return topLevelExperiment;
}

export async function saveExperiment(
  dataResolver: AbstractDataResolver,
  path: string,
  distrSectionDef: DistrSerialization<SectionDataDef, SectionDataDef>,
): Promise<void> {
  dataResolver.save(path, distrSectionDef.data);
  const pathsAndData = distrSectionDef.subpathData;
  if (!pathsAndData) {
    return;
  }
  for (const [p, d] of Object.entries(pathsAndData)) {
    dataResolver.save(p, d);
  }
}
