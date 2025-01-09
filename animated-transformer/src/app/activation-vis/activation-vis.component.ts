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

import {
  Component,
  OnInit,
  signal,
  Signal,
  computed,
  viewChild,
  ChangeDetectionStrategy,
  effect,
} from '@angular/core';
import * as gtensor from '../../lib/gtensor/gtensor';
import { mkVisTensor, TensorImageComponent } from '../tensor-image/tensor-image.component';
import { basicGatesMap, TwoVarGTensorDataset } from '../../lib/gtensor/the_16_two_var_bool_fns';
import { MatTable } from '@angular/material/table';
import { ActivationManagerDirective } from './activation-manager.directive';
import { CornerActivationComponent } from './corner-activation/corner-activation.component';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { CodemirrorConfigEditorComponent } from '../codemirror-config-editor/codemirror-config-editor.component';
import { RouterModule } from '@angular/router';

import { AxisWrapperComponent } from './axis-wrapper/axis-wrapper.component';
import { AutoCompletedTextInputComponent } from '../auto-completed-text-input/auto-completed-text-input.component';
import { ActivationManagerComponent } from './activation-manager/activation-manager.component';
import { NanValidatorDirective } from '../form-validators/nan-validator.directive';
import { BoundedFloatValidatorDirective } from '../form-validators/bounded-float-validator.directive';

interface DatasetExample {
  input: number[];
  output: number[];
}

@Component({
  selector: 'app-activation-vis',
  standalone: true,
  imports: [
    AutoCompletedTextInputComponent,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatMenuModule,
    MatTableModule,
    // ActivationManagerComponent,
    CornerActivationComponent,
    // CodemirrorConfigEditorComponent,
    TensorImageComponent,
    AxisWrapperComponent,
    // ActivationManagerDirective,
    // NanValidatorDirective,
    // BoundedFloatValidatorDirective,
  ],
  templateUrl: './activation-vis.component.html',
  styleUrls: ['./activation-vis.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivationVisComponent implements OnInit {
  view = signal('vis' as 'edit' | 'vis');

  readonly activationManager = viewChild.required(ActivationManagerDirective);

  // componentRef!: ComponentRef<CornerActivationComponent>;
  datasetNames = signal(Object.keys(basicGatesMap));

  // modelView: 'vis' | 'edit' = 'vis';

  selectedDataset = signal<TwoVarGTensorDataset | null>(null);
  selectedDatasetTable!: Signal<DatasetExample[] | null>;
  datasetVisTensor!: Signal<gtensor.GTensor<'x' | 'y' | 'rgb'> | null>;

  readonly datasetTable = viewChild.required<MatTable<gtensor.GTensor<never>>>('datasetTable');
  datasetColumns: string[] = ['input', 'output'];

  constructor() {
    this.selectedDatasetTable = computed(() => {
      const d = this.selectedDataset();
      if (!d) {
        return null;
      }
      const inputs = d.inputs.tensor.arraySync() as number[][];
      const outputs = d.outputs.tensor.arraySync() as number[][];
      const examples = inputs.map((inp, i) => {
        return { input: inp, output: outputs[i] };
      });
      return examples;
    });

    this.datasetVisTensor = computed(() => {
      const d = this.selectedDataset();
      if (!d) {
        return null;
      }
      return mkVisTensor(
        1,
        d.outputs.rename('example', 'pointId'),
        d.inputs.rename('example', 'pointId'),
      );
    });
  }

  selectDataset(datasetName: string | null) {
    this.selectedDataset.set(datasetName ? basicGatesMap[datasetName] : null);
  }

  ngOnInit(): void {
    // // Set the dynamic model sub-component, and connect it to the dataset.
    // const viewContainerRef = this.activationManager().viewContainerRef;
    // viewContainerRef.clear();
    // const componentRef = viewContainerRef.createComponent(CornerActivationComponent);
    // effect(() => componentRef.setInput('view', this.view()));
    // effect(() => componentRef.setInput('dataset', this.selectedDataset()));
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
} // ActivationVisComponent
