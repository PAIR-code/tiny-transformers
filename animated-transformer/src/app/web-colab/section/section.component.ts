import { Component, input } from '@angular/core';
import { ExpDefKind, Experiment, Section, SectionKind } from '../experiment';
import { MarkdownModule } from 'ngx-markdown';
import {
  CodemirrorConfigEditorComponent,
  ConfigUpdate,
  ConfigUpdateKind,
} from '../../codemirror-config-editor/codemirror-config-editor.component';
import { JsonValue } from 'src/lib/json/json';
import { stringifyJsonValue } from 'src/lib/json/pretty_json';
import { SetableSignal } from 'src/lib/signalspace/signalspace';

@Component({
  selector: 'app-section',
  imports: [MarkdownModule, CodemirrorConfigEditorComponent],
  templateUrl: './section.component.html',
  styleUrl: './section.component.scss',
})
export class SectionComponent {
  readonly experiment = input.required<Experiment>();
  readonly section = input.required<Section>();

  ExpDefKind = ExpDefKind;
  SectionKind = SectionKind;

  //
  stringifyJsonValue(x: JsonValue): string {
    return stringifyJsonValue(x);
  }

  handleSectionJsonUpdate(update: ConfigUpdate<JsonValue>, contentSignal: SetableSignal<{}>) {
    if (update.kind !== ConfigUpdateKind.UpdatedValue) {
      return;
    }
    contentSignal.set(update.obj as {});
  }

  // readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
}
