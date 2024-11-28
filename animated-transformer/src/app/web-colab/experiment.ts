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
 * A concept of Experiments where each experiment consists of a list of
 * sections. Each Section is a kind. One of the kinds is itself an experiment.
 * Experiments are serialisable. Each section is either a reference to some
 * existing section (meaning that we show the section at this point in the
 * list), a path section (meaning that we have to load data from the given path
 * to get the data for that section), or an inline object (meaning that the
 * section's data is included directly in the experiment data as a subobject).
 *
 * Loading and Saving and inverse. (e.g. save(load()) === identity).
 */

import { SignalSpace } from 'src/lib/signalspace/signalspace';

export enum ExpCellKind {
  SubExperiment = 'SubExperiment',
  Markdown = 'Markdown',
  // todo: add more...
}

export enum ExpCellDisplayKind {
  Markdown = 'Markdown',
}

export enum ExpCellDataStatus {
  Resolving,
  HasData,
}

export enum ExpCellDataKind {
  Ref,
  Path,
  Object,
}

export type ExpCellIdRef = {
  kind: ExpCellDataKind.Ref;
  id: string;
};

export type ExpCellPathRef = {
  kind: ExpCellDataKind.Path;
  id: string;
  dataPath: string; // URI to a file containing ExpCellData.
};

export type ExpCellWithData = {
  kind: ExpCellDataKind.Object;
  id: string;
  data: ExpCellData<ExpCellKind>;
};

export type SubDataFn<K extends ExpCellKind> = K extends ExpCellKind.Markdown
  ? string
  : K extends ExpCellKind.SubExperiment
  ? ExperimentData
  : never;

export type ExpCellData<K extends ExpCellKind> = {
  kind: K;
  timestamp: number;
  // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
  object: SubDataFn<K>;
  displayKind: ExpCellDisplayKind;
};

export type ExpCellSerialisedData = ExpCellIdRef | ExpCellPathRef | ExpCellWithData;

export type ExperimentData = {
  id: string;
  timestamp: number;
  sectionData: ExpCellSerialisedData[];
};

export type DistrSerialization = {
  data: object;
  subpathData?: { [path: string]: object };
};

// ============================================================================
export class ExpSection {
  subExperiment?: Experiment;
  // References to this section.
  references: Set<ExpSection> = new Set();
  status = this.space.setable<ExpCellDataStatus>(ExpCellDataStatus.Resolving);
  data = this.space.setable<ExpCellData<ExpCellKind> | null>(null);
  constructor(public space: SignalSpace, public init: ExpCellSerialisedData) {}

  serialise(): DistrSerialization {
    if (this.init.kind === ExpCellDataKind.Ref || this.init.kind === ExpCellDataKind.Path) {
      return { data: this.init };
    } else {
      let data: ExpCellData<ExpCellKind> | null;
      // this.init.kind === ExpCellDataKind.Object
      let subpathData = {} as { [path: string]: object };
      if (this.subExperiment) {
        const serialisedSubExp = this.subExperiment.serialise();
        data = serialisedSubExp.data as ExpCellData<ExpCellKind>;
        subpathData = serialisedSubExp.subpathData || {};
      } else {
        data = this.data();
        if (!data) {
          throw new Error('Cannot serialise data, it is unexpectedly null');
        }
      }
      return {
        data: {
          id: this.init.id,
          kind: this.init.kind,
          data,
        },
        subpathData,
      };
    }
  }
}

// ============================================================================
// TODO: maybe this should just be path <--> object ?
export abstract class AbstractDataResolver {
  abstract loadSectionDataFromPath(path: string): Promise<ExpCellData<ExpCellKind>>;
  abstract saveSectionDataToPath(path: string, cellData: ExpCellData<ExpCellKind>): Promise<void>;

  abstract loadExperimentDataToPath(path: string): Promise<ExperimentData>;
  abstract saveExperimentDataToPath(path: string, expData: ExperimentData): Promise<void>;
}

function listIdEqCheck(sections1: ExpSection[], sections2: ExpSection[]): boolean {
  if (sections1.length !== sections2.length) {
    return false;
  }
  // TODO: think about if this should be init.id or data.id.
  for (let i = 0; i < sections1.length; i++) {
    if (sections1[i].init.id !== sections2[i].init.id) {
      return false;
    }
  }
  return true;
}

function maybeResolvePendingSection(
  pendingSectionIdData: Map<string, ExpSection[]>,
  section: ExpSection
): void {
  const pendingSectionMatch = pendingSectionIdData.get(section.init.id);
  if (pendingSectionMatch) {
    for (const refSection of pendingSectionMatch) {
      refSection.data = section.data;
      section.references.add(refSection);
    }
    pendingSectionIdData.delete(section.init.id);
  }
}

// ============================================================================
export class Experiment {
  id: string;

  // Invariant: Set(sections.values()) === Set(sectionOrdering)
  // Signals an update when list of ids changes.
  sections = this.space.setable<ExpSection[]>([], { eqCheck: listIdEqCheck });

  // Map from section id to the canonical ExpSection, for faster lookup, and
  // also for finding canonical instance.
  sectionMap: Map<string, ExpSection> = new Map();

  // From Paths to their sections. Only for cells with paths.
  // cellPathMap: Map<string, ExpSection> = new Map();

  constructor(
    public space: SignalSpace,
    public dataResolver: AbstractDataResolver,
    public ancestors: Experiment[],
    public data: ExperimentData
  ) {
    this.id = data.id;

    const pendingSectionIdData: Map<string, ExpSection[]> = new Map();

    const sections: ExpSection[] = [];
    for (const d of data.sectionData) {
      switch (d.kind) {
        case ExpCellDataKind.Ref: {
          const existingSection = this.sectionMap.get(d.id);
          if (existingSection) {
            const section = new ExpSection(space, d);
            sections.push(section);
            section.data = existingSection.data;
            existingSection.references.add(section);
          } else {
            const section = new ExpSection(space, d);
            sections.push(section);
            const pendingRefList = pendingSectionIdData.get(d.id);
            if (pendingRefList) {
              pendingRefList.push(section);
            } else {
              pendingSectionIdData.set(d.id, [section]);
            }
          }
          break;
        }
        case ExpCellDataKind.Path: {
          const section = new ExpSection(space, d);
          maybeResolvePendingSection(pendingSectionIdData, section);
          // Only ok because we are in the constructor.
          sections.push(section);
          this.sectionMap.set(section.init.id, section);
          // this.cellPathMap.set(d.dataPath, section);
          dataResolver.loadSectionDataFromPath(d.dataPath).then((d) => {
            section.data.set(d);
            section.status.set(ExpCellDataStatus.HasData);
          });
          break;
        }
        case ExpCellDataKind.Object: {
          const section = new ExpSection(space, d);
          maybeResolvePendingSection(pendingSectionIdData, section);
          const sectionData = d.data;
          section.data.set(sectionData);
          // TODO: double check this typing.
          if (sectionData.kind === ExpCellKind.SubExperiment) {
            ancestors = [...this.ancestors, this];
            section.subExperiment = new Experiment(
              this.space,
              this.dataResolver,
              ancestors,
              sectionData.object as ExperimentData
            );
          }
          sections.push(section);
          this.sectionMap.set(section.init.id, section);
          break;
        }
        default:
          throw new Error(`Unknown ExpCellDataKind in sectionData: ${JSON.stringify(d)}`);
      }
    }

    if (pendingSectionIdData.size > 0) {
      for (const k of pendingSectionIdData.keys()) {
        console.warn(`Unresolved section id: ${k}`);
      }
      throw new Error(`Unresolved sections: ${pendingSectionIdData.size}`);
    }

    this.sections.set(sections);
  }

  serialise(): DistrSerialization {
    const serialisedSections = this.sections().map((s) => s.serialise());
    const sectionData = serialisedSections.map((s) => s.data);
    const allSubPathData = {} as { [path: string]: object };
    for (const section of serialisedSections) {
      if (section.subpathData) {
        for (const subpath of Object.keys(allSubPathData)) {
          if (subpath in allSubPathData) {
            throw new Error(
              `There should only ever be one reference to a subpath, but got too for: ${subpath}`
            );
          }
          allSubPathData[subpath] = section.subpathData[subpath];
        }
      }
    }
    const expData = {
      id: this.id,
      sectionData,
      timestamp: Date.now(),
    } as ExperimentData;

    return {
      data: expData,
      subpathData: allSubPathData,
    };
  }
}
