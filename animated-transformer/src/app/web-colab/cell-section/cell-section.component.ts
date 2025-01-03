import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  OnInit,
  Signal,
  signal,
  viewChild,
  WritableSignal,
} from '@angular/core';

import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { CellStatus, SomeCellController } from 'src/lib/distr-signal-exec/cell-controller';
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
import { WorkerCellSectionData, SomeSection } from '../../../lib/weblab/section';
import { CellRegistryService } from 'src/app/cell-registry.service';
import { SomeCellKind } from 'src/lib/distr-signal-exec/cell-kind';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CellSectionComponent implements OnInit {
  readonly experiment = input.required<Experiment>();
  readonly section = input.required<SomeSection>();
  readonly cellData = input.required<WorkerCellSectionData>();
  cell!: SomeCellController;
  status: WritableSignal<CellStatus>;

  CellStatus = CellStatus;

  constructor() {
    this.status = signal(CellStatus.NotStarted);
  }

  ngOnInit() {
    this.cell = this.section().cell as SomeCellController;

    this.cell.space.derived(() => {
      this.status.set(this.cell.status());
    });
  }

  inputs() {
    return Object.keys(this.cellData().content.inputs);
  }
  outputs() {
    return Object.keys(this.cellData().content.outputs);
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
    this.cell.forceStop();
  }

  reset() {
    this.cell.initLifeCyclePromises();
    this.cell.reInitRemotes();
    // console.error('not yet implemented');
    // this.cell.restart();
  }
}
