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
  ElementRef,
  inject,
  Inject,
  input,
  model,
  output,
  PLATFORM_ID,
  Signal,
  signal,
  viewChild,
  WritableSignal,
} from '@angular/core';
import { Experiment } from '../../../lib/weblab/experiment';
import { MarkdownModule, MarkdownService } from 'ngx-markdown';
import {
  CodemirrorConfigEditorComponent,
  ConfigUpdate,
  ConfigUpdateKind,
} from '../../codemirror-config-editor/codemirror-config-editor.component';
import { JsonValue } from 'src/lib/json/json';
import { stringifyJsonValue } from 'src/lib/json/pretty_json';
import { SetableSignal } from 'src/lib/signalspace/signalspace';
import { CellSectionComponent } from '../cell-section/cell-section.component';
import {
  CellCodeRefKind,
  SecDefKind,
  SecDefOfWorker,
  SecDefWithData,
  SecDefWithIo,
  Section,
  ViewerKind,
  WorkerSection,
} from 'src/lib/weblab/section';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { MatMenuModule } from '@angular/material/menu';
import { PlaceholderComponent } from '../placeholder/placeholder.component';
import { ExampleTableComponent } from '../example-table/example-table.component';
import { SimpleChartComponent } from '../simple-chart/simple-chart.component';
import { addIcons } from 'src/app/icon-registry';
import { CellStatus } from 'src/lib/distr-signals/cell-controller';
// ============================================================================

export enum DisplayKind {
  SingleDataValue = 'SingleDataValue',
  WorkerCell = 'WorkerCell',
  UiCell = 'UiCell',
  Unknown = 'Unknown',
}

// ============================================================================
@Component({
  selector: 'app-section',
  imports: [
    MarkdownModule,
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    ExampleTableComponent,
    SimpleChartComponent,
    CodemirrorConfigEditorComponent,
    CellSectionComponent,
    PlaceholderComponent,
    SimpleChartComponent,
  ],
  providers: [MarkdownService],
  templateUrl: './section.component.html',
  styleUrl: './section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionComponent {
  readonly edited = output<boolean>();
  readonly inView = output<boolean>();
  readonly addSecAbove = output<void>();

  readonly experiment = input.required<Experiment>();
  readonly section = input.required<Section>();
  // sectionTemplateRef = viewChild.required<Component>('');

  CellStatus = CellStatus;
  cellStatus: WritableSignal<CellStatus | null>;
  // Only set when there is a link to the code elsewhere.
  vsCodeLink = signal('');

  intersectionObserver: IntersectionObserver;

  SecDefKind = SecDefKind;
  ViewerKind = ViewerKind;
  DisplayKind = DisplayKind;

  collapsed = signal(true);
  editDefView = signal(false);
  displayKind = signal<DisplayKind>(DisplayKind.Unknown);

  collapse() {
    this.collapsed.set(true);
    this.section().initDef.display.collapsed = true;
    this.edited.emit(true);
  }
  uncollapse() {
    this.collapsed.set(false);
    this.section().initDef.display.collapsed = false;
    this.edited.emit(true);
  }

  constructor(private thisElement: ElementRef) {
    addIcons([
      'settings',
      'add',
      'visibility',
      'visibility_off',
      'keyboard_arrow_up',
      'keyboard_arrow_right',
      'keyboard_arrow_down',
      'settings_applications',
      'delete',
      'input',
      'output',
      'play_circle',
      'code',
      'cancel',
      'restart_alt',
      'stop_circle',
    ]);

    // Used to handle scrolling behaviour, allowing a where we are viewing bar
    // to be in the left summary index.
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-viewport');
            this.inView.emit(true);
            // Perform actions when in view (e.g., start animation, load data)
            // element.classList.add('in-viewport'); //Add a class
          } else {
            entry.target.classList.remove('in-viewport'); //Remove the class
            this.inView.emit(false);
          }
        });
      },
      {
        root: null, // Use the viewport as the root
        rootMargin: '0px', // No margin
        threshold: 0.5, // 0.5 = Trigger when 50% of the element is visible
      },
    );
    this.intersectionObserver.observe(this.thisElement.nativeElement);

    // Set the displaykind.
    // TODO: make it properly reactive.
    //
    // Note: Putting this in an effect allows it to be defined in the construtcor, but not executed until the section input is provided.
    this.cellStatus = signal(null);
  }

  ngOnInit() {
    const section = this.section();
    if (section.isWorkerSection()) {
      this.displayKind.set(DisplayKind.WorkerCell);
      section.space.derived(() => this.cellStatus.set(section.cell.controller.status()));
      const def = section.defData() as SecDefOfWorker;
      if (
        (def.cellCodeRef.kind === CellCodeRefKind.PathToWorkerCode ||
          def.cellCodeRef.kind === CellCodeRefKind.UrlToCode) &&
        def.cellCodeRef.tsSrcPath
      ) {
        const path = def.cellCodeRef.tsSrcPath;
        if (section.experiment.def.vsCodePathRoot) {
          this.vsCodeLink.set(
            `vscode://file/${this.section().experiment.def.vsCodePathRoot}/${path}`,
          );
        } else {
          this.vsCodeLink.set('');
        }
      }
    } else {
      const inputKeys = Object.keys(section.inputs);
      const outputKeys = Object.keys(section.outputs);
      if (section.isIoSection()) {
        const data = section.defData() as SecDefWithIo;
        if (
          Object.keys(data.io.inStreams).length === 0 &&
          outputKeys.length === 1 &&
          inputKeys.length === 0
        ) {
          if (section.outputs[outputKeys[0]]() !== null) {
            this.displayKind.set(DisplayKind.SingleDataValue);
          } else {
            this.displayKind.set(DisplayKind.UiCell);
          }
        } else {
          this.displayKind.set(DisplayKind.UiCell);
        }
      }
    }

    // Set the collapsed/not setting.
    this.collapsed.set(this.section().initDef.display.collapsed);
  }

  ngAfterViewInit() {}

  ngOnDestroy() {
    this.intersectionObserver.disconnect();
  }

  handleDefUpdate(update: ConfigUpdate<JsonValue>) {
    if (update.kind !== ConfigUpdateKind.UpdatedValue) {
      return;
    }
    const section = this.section();
    const newDef = update.obj as SecDefWithData;
    this.section().defData.set(newDef);
    if (newDef.kind === SecDefKind.UiCell) {
      for (const k of Object.keys(section.outputs)) {
        section.outputs[k].set(newDef.io.outputs![k].lastValue);
      }
    }
  }

  //
  stringifyJsonValue(x: JsonValue): string {
    return stringifyJsonValue(x);
  }

  handleJsonUpdate(update: ConfigUpdate<JsonValue>, contentSignal: SetableSignal<JsonValue>) {
    if (update.kind !== ConfigUpdateKind.UpdatedValue) {
      return;
    }
    contentSignal.set(update.obj as JsonValue);

    // TODO: sections should manage their edit status, and not have it done via
    // components.
    this.edited.emit(true);
  }

  addPlaceholder() {
    this.addSecAbove.emit();
  }

  deleteThisSection() {
    const section = this.section();
    section.experiment.deleteSection(section);
  }

  workerSection(): WorkerSection {
    return this.section() as WorkerSection;
  }

  async cellStart() {
    await this.section().startWorker();
  }

  async cellRequestStop() {
    const cell = this.section().cell;
    if (!cell) {
      throw new Error('cellRequestStop called on section with no cell');
    }
    await cell.controller.requestStop();
  }

  async cellForceStopAndReset() {
    const cell = this.section().cell;
    if (!cell) {
      throw new Error('cellForceStop called on section with no cell');
    }
    await cell.controller.forceStop();
    cell.controller.initLifeCyclePromises();
    cell.controller.reInitRemotes();
  }

  openCodeLink() {
    window.open(this.vsCodeLink());
  }

  // addJsonObjEditor() {}

  // addMarkdownEditor() {}

  // addInlineCode() {}

  // addVsCodeCell() {}

  // ngOnInit(): void {
  //   // One could get/set components dynamically, but not clear what the value is...
  //   // // Set the dynamic model sub-component, and connect it to the dataset.
  //   // const viewContainerRef = this.sectionTemplateRef();
  //   // viewContainerRef.clear();
  //   // const sectionData = this.section().data().sectionData;
  //   // switch (sectionData.sectionKind) {
  //   //   case SectionKind.Cell: {
  //   //     const componentRef = viewContainerRef.createComponent(CellSectionComponent);
  //   //     componentRef. setInput('view', this.view);
  //   //     componentRef.setInput('dataset', this.selectedDataset);
  //   //   }
  //   //   default: {
  //   //   }
  //   // }
  // }

  // readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
}
