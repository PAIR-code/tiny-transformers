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
  Signal,
  signal,
  inject,
} from '@angular/core';

import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { LabEnv } from 'src/lib/distr-signals/lab-env';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
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
import { SecDefOfSecList, SecDefWithData, SomeSection } from 'src/lib/weblab/section';
import { makeToyExperiment } from 'src/weblab-examples/toy-experiment';
import { tryer } from 'src/lib/utils';
// import { CellRegistryService } from '../cell-registry.service';
import { DomSanitizer } from '@angular/platform-browser';
// import { isPlatformBrowser } from '@angular/common';
import { JsonValue } from 'src/lib/json/json';

type Timeout = ReturnType<typeof setTimeout>;

// TODO: record the edited timestamp, and path, and then check with localfile to
// see if this is latest, or edited.
enum SaveState {
  None, // no data exists.
  New, // Data but no previous version saved.
  Edited, // Edited since last save.
  Saved, // Latest data has been saved.
}

// ============================================================================
//  Custom Decorators for WebColabComponent.
// ============================================================================
function showErrors() {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: WebColabComponent, ...args: any[]) {
      const [err, result] = await tryer(originalMethod.apply(this, args));
      if (err) {
        console.error(err);
        this.error = err.message;
      }
      return result;
    };

    return descriptor;
  };
}

function loadingUi() {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: WebColabComponent, ...args: any[]) {
      this.loading.set(true);
      const result = originalMethod.apply(this, args);
      this.loading.set(false);
      return result;
    };

    return descriptor;
  };
}

function savingUi() {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: WebColabComponent, ...args: any[]) {
      this.saving.set(true);
      const result = await originalMethod.apply(this, args);
      this.saving.set(false);
      return result;
    };

    return descriptor;
  };
}

const defaultLocalFilename = 'experiment.json';

// ============================================================================
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
    MatToolbarModule,
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
  viewPath: Signal<Experiment[]>;
  fileDataResolver?: AbstractDataResolver<JsonValue>;
  cacheDataResolver: LocalCacheDataResolver<JsonValue>;
  saveToCachePlannedCallback?: Timeout;

  // Sections edited since last cache save.
  editedCacheSections = new Set();
  // Sections edited since last disk save.
  editedDiskSections = new Set();

  loading = signal<boolean>(false);
  saving = signal<boolean>(false);

  SaveState = SaveState;
  cacheState = signal<SaveState>(SaveState.None);
  diskState = signal<SaveState>(SaveState.None);
  public location = location;

  inViewSections = new Set<string>();

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    public dialog: MatDialog,
    public cacheService: LocalCacheStoreService,
    // public cellRegistry: CellRegistryService,
  ) {
    const iconRegistry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    function addIcons(names: string[]) {
      for (const name of names) {
        iconRegistry.addSvgIcon(
          name,
          sanitizer.bypassSecurityTrustResourceUrl(`assets/icons/${name}.svg`),
        );
      }
    }
    addIcons(['close', 'menu', 'more_vert']);

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

    this.cacheDataResolver = new LocalCacheDataResolver(this.cacheService.cache);
    this.tryLoadExperimentFromCache();
  }

  noteInView(section: SomeSection, inView: boolean) {
    if (inView) {
      this.inViewSections.add(section.def.id);
    } else {
      this.inViewSections.delete(section.def.id);
    }
  }

  onSectionEdited(section: SomeSection, edited: boolean) {
    if (edited) {
      this.editedCacheSections.add(section);
      this.diskState.set(SaveState.Edited);
      this.cacheState.set(SaveState.Edited);
      if (this.saveToCachePlannedCallback) {
        return;
      }
      this.saveToCachePlannedCallback = setTimeout(() => {
        this.saveExperimentToCache();
        delete this.saveToCachePlannedCallback;
      }, 2000);
    } else {
      this.editedCacheSections.delete(section);
      if (this.editedCacheSections.size === 0) {
        this.cacheState.set(SaveState.Saved);
      }
    }
  }

  async _deleteExperimentCache(): Promise<void> {
    const cachedFile = await this.cacheService.loadDefault();
    if (!cachedFile) {
      throw new Error('deleteCached: no getDefaultFile found');
    }
    const experiment = this.experiment();
    if (!experiment) {
      console.log('deleteCached: no experiment');
      // No error because this might happen with timeout cache saving callbacks.
      return;
    }
    await this.cacheService.deleteDefault();
    const distrS = experiment.serialise();
    if (distrS.subpathData) {
      for (const kPath of Object.keys(distrS.subpathData)) {
        await this.cacheService.delete(kPath);
        console.log(`deleteCached: deleted: ${kPath}`);
      }
    }
  }

  @showErrors()
  @loadingUi()
  async tryLoadExperimentFromCache() {
    const cachedFileData = await this.cacheService.load(defaultLocalFilename);
    if (!cachedFileData) {
      return;
    }

    const exp = await loadExperiment(
      this.cacheDataResolver,
      this.env,
      cachedFileData as SecDefOfSecList,
      { fromCache: true },
    );
    this.cacheState.set(SaveState.Saved);
    this.diskState.set(SaveState.New);
    this.experiment.set(exp);
  }

  getExperimentSerialisation() {
    const experiment = this.experiment();
    if (!experiment) {
      throw new Error(`No experiment to get serialization for`);
    }
    return experiment.serialise();
  }

  @savingUi()
  async saveExperimentToCache(): Promise<DistrSerialization<
    SecDefWithData,
    SecDefWithData
  > | null> {
    const experiment = this.experiment();
    if (!experiment || this.cacheState() === SaveState.Saved) {
      // No error because this might happen with timeout cache saving callbacks.
      return null;
    }
    const distrS = experiment.serialise();
    await saveExperiment(this.cacheDataResolver, 'experiment.json', distrS);
    this.cacheState.set(SaveState.Saved);
    this.editedCacheSections.clear();
    return distrS;
  }

  clearError() {
    delete this.error;
  }

  async newExperiment() {
    this.cacheState.set(SaveState.New);
    const exp = await makeToyExperiment(this.env, 'simple experiment');
    this.experiment.set(exp);
    await this.saveExperimentToCache();
    this.diskState.set(SaveState.New);
  }

  async doRun() {
    // const cell = this.env.start(trainerCellSpec, this.globals);
    // const lastTrainMetric = await cell.outputs.lastTrainMetric;
    // console.log(lastTrainMetric);
    // cell.worker.terminate();
  }

  // TODO: add warning for unsaved.
  async closeExperiment() {
    await this._deleteExperimentCache();
    this.experiment.set(null);
    delete this.fileDataResolver;
    if (this.saveToCachePlannedCallback) {
      clearTimeout(this.saveToCachePlannedCallback);
      delete this.saveToCachePlannedCallback;
    }
    this.diskState.set(SaveState.None);
    this.cacheState.set(SaveState.None);
  }

  @showErrors()
  @savingUi()
  async saveExperiment(): Promise<void> {
    if (this.diskState() === SaveState.Saved) {
      console.warn('tried to save when already in saved state');
      return;
    }
    const distrS = (await this.saveExperimentToCache()) || this.getExperimentSerialisation();
    if (!this.fileDataResolver) {
      const dirHandle = await self.showDirectoryPicker({ mode: 'readwrite' });
      this.fileDataResolver = new BrowserDirDataResolver({ dirHandle });
    }
    const [saveErr] = await tryer(saveExperiment(this.fileDataResolver, 'experiment.json', distrS));
    if (saveErr) {
      this.error = `Unable to save experiment: ${saveErr.message}`;
    }
    this.cacheState.set(SaveState.Saved);
    this.diskState.set(SaveState.Saved);
  }

  @showErrors()
  @loadingUi()
  async loadExperimentFromDirectory() {
    const [dirPickErr, dirHandle] = await tryer(self.showDirectoryPicker({ mode: 'readwrite' }));
    if (dirPickErr) {
      this.error = `Could not open the selected directory: ${dirPickErr.message}`;
      return;
    }
    this.fileDataResolver = new BrowserDirDataResolver({ dirHandle });
    const [expJsonLoadErr, secDataDef] = await tryer(this.fileDataResolver.load('experiment.json'));
    if (expJsonLoadErr) {
      this.error = `Could not open 'experiment.json': ${expJsonLoadErr.message}`;
      return;
    }
    // TODO: actually do some validation...
    const expDef = secDataDef as SecDefOfSecList;
    const [expLoadErr, exp] = await tryer(
      loadExperiment(this.fileDataResolver, this.env, expDef, { fromCache: false }),
    );
    if (expLoadErr) {
      this.error = `Failed to load experiment from 'experiment.json': ${expLoadErr.message}`;
      return;
    }
    await this._deleteExperimentCache();
    this.experiment.set(exp);
    await this.saveExperimentToCache();
    this.cacheState.set(SaveState.Saved);
    this.diskState.set(SaveState.Saved);
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
