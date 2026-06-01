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
import { MonacoConfigEditorComponent } from '../monaco-config-editor/monaco-config-editor.component';
import { RouterModule } from '@angular/router';

import { AxisWrapperComponent } from './axis-wrapper/axis-wrapper.component';
import { AutoCompletedTextInputComponent } from '../auto-completed-text-input/auto-completed-text-input.component';
import { ActivationManagerComponent } from './activation-manager/activation-manager.component';
import { NanValidatorDirective } from '../form-validators/nan-validator.directive';
import { BoundedFloatValidatorDirective } from '../form-validators/bounded-float-validator.directive';
import { MarkdownModule } from 'ngx-markdown';

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
    TensorImageComponent,
    AxisWrapperComponent,
    // ActivationManagerDirective,
    // NanValidatorDirective,
    // BoundedFloatValidatorDirective,
    MarkdownModule,
  ],
  templateUrl: './activation-vis.component.html',
  styleUrls: ['./activation-vis.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivationVisComponent implements OnInit {
  explainerMarkdown = `
### Learning Boolean Circuits via Continuous Relaxation

This visualization demonstrates how **gradient descent** can be used to learn arbitrary boolean circuits (such as **AND**, **OR**, **XOR**, etc.) by relaxing a discrete, boolean search space into a continuous, differentiable field.

---

#### 1. The Key Idea: Hypercube Relaxation
A standard boolean function of two inputs **x, y ∈ {0, 1}** maps the four corners of a unit square to an output **z ∈ {0, 1}**:
* **Corner p₀₀ = (0, 0)** &rarr; parameter **w₀₀**
* **Corner p₁₀ = (1, 0)** &rarr; parameter **w₁₀**
* **Corner p₀₁ = (0, 1)** &rarr; parameter **w₀₁**
* **Corner p₁₁ = (1, 1)** &rarr; parameter **w₁₁**

To allow gradient-based learning, we relax the discrete domain. Instead of discrete lookups, the output at any continuous coordinate **v = (x, y) ∈ [0, 1]²** is defined as a **smooth interpolation** of the four corner parameters **w_p ∈ [0, 1]**.

---

#### 2. How Activations are Interpolated
For any input point **v = (x, y)**, we compute a **coordinate-wise similarity weight** **w_p(x, y)** for each corner **p = (p_x, p_y)**:

**w_p(x, y) = (1 - (x - p_x)²) · (1 - (y - p_y)²)**

* When **(x, y)** is exactly at a corner **p**, its similarity weight **w_p(x, y)** is **1**, while all other corner weights are **0**.
* As **(x, y)** moves away from a corner, the weight decays quadratically.

The final predicted activation **ẑ(x, y)** is the **normalized weighted average** of the corner values:

**ẑ(x, y) = Σ [w_p(x, y) · w_p] / Σ w_p(x, y)**

This formulation yields the smooth, continuous landscape visualized in the **Param eval matrix**. It perfectly matches the parameters at the corners and blends them smoothly across the space.

---

#### 3. How Gradients are Computed & Learned
When you select a dataset (e.g., XOR):
1. **Define a Loss Function**: We measure the Mean Squared Error (MSE) between the model's predictions **ẑ(x, y)** and the true target outputs **z** across the dataset examples:
   
   **Loss = Σ (ẑ(x_j, y_j) - z_j)²**

2. **Backpropagation**: Since **ẑ(x, y)** is fully differentiable, we can compute the exact gradient of the loss with respect to each corner parameter:
   
   **∂Loss / ∂w_p**
   
   This gradient represents the direction and magnitude of the error contribution for each corner parameter.

3. **Gradient Descent Steps**: Clicking **"Apply Gradient Step"** subtracts a fraction of this gradient (scaled by the **Learning Rate** **η**) from the parameters:
   
   **w_p &larr; w_p - η · (∂Loss / ∂w_p)**

By taking successive gradient steps, the corner values converge to the exact truth table of the target boolean function!

---

#### 4. Properties & Theoretical Trade-offs
This continuous relaxation approach has remarkable theoretical properties:
* **Guaranteed Convergence**: Because the interpolated output is a linear function of the corner parameters **w_p**, the Mean Squared Error (MSE) loss is a convex quadratic function with respect to these parameters. This means there are **no local minima**&mdash;gradient descent is mathematically guaranteed to learn any target boolean circuit from **any arbitrary initialization**!
* **Exponential Parameter Cost**: The main drawback is scalability. Since we define a separate parameter **w_p** for every single corner of the input hypercube, the number of parameters required is **2ⁿ** (where **n** is the number of input variables). For complex functions with many inputs, this parameter growth becomes exponentially expensive.
`;

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
