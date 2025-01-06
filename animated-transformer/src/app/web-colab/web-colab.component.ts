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

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  Signal,
  signal,
} from '@angular/core';

import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { LabEnv } from 'src/lib/distr-signal-exec/lab-env';
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
  DistrSerialization,
  // ExpCellDisplayKind,
  ExpDefKind,
  Experiment,
  loadExperiment,
  saveExperiment,
} from '../../lib/weblab/experiment';
import { LocalCacheStoreService } from '../localcache-store.service';
import {
  AbstractDataResolver,
  BrowserDirDataResolver,
  LocalCacheDataResolver,
} from '../../lib/weblab/data-resolver';
import { SectionComponent } from './section/section.component';
import { ExpSectionDataDef, SectionDataDef, SectionKind } from 'src/lib/weblab/section';
import { makeToyExperiment } from 'src/lib/weblab/toy-experiment';
import { tryer } from 'src/lib/utils';

type Timeout = {};

// TODO: record the edited timestamp, and path, and then check with localfile to
// see if this is latest, or edited.
enum SaveState {
  Empty, // not experiment is opened
  UncachedAndEdited, // opened, but latest edits not saved or cached.
  CachedAndEdited, // opened, cached, but not saved.
  SavedToDisk, // opened, cached and saved to disk.
}

function loadingUi() {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: WebColabComponent, ...args: any[]) {
      this.loading.set(true);
      const result = await originalMethod.apply(this, args);
      this.loading.set(false);
      return result;
    };

    return descriptor;
  };
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
    SectionComponent,
  ],
  templateUrl: './web-colab.component.html',
  styleUrl: './web-colab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebColabComponent {
  error?: string;
  env: LabEnv;
  space: SignalSpace;
  experiment = signal<Experiment | null>(null);
  edited = signal<boolean>(false);
  saveState: SaveState = SaveState.Empty;
  viewPath: Signal<Experiment[]>;
  fileDataResolver?: AbstractDataResolver<SectionDataDef>;
  cacheDataResolver: LocalCacheDataResolver<SectionDataDef>;
  saveToCachePlannedCallback?: Timeout;

  loading = signal<boolean>(false);
  saving = signal<boolean>(false);

  SaveState = SaveState;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    public dialog: MatDialog,
    public localCache: LocalCacheStoreService,
  ) {
    this.space = new SignalSpace();
    this.env = new LabEnv(this.space);

    this.viewPath = computed(() => {
      const exp = this.experiment();
      if (!exp) {
        return [];
      } else {
        return exp.ancestors;
      }
    });

    this.cacheDataResolver = new LocalCacheDataResolver<SectionDataDef>(this.localCache);
    // Idea: save as a directory, not a file?
    // TODO: avoid race condition and make later stuff happen after this...?
    this.localCache.setDefaultPath('experiment.json');

    this.tryLoadExperimentFromCache();

    effect(() => {
      if (this.edited() && !this.saveToCachePlannedCallback) {
        this.saveState = SaveState.UncachedAndEdited;
        this.saveToCachePlannedCallback = setTimeout(() => {
          this.saveExperimentToCache();
        }, 5000);
      }
    });
  }

  async deleteExperimentCache(): Promise<void> {
    const cachedFilePath = await this.localCache.getDefaultPath();
    if (!cachedFilePath) {
      throw new Error('deleteCached: no getDefaultFile');
    }
    const experiment = this.experiment();
    if (!experiment) {
      console.log('deleteCached: no experiment');
      // No error because this might happen with timeout cache saving callbacks.
      return;
    }
    await this.localCache.deleteFileCache(cachedFilePath);
    console.log(`deleteCached: deleted: ${cachedFilePath}`);
    const distrS = experiment.serialise();
    if (distrS.subpathData) {
      for (const kPath of Object.keys(distrS.subpathData)) {
        await this.localCache.deleteFileCache(kPath);
        console.log(`deleteCached: deleted: ${kPath}`);
      }
    }
  }

  async tryLoadExperimentFromCache() {
    const cachedFilePath = await this.localCache.getDefaultPath();
    if (!cachedFilePath) {
      throw new Error(`missing localCache.getDefaultPath`);
    }
    const cachedExpData = await this.localCache.loadFileCache<ExpSectionDataDef>(cachedFilePath);
    if (!cachedExpData) {
      return;
    }
    this.loading.set(true);
    const exp = await loadExperiment(this.cacheDataResolver, this.env, cachedExpData);
    this.experiment.set(exp);
    this.loading.set(false);
    this.saveState = SaveState.CachedAndEdited;
  }

  async saveExperimentToCache(): Promise<DistrSerialization<
    SectionDataDef,
    SectionDataDef
  > | null> {
    const experiment = this.experiment();
    if (
      !experiment ||
      this.saveState === SaveState.CachedAndEdited ||
      this.saveState === SaveState.SavedToDisk
    ) {
      // No error because this might happen with timeout cache saving callbacks.
      return null;
    }
    this.saving.set(true);
    const distrS = experiment.serialise();
    await saveExperiment(this.cacheDataResolver, 'experiment.json', distrS);
    this.saveState = SaveState.CachedAndEdited;
    this.saving.set(false);
    return distrS;
  }

  clearError() {
    delete this.error;
  }

  async newExperiment() {
    this.experiment.set(makeToyExperiment('simple experiment', this.env));
    await this.saveExperimentToCache();
    this.edited.set(true);
    this.saveState = SaveState.CachedAndEdited;
  }

  async doRun() {
    // const cell = this.env.start(trainerCellSpec, this.globals);
    // const lastTrainMetric = await cell.outputs.lastTrainMetric;
    // console.log(lastTrainMetric);
    // cell.worker.terminate();
  }

  async closeExperiment() {
    await this.deleteExperimentCache();
    this.experiment.set(null);
    delete this.fileDataResolver;
    this.saveState = SaveState.Empty;
  }

  async saveExperiment(experiment: Experiment) {
    this.saving.set(true);
    const distrS = await this.saveExperimentToCache();
    if (!distrS) {
      this.saving.set(false);
      this.saveState = SaveState.SavedToDisk;
      return;
    }
    if (!this.fileDataResolver) {
      const dirHandle = await self.showDirectoryPicker({ mode: 'readwrite' });
      this.fileDataResolver = new BrowserDirDataResolver(dirHandle);
    }
    await saveExperiment(this.fileDataResolver, 'experiment.json', distrS);
    this.saving.set(false);
    this.saveState = SaveState.SavedToDisk;
  }

  @loadingUi()
  async loadExperiment() {
    const [dirPickErr, dirHandle] = await tryer(self.showDirectoryPicker({ mode: 'readwrite' }));
    if (dirPickErr) {
      this.error = `Could not open the selected directory: ${dirPickErr.message}`;
      return;
    }
    this.fileDataResolver = new BrowserDirDataResolver(dirHandle);
    const [expJsonLoadErr, secDataDef] = await tryer(this.fileDataResolver.load('experiment.json'));
    if (expJsonLoadErr) {
      this.error = `Could not open 'experiment.json': ${expJsonLoadErr.message}`;
      return;
    }
    // TODO: actually do some validation...
    const expDef = secDataDef as ExpSectionDataDef;
    const [loadExpErr, exp] = await tryer(loadExperiment(this.fileDataResolver, this.env, expDef));
    if (loadExpErr) {
      this.error = `Failed to load experiment from 'experiment.json': ${loadExpErr.message}`;
      return;
    }
    await this.deleteExperimentCache();
    this.experiment.set(exp);
    await this.saveExperimentToCache();
    this.saveState = SaveState.SavedToDisk;
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
