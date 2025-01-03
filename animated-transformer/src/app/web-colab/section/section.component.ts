import { Component, ElementRef, input, model, viewChild } from '@angular/core';
import { ExpDefKind, Experiment } from '../../../lib/weblab/experiment';
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
import { Section, SectionKind, SomeSection } from 'src/lib/weblab/section';

@Component({
  selector: 'app-section',
  imports: [MarkdownModule, CodemirrorConfigEditorComponent, CellSectionComponent],
  providers: [MarkdownService],
  templateUrl: './section.component.html',
  styleUrl: './section.component.scss',
})
export class SectionComponent {
  readonly edited = model.required<boolean>();
  readonly experiment = input.required<Experiment>();
  readonly section = input.required<SomeSection>();
  // sectionTemplateRef = viewChild.required<Component>('');

  ExpDefKind = ExpDefKind;
  SectionKind = SectionKind;

  constructor() {}

  //
  stringifyJsonValue(x: JsonValue): string {
    return stringifyJsonValue(x);
  }

  handleSectionJsonUpdate(
    update: ConfigUpdate<JsonValue>,
    contentSignal: SetableSignal<JsonValue>,
  ) {
    if (update.kind !== ConfigUpdateKind.UpdatedValue) {
      return;
    }
    contentSignal.set(update.obj as JsonValue);
    this.edited.set(true);
  }

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
