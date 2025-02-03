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
  input,
  OnInit,
  Signal,
  OnDestroy,
  signal,
  WritableSignal,
  inject,
} from '@angular/core';

import { CellStatus, SomeCellController } from 'src/lib/distr-signals/cell-controller';
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
// import { TensorImageModule } from '../tensor-image/tensor-image.module';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule } from '@angular/material/dialog';
import {
  CellCodeRefKind,
  SecDefOfWorker,
  SectionCellData,
  Section,
  WorkerSection,
  CellCodeRef,
} from '../../../lib/weblab/section';
import { DomSanitizer } from '@angular/platform-browser';
import { AutoCompletedTextInputComponent } from 'src/app/auto-completed-text-input/auto-completed-text-input.component';
import { DerivedSignal } from 'src/lib/signalspace/signalspace';
import {
  CodemirrorJavaScriptEditorComponent,
  CodeStrUpdate,
  CodeStrUpdateKind,
} from 'src/app/codemirror-js-editor/codemirror-js-editor.component';

@Component({
  selector: 'app-cell-section',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    AutoCompletedTextInputComponent,
    CodemirrorJavaScriptEditorComponent,
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
  ],
  templateUrl: './cell-section.component.html',
  styleUrl: './cell-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CellSectionComponent implements OnInit, OnDestroy {
  readonly section = input.required<WorkerSection>();
  cell!: SectionCellData;
  status: WritableSignal<CellStatus>;
  def!: SecDefOfWorker;
  vsCodeLink = signal('');
  sectionsWithOutputs = signal<string[]>([]);
  possibleCellOuputs = signal<string[]>([]);

  signalTrackingDerivations = [] as DerivedSignal<void>[];

  CellStatus = CellStatus;
  CellCodeRefKind = CellCodeRefKind;

  constructor() {
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
    addIcons(['play_circle', 'code', 'cancel', 'restart_alt', 'stop_circle', 'input', 'output']);

    this.status = signal(CellStatus.NotStarted);
  }

  ngOnInit() {
    const section = this.section();
    const space = section.space;
    this.cell = section.cell as SectionCellData;
    this.def = section.defData();

    space.derived(() => {
      this.status.set(this.cell.controller.status());
    });

    if (
      (this.def.cellCodeRef.kind === CellCodeRefKind.PathToWorkerCode ||
        this.def.cellCodeRef.kind === CellCodeRefKind.UrlToCode) &&
      this.def.cellCodeRef.tsSrcPath
    ) {
      const path = this.def.cellCodeRef.tsSrcPath;
      if (section.experiment.def.vsCodePathRoot) {
        this.vsCodeLink.set(
          `vscode://file/${this.section().experiment.def.vsCodePathRoot}/${path}`,
        );
      } else {
        this.vsCodeLink.set('');
      }
    }

    this.section().experiment.space.derived(() =>
      this.sectionsWithOutputs.set([...this.section().experiment.secIdsWithOutputs()].sort()),
    );
  }

  selectInputSection(inputId: string, selectedCellId: string | null) {
    // if (!selectedCellId) {
    //   this.section().io.inputs[inputId].set(null);
    // }
    // this.section().experiment.getSection(selectedCellId);
  }

  handleJsUpdate(changed$: CodeStrUpdate) {
    if (this.def.cellCodeRef.kind !== CellCodeRefKind.InlineWorkerJsCode) {
      throw new Error(`JsUpdates should only be for inline code cells`);
    }
    if (changed$.kind !== CodeStrUpdateKind.UpdatedValue) {
      return;
    }
    this.def.cellCodeRef.js = changed$.str;
    const cell = this.section().cell;
    URL.revokeObjectURL(cell.cellObjectUrl);
    const blob = new Blob([this.def.cellCodeRef.js], { type: 'application/javascript' });
    const cellObjectUrl = URL.createObjectURL(blob);
    cell.cellObjectUrl = cellObjectUrl;
  }

  openCodeLink() {
    window.open(this.vsCodeLink());
  }

  inputs() {
    return Object.keys(this.section().inputs || {});
  }
  outputs() {
    return Object.keys(this.section().outputs || {});
  }
  // inStreams() {
  //   return Object.keys(this.section().inStreams || {});
  // }
  // outStreams() {
  //   return this.data().io.outStreamIds || [];
  // }

  async start() {
    this.section().startWorker();
  }

  requestStop() {
    this.cell.controller.requestStop();
  }

  forceStop() {
    this.cell.controller.forceStop();
  }

  reset() {
    this.cell.controller.initLifeCyclePromises();
    this.cell.controller.reInitRemotes();
    // console.error('not yet implemented');
    // this.cell.restart();
  }

  ngOnDestroy() {
    for (const d of this.signalTrackingDerivations) {
      d.node.dispose();
    }
  }
}
