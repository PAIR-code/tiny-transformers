import { Injectable } from '@angular/core';

import { taskCellKind } from '../weblab-examples/tiny-transformer-example/task-cell.kind';
import { trainerCellKind } from '../weblab-examples/tiny-transformer-example/trainer-cell.kind';
import { SomeWorkerCellKind } from 'src/lib/distr-signals/cell-kind';

@Injectable({
  providedIn: 'root',
})
export class CellRegistryService {
  // mapping from id to CellKind.
  public registry = new Map<string, SomeWorkerCellKind>();

  constructor() {
    this.registry.set(taskCellKind.cellKindId, taskCellKind);
    this.registry.set(trainerCellKind.cellKindId, trainerCellKind);
  }
}
