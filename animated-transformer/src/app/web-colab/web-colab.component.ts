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

import { Component, computed, Signal, signal } from '@angular/core';

import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { LabEnv } from 'src/lib/weblab/lab-env';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
// import { TensorImageModule } from '../tensor-image/tensor-image.module';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import {
  // ExpCellDisplayKind,
  ExpDefKind,
  Experiment,
  ExpSectionDataDef,
  loadExperiment,
  saveExperiment,
  SectionDataDef,
  SectionKind,
} from './experiment';
import { LocalCacheStoreService } from '../localcache-store.service';
import {
  AbstractDataResolver,
  BrowserDirDataResolver,
  LocalCacheDataResolver,
} from './data-resolver';
import { SectionComponent } from './section/section.component';

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
    SectionComponent,
  ],
  templateUrl: './web-colab.component.html',
  styleUrl: './web-colab.component.scss',
})
export class WebColabComponent {
  error?: string;
  env: LabEnv;
  space: SignalSpace;
  experiment = signal<Experiment | null>(null);
  viewPath: Signal<Experiment[]>;
  dataResolver?: AbstractDataResolver<SectionDataDef>;

  loading: boolean = true;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    public dialog: MatDialog,
    public localCache: LocalCacheStoreService,
  ) {
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

    this.loadDefault();
  }

  async loadDefault() {
    this.loading = true;
    this.dataResolver = new LocalCacheDataResolver(this.localCache);
    const cachedFilePath = await this.localCache.getDefaultFile();
    if (!cachedFilePath) {
      this.loading = false;
      return;
    }
    const cachedExpData = await this.localCache.loadFileCache<ExpSectionDataDef>(cachedFilePath);
    if (!cachedExpData) {
      console.warn(`No cached data at local cached file path: ${cachedFilePath}`);
      this.loading = false;
      return;
    }
    const exp = await loadExperiment(this.dataResolver, this.space, cachedExpData);
    this.experiment.set(exp);
    this.loading = false;
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
        content: [],
      },
    };
    const exp = new Experiment(this.space, [], initExpDef);
    const sec1: SectionDataDef = {
      kind: ExpDefKind.Data,
      id: 'about',
      timestamp: Date.now(),
      // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
      sectionData: {
        sectionKind: SectionKind.Markdown,
        content: '# foo is a title\nAnd this is some normal text, **bold**, and _italic_.',
      },
    };
    const sec2: SectionDataDef = {
      kind: ExpDefKind.Data,
      id: 'some data',
      timestamp: Date.now(),
      // TODO: consider making this dependent on ExpCellKind, and resolve to the right type.
      sectionData: {
        sectionKind: SectionKind.JsonObj,
        content: {
          hello: 'foo',
        },
      },
    };
    exp.appendLeafSectionFromDataDef(sec1);
    exp.appendLeafSectionFromDataDef(sec2);
    this.experiment.set(exp);
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
    const distrS = experiment.serialise();
    console.log(distrS);
    saveExperiment(this.dataResolver, 'experiment.json', distrS);
  }

  closeExperiment() {
    this.experiment.set(null);
    delete this.dataResolver;
  }

  async loadExperiment() {
    this.loading = true;
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
    this.loading = false;
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
