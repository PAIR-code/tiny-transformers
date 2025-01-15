import { Injectable } from '@angular/core';

import { taskCellKind, trainerCellKind } from './web-colab/tiny-transformer-example/ailab';
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
