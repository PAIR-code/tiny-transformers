import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnInit,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { addIcons } from 'src/app/icon-registry';
import { TokenSeqDisplayComponent } from 'src/app/token-seq-display/token-seq-display.component';
import { JsonValue } from 'src/lib/json/json';
import { stringifyJsonValue } from 'src/lib/json/pretty_json';
import { Example } from 'src/lib/seqtasks/util';
import { AbstractSignal } from 'src/lib/signalspace/signalspace';
import { Section, SectionInputRef } from 'src/lib/weblab/section';

@Component({
  selector: 'app-example-table',
  imports: [MatTableModule, TokenSeqDisplayComponent, MatIcon],
  templateUrl: './example-table.component.html',
  styleUrl: './example-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExampleTableComponent implements OnInit {
  section = input.required<Section>();
  examples: WritableSignal<Example[]> = signal([]);
  // columnNames: WritableSignal<string[]> = signal([]);

  constructor() {
    addIcons(['input', 'output']);
    // this.columnNames.set(['source (x)', 'target (y)']);
  }

  ngOnInit() {
    this.section().space.derived(() => {
      const examples = this.section().inputs['examples']();
      // console.log(examples);
      // console.log(`ExampleTableComponent: setting table... ${JSON.stringify(examples)}`);
      this.examples.set(examples);
    });
  }

  inputInfos(): SectionInputRef[] {
    const thisSection = this.section().assertIoSection();
    const inputInfo = thisSection.defData().io.inputs['examples'];
    return inputInfo;
  }

  // inputFromSectionName(): string | null {
  //   const thisSection = this.section().assertIoSection();
  //   const inputInfo = thisSection.defData().io.inputs['examples'];
  //   if (!inputInfo) {
  //     return null;
  //   }
  //   return `${inputInfo.sectionId}`;
  // }

  // inputFromOutputId(): string | null {
  //   const thisSection = this.section().assertIoSection();
  //   const inputInfo = thisSection.defData().io.inputs['examples'];
  //   if (!inputInfo) {
  //     return null;
  //   }
  //   return `${inputInfo.sectionId}.${inputInfo.outputId}`;
  // }

  // inputFromRef(): string | null {
  //   const thisSection = this.section().assertIoSection();
  //   const inputInfo = thisSection.defData().io.inputs['examples'];
  //   if (!inputInfo) {
  //     return null;
  //   }
  //   return `${inputInfo.sectionId}.${inputInfo.outputId}`;
  // }

  stringify(examples: Example[] | null): string {
    return stringifyJsonValue(examples as JsonValue);
  }
}
