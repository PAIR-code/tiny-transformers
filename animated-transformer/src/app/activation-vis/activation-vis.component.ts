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
import { ConfigUpdate } from '../codemirror-config-editor/codemirror-config-editor.component';
import { ConfigStoreService } from '../config-store.service';
import { TfvisService } from '../tfvis.service';
import * as tf from '@tensorflow/tfjs';
import * as gtensor from '../../lib/gtensor/gtensor';
import * as gtensor_util from '../../lib/gtensor/gtensor_util';
import { mkVisTensor, TensorImageComponent } from '../tensor-image/tensor-image.component';
import * as json5 from 'json5';
import { AbstractControl, FormControl, UntypedFormControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { firstValueFrom, Observable, of, EMPTY, OperatorFunction, combineLatest, BehaviorSubject, ReplaySubject, Subscription } from 'rxjs';
import { map, startWith, shareReplay, take, mergeMap, distinctUntilChanged, tap, skip, pairwise } from 'rxjs/operators';
import { mapNonNull } from '../../lib/rxjs/util';
// import { basicGatesAsIoArrays, basicGatesAsGTensor, TwoVarGTensorDataset, TwoVarBoolListDataset } from '../../lib/gtensor/the_16_two_var_bool_fns';
import { basicGatesAsGTensor, TwoVarGTensorDataset } from '../../lib/gtensor/the_16_two_var_bool_fns';
import { stringifyJsonValue } from '../../lib/pretty_json/pretty_json';

// import { pointWiseEval, softVoronoiEval, pointwiseGrad } from '../../lib/gtensor/boolfns';
import { MatTable } from '@angular/material/table';
import { boundedFloatValidator, boundedFloatErrorFn } from '../form-validators/bounded-float-validator.directive';
// import { nanValidator } from '../nan-validator.directive';
import { JsonValue } from 'src/lib/pretty_json/json';
import { ActivationManagerDirective } from './activation-manager.directive';
import { ActivationManagerComponent } from './activation-manager/activation-manager.component';
import { CornerActivationComponent } from './corner-activation/corner-activation.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';

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
  // dataset!: Signal<TwoVarGTensorDataset | null>;
  // signal(null as TwoVarGTensorDataset | null);

  @ViewChild(ActivationManagerDirective, { static: true })
  activationManager!: ActivationManagerDirective;

  // componentRef!: ComponentRef<CornerActivationComponent>;

  datasetNameControl = new FormControl<string>('');
  datasetOptions: TwoVarGTensorDataset[] = basicGatesAsGTensor;
  filteredDatasets: Signal<TwoVarGTensorDataset[]>;
  // modelView: 'vis' | 'edit' = 'vis';

  // @ViewChild('datasetName', {static: false}) datasetNameInput!: Input;
  selectedDataset!: Signal<TwoVarGTensorDataset | null>;
  selectedDatasetTable!: Signal<DatasetExample[] | null>;
  // selectedDatasetTable$!: Observable<DatasetExample[] | null>;
  datasetVisTensor!: Signal<gtensor.GTensor<'x' | 'y' | 'rgb'> | null>;
  // datasetVisTensor$!: Observable<gtensor.GTensor<'x' | 'y' | 'rgb'> | null>;

  @ViewChild('datasetTable', { static: false }) datasetTable!: MatTable<gtensor.GTensor<never>>;
  datasetColumns: string[] = ['input', 'output'];

  constructor(private injector: Injector) {
    // TODO: check if injector is still needed now I've moved this to the
    // constructor.
    const datasetNameSignal = toSignal(this.datasetNameControl.valueChanges,
      { injector: this.injector, initialValue: null });
    this.filteredDatasets = computed(() => {
      const name = datasetNameSignal();
      console.log(`filteredDatasets: ${name}`, name);
      if (!name) { return this.datasetOptions.slice(); }
      return this._filter(name);
    });

    this.selectedDataset = computed(() => {
      const ds = this.filteredDatasets();
      console.log(`selectedDataset`, ds);
      if (ds.length !== 1) { return null; }
      return ds[0];
    });

    this.selectedDatasetTable = computed(() => {
      const d = this.selectedDataset();
      console.log(`selectedDatasetTable`, d);
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

  private _filter(name: string): TwoVarGTensorDataset[] {
    const filterValue = name.toLowerCase();
    return this.datasetOptions.filter(option => option.name.toLowerCase().includes(filterValue));
  }

  // TODO: think about if we should remove this?
  updateSelectedDataset(event: MatAutocompleteSelectedEvent): void {
    console.log('updateSelectedDataset1', this.datasetNameControl.value);
    console.log('updateSelectedDataset2', event.option.value);
    this.datasetNameControl.setValue(event.option.value);
  }

  toggleModelConfig(): void {
    if (this.view() === 'edit') {
      this.view.set('vis');
    } else if (this.view() === 'vis') {
      this.view.set('edit');
    }
    // this.componentRef.instance.view.set(this.modelView);
  }

}  // ActivationVisComponent
