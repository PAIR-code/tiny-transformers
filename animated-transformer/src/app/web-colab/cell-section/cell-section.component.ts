import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  Signal,
  signal,
  viewChild,
} from '@angular/core';

import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { CellStatus, SomeLabEnvCell } from 'src/lib/distr-signal-exec/lab-env-cell';
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
import { MatDialogModule } from '@angular/material/dialog';
import { Experiment } from '../../../lib/weblab/experiment';
import { CellSectionData } from '../../../lib/weblab/section';
import { CellRegistryService } from 'src/app/cell-registry.service';
import { SomeCellKind } from 'src/lib/distr-signal-exec/cell-types';
import { Section } from 'src/lib/weblab/section';

@Component({
  selector: 'app-cell-section',
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
  ],
  templateUrl: './cell-section.component.html',
  styleUrl: './cell-section.component.scss',
})
export class CellSectionComponent {
  readonly experiment = input.required<Experiment>();
  readonly section = input.required<Section>();
  readonly cellData = input.required<CellSectionData>();
  cell: SomeLabEnvCell;

  CellStatus = CellStatus;

  constructor() {
    // Should only be constructable when/if cell is defined.
    this.cell = this.section().cell as SomeLabEnvCell;
  }

  get status(): CellStatus {
    return this.cell.status;
  }

  inputs() {
    return Object.keys(this.cellData().content.inputs);
  }
  outputs() {
    return this.cellData().content.outputIds;
  }
  inStreams() {
    return Object.keys(this.cellData().content.inStreams);
  }
  outStreams() {
    return this.cellData().content.outStreamIds;
  }

  start() {
    this.cell.start();
  }

  requestStop() {
    this.cell.requestStop();
  }

  forceStop() {
    console.error('not yet implemented');
    // this.cell.forceStop();
  }

  restart() {
    console.error('not yet implemented');
    // this.cell.restart();
  }
}
