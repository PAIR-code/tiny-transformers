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

import { Component, computed, input, Signal, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GTensor, SerializedGTensor, makeScalar } from 'src/lib/gtensor/gtensor';
import { BasicLmTaskConfig, Example, indexExample, RandLmTaskConfig } from 'src/lib/seqtasks/util';
import { defaultTransformerConfig } from 'src/lib/transformer/transformer_gtensor';
import { TrainStateConfig } from 'src/lib/trainer/train_state';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { taskRegistry } from 'src/lib/seqtasks/task_registry';
import { prepareBasicTaskTokenRep, strSeqPrepFnAddingFinalMask } from 'src/lib/tokens/token_gemb';
import { Batch, EnvModel, TrainConfig, trainerCellSpec } from './tiny-transformer-example/ailab';
import { LabEnv } from 'src/lib/weblab/lab-env';
import { LabState } from 'src/lib/weblab/lab-state';
import { varifyParams } from 'src/lib/gtensor/params';

// import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
// import { TensorImageModule } from '../tensor-image/tensor-image.module';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';

import { CodemirrorConfigEditorModule } from '../codemirror-config-editor/codemirror-config-editor.module';
// import { VegaChartModule } from '../vega-chart/vega-chart.module';
import { D3LineChartModule } from '../d3-line-chart/d3-line-chart.module';
import { AutoCompletedTextInputComponent } from '../auto-completed-text-input/auto-completed-text-input.component';

import { JsonStrListValidatorDirective } from '../form-validators/json-str-list-validator.directive';
import { TokenSeqDisplayComponent } from '../token-seq-display/token-seq-display.component';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AbstractDataResolver,
  ExpCellDisplayKind,
  ExpDefKind,
  Experiment,
  ExpSectionDataDef,
  loadExperiment,
  saveExperiment,
  SectionDataDef,
  SectionKind,
} from './experiment';

// ============================================================================
// TODO: maybe this should just be path <--> object ?
export class BrowserDirDataResolver implements AbstractDataResolver {
  constructor(public dirHandle: FileSystemDirectoryHandle) {}

  async load(path: string): Promise<SectionDataDef> {
    const fileHandle = await this.dirHandle.getFileHandle(path);
    const file = await fileHandle.getFile();
    const fileBuffer = await file.arrayBuffer();
    const dec = new TextDecoder('utf-8');
    const contents = dec.decode(fileBuffer);
    // TODO: add better file contents verification.
    const dataObject = JSON.parse(contents);
    return dataObject;
  }

  async save(path: string, nodeData: SectionDataDef): Promise<void> {
    const fileHandle = await this.dirHandle.getFileHandle(path);
    fileHandle.requestPermission({ mode: 'readwrite' });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(nodeData, null, 2));
    await writable.close();
  }
}

@Component({
    selector: 'app-web-colab',
    imports: [
        FormsModule,
        ReactiveFormsModule,
        // --
        MatSidenavModule,
        MatProgressBarModule,
        MatButtonModule,
        MatCardModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatListModule,
        MatMenuModule,
        MatSlideToggleModule,
        MatTableModule,
        MatSelectModule,
        MatButtonToggleModule,
        MatDialogModule,
        // // ---
        CodemirrorConfigEditorModule,
        // // VegaChartModule,
        D3LineChartModule,
        AutoCompletedTextInputComponent,
        TokenSeqDisplayComponent,
    ],
    templateUrl: './web-colab.component.html',
    styleUrl: './web-colab.component.scss'
})
export class WebColabComponent {
  error?: string;
  env: LabEnv;
  space: SignalSpace;
  experiment = signal<Experiment | null>(null);
  viewPath: Signal<Experiment[]>;
  dataResolver?: BrowserDirDataResolver;

  ExpDefKind = ExpDefKind;
  SectionKind = SectionKind;

  constructor(private route: ActivatedRoute, public router: Router, public dialog: MatDialog) {
    this.env = new LabEnv();
    this.space = new SignalSpace();

    this.viewPath = computed(() => {
      const exp = this.experiment();
      if (!exp) {
        return [];
      } else {
        return exp.ancestors;
      }
    });

    // const curPath = signal('/');

    // Consider... one liner... but maybe handy to have the object to debug.
    // const { writable, computed } = new SignalSpace();
    const { setable, derived } = this.space;
  }

  clearError() {
    delete this.error;
  }

  async newExperiment() {
    const initExpDef: ExpSectionDataDef = {
      kind: ExpDefKind.Data,
      id: 'top level exp name/id',
      timestamp: Date.now(),
      // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
      sectionData: {
        sectionKind: SectionKind.SubExperiment,
        sections: [],
      },
      displayKind: ExpCellDisplayKind.SubExperimentSummary,
    };
    const exp = new Experiment(this.space, [], initExpDef);
    const sec1: SectionDataDef = {
      kind: ExpDefKind.Data,
      id: 'about',
      timestamp: Date.now(),
      // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
      sectionData: {
        sectionKind: SectionKind.Markdown,
        markdown: 'foo',
      },
      displayKind: ExpCellDisplayKind.SubExperimentSummary,
    };
    exp.appendLeafSectionFromDataDef(sec1);
    this.experiment.set(exp);

    console.log('this.experiment set');
  }

  async doRun() {
    // const cell = this.env.start(trainerCellSpec, this.globals);
    // const lastTrainMetric = await cell.outputs.lastTrainMetric;
    // console.log(lastTrainMetric);
    // cell.worker.terminate();
  }

  async saveExperiment(experiment: Experiment) {
    if (!this.dataResolver) {
      const dirHandle = await self.showDirectoryPicker({ mode: 'readwrite' });
      this.dataResolver = new BrowserDirDataResolver(dirHandle);
    }
    saveExperiment(this.dataResolver, 'experiment.json', experiment.serialise());
  }

  closeExperiment() {
    this.experiment.set(null);
    delete this.dataResolver;
  }

  async loadExperiment() {
    try {
      const dirHandle = await self.showDirectoryPicker({ mode: 'readwrite' });
      this.dataResolver = new BrowserDirDataResolver(dirHandle);
      const secDataDef = await this.dataResolver.load('experiment.json');
      // TODO: actually do some validation...
      const expDef = secDataDef as ExpSectionDataDef;
      const exp = await loadExperiment(this.dataResolver, this.space, expDef);
      this.experiment.set(exp);
    } catch (error) {
      this.error = (error as Error).message;
      console.log(error);
    }
  }

  async doOpen() {
    const dirHandle = await self.showDirectoryPicker({ mode: 'readwrite' });
    const testFile = await dirHandle.getFileHandle('test.txt', {
      create: true,
    });
    const writable = await testFile.createWritable();
    await writable.write('hello there');
    await writable.close();
    console.log(dirHandle.name);
    // console.log(dirHandle.getFileHandle(''));
    for await (const entry of dirHandle.values()) {
      const perm = await entry.requestPermission({ mode: 'read' });
      console.log(entry.kind, entry.name, perm);
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        const dec = new TextDecoder('utf-8');
        console.log('file contains:', dec.decode(await file.arrayBuffer()));
      }
    }
  }
}
