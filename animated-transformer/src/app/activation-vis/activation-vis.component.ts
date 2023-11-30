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


import { Component, Input, OnInit, ViewChild, OnDestroy, ComponentRef, signal, Injector, effect, Signal, WritableSignal, computed, untracked } from '@angular/core';
import * as gtensor from '../../lib/gtensor/gtensor';
import { mkVisTensor, TensorImageComponent } from '../tensor-image/tensor-image.component';
// import * as json5 from 'json5';
// import { AbstractControl, FormControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { basicGatesMap, TwoVarGTensorDataset } from '../../lib/gtensor/the_16_two_var_bool_fns';
import { MatTable } from '@angular/material/table';
import { ActivationManagerDirective } from './activation-manager.directive';
// import { ActivationManagerComponent } from './activation-manager/activation-manager.component';
import { CornerActivationComponent } from './corner-activation/corner-activation.component';
// import { toSignal } from '@angular/core/rxjs-interop';
// import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';

interface DatasetExample {
  input: number[];
  output: number[];
}

@Component({
  selector: 'app-activation-vis',
  templateUrl: './activation-vis.component.html',
  styleUrls: ['./activation-vis.component.scss']
})
export class ActivationVisComponent implements OnInit {
  view = signal('vis' as 'edit' | 'vis');

  @ViewChild(ActivationManagerDirective, { static: true })
  activationManager!: ActivationManagerDirective;

  // componentRef!: ComponentRef<CornerActivationComponent>;
  datasetNames = signal(Object.keys(basicGatesMap));

  // modelView: 'vis' | 'edit' = 'vis';

  selectedDataset = signal<TwoVarGTensorDataset | null>(null);
  selectedDatasetTable!: Signal<DatasetExample[] | null>;
  datasetVisTensor!: Signal<gtensor.GTensor<'x' | 'y' | 'rgb'> | null>;

  @ViewChild('datasetTable', { static: false }) datasetTable!: MatTable<gtensor.GTensor<never>>;
  datasetColumns: string[] = ['input', 'output'];

  constructor() {
    this.selectedDatasetTable = computed(() => {
      const d = this.selectedDataset();
      if (!d) { return null; }
      const inputs = d.inputs.tensor.arraySync() as number[][];
      const outputs = d.outputs.tensor.arraySync() as number[][];
      const examples = inputs.map((inp, i) => {
        return { input: inp, output: outputs[i] };
      });
      return examples;
    });

    this.datasetVisTensor = computed(() => {
      const d = this.selectedDataset();
      console.log(`datasetVisTensor`, d);
      if (!d) { return null; }
      return mkVisTensor(1,
        d.outputs.rename('example', 'pointId'),
        d.inputs.rename('example', 'pointId')
      );
    });
  };

  selectDataset(datasetName: string | null) {
    console.log('selectDataset', datasetName);
    this.selectedDataset.set(datasetName ? basicGatesMap[datasetName] : null);
  }

  ngOnInit(): void {
    // Set the dynamic model sub-component, and connect it to the dataset.
    const viewContainerRef = this.activationManager.viewContainerRef;
    viewContainerRef.clear();
    const componentRef = viewContainerRef.createComponent(CornerActivationComponent);
    componentRef.setInput('view', this.view);
    componentRef.setInput('dataset', this.selectedDataset);
  }

  exampleToString(example: number[]): string {
    return JSON.stringify(example);
  }

  toggleModelConfig(): void {
    if (this.view() === 'edit') {
      this.view.set('vis');
    } else if (this.view() === 'vis') {
      this.view.set('edit');
    }
  }

}  // ActivationVisComponent
