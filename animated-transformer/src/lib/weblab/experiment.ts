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
import { SomeCellController } from '../distr-signals/cell-controller';
import { LabEnv } from '../distr-signals/lab-env';
import {
  CellKind,
  Kind,
  SomeCellKind,
  SomeWorkerCellKind,
  ValueKindFnStruct,
  WorkerCellKind,
} from '../distr-signals/cell-kind';
import {
  CellRefKind,
  Section,
  SecDefByPath,
  SecDefByRef,
  SomeSection,
  SecDefKind,
  SecDefWithData,
  SecDefOfExperiment,
  SecDefOfWorker,
} from './section';
import { SignalReceiveChannel } from '../distr-signals/channels';

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
  sections: SetableSignal<SomeSection[]>;

  // Map from section id to the canonical ExpSection, for faster lookup, and
  // also for finding canonical instance.
  sectionMap: Map<string, SomeSection> = new Map();

  // The definition of this experiment.
  def: SetableSignal<SecDefOfExperiment>;

  // Code paths to JS code
  jsCode: Map<string, { rawCode: string; objUrl: URL }> = new Map();

  constructor(
    public env: LabEnv,
    public ancestors: Experiment[],
    public initSecDef: SecDefOfExperiment,
    // Map from a cellKind Id to a CellKind obj Set during/before creation of
    // experiment to allow creation of cellKinds needed in a section to create a
    // cell.
    public workerCellRegistry: Map<string, SomeWorkerCellKind>,
  ) {
    this.space = env.space;
    this.def = this.space.setable<SecDefOfExperiment>(initSecDef);
    // Invariant: Set(sections.values()) === Set(sectionOrdering)
    // Signals an update when list of ids changes.
    this.sections = this.space.setable<SomeSection[]>([], { eqCheck: sectionListEqCheck });
  }

  get id() {
    return this.def().id;
  }

  appendSectionFromRefDef(secRefDef: SecDefByRef): SomeSection {
    const existingSection = this.sectionMap.get(secRefDef.refId);
    let section: SomeSection;
    if (!existingSection) {
      throw new Error(`No such reference id to ${secRefDef.refId}`);
    }
    section = new Section(this, secRefDef, existingSection.data);
    existingSection.references.add(section);
    this.sections.change((sections) => sections.push(section));
    this.def.change((data) => data.subsections.push(secRefDef));
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
    this.sections.change((sections) => sections.push(section));
    this.def.change((data) => data.subsections.push(secPathDef));
    return section;
  }

  // TODO: when the loaded data contains further references and experiments,
  // these are not going to be handled correctly here. This will only work for
  // leaf data right now.
  appendLeafSectionFromDataDef(secDef: SecDefWithData): SomeSection {
    const setableDataDef = this.space.setable(secDef);
    const section = new Section(this, secDef, setableDataDef);
    if (secDef.kind === SecDefKind.WorkerCell) {
      section.initOutputs();
      section.initInputs();
      section.connectWorkerCell();
      if (secDef.cellCodeRef.kind === CellRefKind.PathToWorkerCode) {
        // TODO: Load code into object URL and setup cell...
        throw new Error('not yet implmented');
        // const data = await dataResolver.load(subSec.cellCodeRef.path);
        // if (data instanceof Error) {
        //   return data;
        // }
      }
    } else if (secDef.kind === SecDefKind.UiCell) {
      section.initOutputs();
      section.initInputs();
    } else {
      throw new Error(`unknown section kind in section: ${JSON.stringify(secDef)}`);
    }

    this.sectionMap.set(secDef.id, section);
    this.sections.change((sections) => sections.push(section));
    this.def.change((data) => data.subsections.push(secDef));
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
      return section.cell.outputs[outputId];
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
    return section.cell;
  }

  // Note: this.data() should contain the same as serialisedSections.map((s) => s.data);
  serialise(): DistrSerialization<SecDefWithData, SecDefWithData> {
    const allSubPathData = {} as { [path: string]: SecDefWithData };
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

    const expData: SecDefWithData = this.def();
    return {
      data: expData,
      subpathData: allSubPathData,
    };
  }
}

function cellIoForSection(c: SecDefOfWorker): {
  inputs: ValueKindFnStruct;
  outputs: ValueKindFnStruct;
  inStreams: ValueKindFnStruct;
  outStreams: ValueKindFnStruct;
} {
  const inputs: ValueKindFnStruct = {};
  for (const k of Object.keys(c.io.inputs || {})) {
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

function cellKindForSection(c: SecDefOfWorker): SomeCellKind {
  return new CellKind(c.id, cellIoForSection(c));
}

function cellWorkerKindForSection(c: SecDefOfWorker, url: string): SomeWorkerCellKind {
  return new WorkerCellKind(c.id, cellIoForSection(c), () => new Worker(url));
}

// Intermediary type for a section being defined that consists of it's
// subsection IDs and the initial empty experiment.
type NodeBeingLoaded = {
  subSections: string[];
  exp: Experiment;
};

export async function loadExperiment(
  cellRegistry: Map<string, SomeWorkerCellKind>,
  dataResolver: AbstractDataResolver<JsonValue>,
  env: LabEnv,
  expDef: SecDefOfExperiment,
): Promise<Experiment | Error> {
  const space = env.space;
  // Map from section id to the canonical ExpSection, for faster lookup, and
  // also for finding canonical instance.
  const sectionMap: Map<string, SomeSection> = new Map();
  const nodeDataMap: Map<string, SetableSignal<SecDefWithData>> = new Map();
  const refMap: Map<string, SecDefByRef> = new Map();
  // Sections that refer to another section, but the reference does not exist.
  const topLevelExperiment = new Experiment(env, [], expDef, cellRegistry);
  const topLevelNodeTree: NodeBeingLoaded = {
    subSections: [],
    exp: topLevelExperiment,
  };
  const loadingMap: Map<string, NodeBeingLoaded> = new Map();
  loadingMap.set(expDef.id, topLevelNodeTree);

  // Tracking these to connect them (the various input/output
  // connections/streams) after.
  const ioSections: SomeSection[] = [];

  // First part of loading is to load all paths and data into a NodeBeingLoaded
  // tree, and construct the sections.
  const loadNodeStack: NodeBeingLoaded[] = [];
  let cur = topLevelNodeTree as NodeBeingLoaded | undefined;

  while (cur) {
    for (const subSec of cur.exp.def().subsections) {
      cur.subSections.push(subSec.id);
      if (subSec.kind === SecDefKind.Path) {
        const data = await dataResolver.load(subSec.dataPath);
        if (data instanceof Error) {
          return data;
        }
        const setableDataDef = space.setable<SecDefWithData>(data as SecDefWithData);
        nodeDataMap.set(subSec.id, setableDataDef);
        const expSection = new Section(topLevelExperiment, subSec, setableDataDef);
        sectionMap.set(subSec.id, expSection);
      } else if (subSec.kind === SecDefKind.Ref) {
        refMap.set(subSec.id, subSec);
      } else {
        const setableDataDef = space.setable(subSec);
        nodeDataMap.set(subSec.id, setableDataDef);
        const section = new Section(topLevelExperiment, subSec, setableDataDef);
        sectionMap.set(subSec.id, section);
        if (subSec.kind === SecDefKind.Experiment) {
          // TODO: think about if we really want sub-experiments..., maybe
          // better just subsections?
          section.subExperiment = new Experiment(
            env,
            [...cur.exp.ancestors, cur.exp],
            subSec,
            cellRegistry,
          );
          const beingLoaded = {
            // TODO: all subexp share the same section map, and
            // this would then make sections have, essentially, module imports?
            exp: section.subExperiment,
            subSections: [],
          };
          loadNodeStack.push(beingLoaded);
          loadingMap.set(subSec.id, beingLoaded);
        } else if (subSec.kind === SecDefKind.WorkerCell) {
          ioSections.push(section);

          // Add to worker registry... (TODO: think about how this is
          // initialised... / set / refreshed)
          if (subSec.cellCodeRef.kind === CellRefKind.InlineWorkerJsCode) {
            const blob = new Blob([subSec.cellCodeRef.js], { type: 'application/javascript' });
            // TODO: think about cleanup... need to track and dispose of this when code
            // is no longer linked to a cell.
            const url = URL.createObjectURL(blob);
            topLevelExperiment.workerCellRegistry.set(
              subSec.id,
              cellWorkerKindForSection(subSec, url),
            );
          } else if (subSec.cellCodeRef.kind === CellRefKind.PathToWorkerCode) {
            const buffer = await dataResolver.loadArrayBuffer(subSec.cellCodeRef.path);
            if (buffer instanceof Error) {
              throw buffer;
            }
            const dec = new TextDecoder('utf-8');
            const contents = dec.decode(buffer);
            const blob = new Blob([contents], { type: 'application/javascript' });
            // TODO: think about cleanup... need to track and dispose of this when code
            // is no longer linked to a cell.
            const url = URL.createObjectURL(blob);
            topLevelExperiment.workerCellRegistry.set(
              subSec.id,
              cellWorkerKindForSection(subSec, url),
            );
          }
        } else if (subSec.kind === SecDefKind.UiCell) {
          ioSections.push(section);
        } else {
          throw new Error(`unknown section kind in section: ${JSON.stringify(subSec)}`);
        }
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
          return new Section(topLevelExperiment, refData, maybeSection.data);
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

  for (const sec of ioSections) {
    sec.initOutputs();
    // cellSection.connectCell();
  }
  for (const sec of ioSections) {
    sec.initInputs();
    if (sec.data().kind === SecDefKind.WorkerCell) {
      sec.connectWorkerCell();
    }
    // cellSection.connectCell();
  }

  return topLevelExperiment;
}

export async function saveExperiment(
  dataResolver: AbstractDataResolver<JsonValue>,
  path: string,
  distrSectionDef: DistrSerialization<SecDefWithData, SecDefWithData>,
): Promise<Error | null> {
  const saveErrorOrNull = await dataResolver.save(path, distrSectionDef.data);
  if (saveErrorOrNull) {
    return saveErrorOrNull;
  }
  const pathsAndData = distrSectionDef.subpathData;
  if (!pathsAndData) {
    return null;
  }
  for (const [p, d] of Object.entries(pathsAndData)) {
    const subpathErrror = await dataResolver.save(p, d);
    if (subpathErrror) {
      return subpathErrror;
    }
  }
  return null;
}
