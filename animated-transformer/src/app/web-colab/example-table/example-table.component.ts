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
import { MatTableModule } from '@angular/material/table';
import { TokenSeqDisplayComponent } from 'src/app/token-seq-display/token-seq-display.component';
import { Example } from 'src/lib/seqtasks/util';
import { AbstractSignal } from 'src/lib/signalspace/signalspace';
import { Section } from 'src/lib/weblab/section';

@Component({
  selector: 'app-example-table',
  imports: [MatTableModule, TokenSeqDisplayComponent],
  templateUrl: './example-table.component.html',
  styleUrl: './example-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExampleTableComponent implements OnInit {
  section = input.required<Section>();
  examples: WritableSignal<Example[] | null> = signal(null);
  columnNames: WritableSignal<string[]> = signal([]);

  constructor() {
    this.columnNames.set(['source (x)', 'target (y)']);
  }

  ngOnInit() {
    this.section().space.derived(() => this.examples.set(this.section().inputs['examples']()));
  }
}
