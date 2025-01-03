import { Injectable } from '@angular/core';

import { taskCellSpec, trainerCellSpec } from './web-colab/tiny-transformer-example/ailab';
import { SomeCellKind } from 'src/lib/distr-signal-exec/cell-kind';

@Injectable({
  providedIn: 'root',
})
export class CellRegistryService {
  // mapping from id to CellKind.
  public registry = new Map<string, SomeCellKind>();

  constructor() {
    this.registry.set(taskCellSpec.cellKindId, taskCellSpec);
    this.registry.set(trainerCellSpec.cellKindId, trainerCellSpec);
  }
}
