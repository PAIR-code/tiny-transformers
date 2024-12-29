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
  signal,
  Component,
  OnDestroy,
  computed,
  WritableSignal,
  Signal,
  effect,
  Injector,
  untracked,
  EffectRef,
  viewChild,
  ChangeDetectionStrategy,
  input,
  model,
} from '@angular/core';
import {
  ConfigUpdate,
  ConfigUpdateKind,
} from '../../codemirror-config-editor/codemirror-config-editor.component';
import * as tf from '@tensorflow/tfjs';
import * as gtensor from '../../../lib/gtensor/gtensor';
import { mkVisTensor, TensorImageComponent } from '../../tensor-image/tensor-image.component';
import { FormControl, FormsModule, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { combineLatest, Subscription } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith, distinctUntilChanged, filter } from 'rxjs/operators';
import { stringifyJsonValue } from '../../../lib/json/pretty_json';

// import { pointWiseEval, softVoronoiEval, pointwiseGrad } from '../../lib/gtensor/boolfns';
import { pointwiseGrad } from '../../../lib/gtensor/boolfns';
import {
  boundedFloatValidator,
  BoundedFloatError,
} from '../../form-validators/bounded-float-validator.directive';
// import { nanValidator } from '../nan-validator.directive';
import { JsonValue } from 'src/lib/json/json';
import { ActivationManagerComponent } from '../activation-manager/activation-manager.component';
import * as _ from 'underscore';
import { CodemirrorConfigEditorComponent } from 'src/app/codemirror-config-editor/codemirror-config-editor.component';
import { MatInputModule } from '@angular/material/input';
import { AxisWrapperComponent } from '../axis-wrapper/axis-wrapper.component';

import { MatButtonModule } from '@angular/material/button';
import { TwoVarGTensorDataset } from 'src/lib/gtensor/the_16_two_var_bool_fns';

interface ActivationVizConfig {
  // Values of the parameters.
  // For now inner-list is assumed to be length 1 &
  // outer-list should be equal to paramPositions.
  paramValues: number[][];
  // Positions of the parameters. Must have same length as paramValues.
  paramPositions: number[][];
  // "1 / paramVisResolution" defines the increments in the evaluation
  // visualization
  paramVisResolution: number;
}

function makeDefaultActivationVizConfig(): ActivationVizConfig {
  return {
    paramValues: [[0], [1], [1], [0]],
    // Note: not really editable; pointWise eval assumes these are at corner
    // points of the space's dimensions.
    paramPositions: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    //
    paramVisResolution: 4,
  };
}

function isSameGTensorValue<T extends gtensor.DName>(
  a: gtensor.GTensor<T>,
  b: gtensor.GTensor<T>,
): boolean {
  if (!_.isEqual(a.gshape(), b.gshape())) {
    return false;
  }
  // console.log(`a: ${JSON.stringify(a.tensor.arraySync())}`);
  // console.log(`b: ${JSON.stringify(b.tensor.arraySync())}`);
  const equalArrays = tf.all(tf.equal(a.tensor, b.tensor)).arraySync() === 1;
  // console.log('isSameGTensorValue', arr);
  return equalArrays;
}

const validatorConfig = { lowerBound: 0, upperBound: 1 };
const floatValidator = boundedFloatValidator(validatorConfig);

@Component({
  selector: 'app-corner-activation',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    CodemirrorConfigEditorComponent,
    MatInputModule,
    MatButtonModule,
    TensorImageComponent,
    AxisWrapperComponent,
    ActivationManagerComponent,
  ],
  templateUrl: './corner-activation.component.html',
  styleUrls: ['./corner-activation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CornerActivationComponent extends ActivationManagerComponent implements OnDestroy {
  readonly view = model<'edit' | 'vis'>('vis');
  readonly dataset = input<TwoVarGTensorDataset | null>(null);

  updateParamsFromControlsEffect?: EffectRef;

  paramValueControls: WritableSignal<FormControl<string>[]>;
  controlValuesArr: Signal<string[]> = signal([]);
  controlSubscriptions?: Subscription[];
  learningRateControl: FormControl<string>;

  paramVisResolution: Signal<number>;
  paramsValuesTensor: WritableSignal<gtensor.GTensor<'pointId' | 'outputRepSize'>>;
  lastParams?: gtensor.GTensor<'pointId' | 'outputRepSize'>;

  // paramPositionsTensor uses standard visual coordinates i.e. [0,0] is top
  // left, and first axis is x and second is y. (w.r.t. rendering code)
  // Also, 0 = false = black; and 1 = true = white.
  paramPositionsTensor: WritableSignal<gtensor.GTensor<'pointId' | 'inputRepSize'>>;
  paramsVisTensor: Signal<gtensor.GTensor<'x' | 'y' | 'rgb'> | null>;

  // These get set right before we open the config panel, so that we can use the config panel to
  // configure models, or global app settings.
  defaultConfigStr: string = stringifyJsonValue(
    makeDefaultActivationVizConfig() as never as JsonValue,
  );
  currentConfigStr: string = this.defaultConfigStr.slice();
  currentConfig: WritableSignal<ActivationVizConfig>; // json5.parse(this.currentConfigStr));

  grad: Signal<gtensor.GTensor<'pointId' | 'outputRepSize'> | null>;

  readonly tensorImg = viewChild.required<TensorImageComponent>('tensorImg');

  // ----------------------------------------------------------------------------------------------
  constructor(
    private injector: Injector, // private tfvisService: TfvisService
  ) {
    super();

    this.currentConfig = signal(makeDefaultActivationVizConfig(), {
      equal: _.isEqual,
    });
    // initial positions and values come from the config. But they are not the
    // same as the config: we don't change the config on training.
    this.paramPositionsTensor = signal(
      new gtensor.GTensor(tf.tensor(this.currentConfig().paramPositions), [
        'pointId',
        'inputRepSize',
      ]),
    );
    this.paramsValuesTensor = signal(
      new gtensor.GTensor(tf.tensor(this.currentConfig().paramValues), [
        'pointId',
        'outputRepSize',
      ]),
    );

    // config chnages update the param values and positions.
    effect(() => {
      const conf = this.currentConfig();
      this.updateParamPositions(conf.paramPositions);
      this.updateParamValues(conf.paramValues);
    });

    this.paramVisResolution = computed(() => this.currentConfig().paramVisResolution);

    this.paramsVisTensor = computed(
      () =>
        mkVisTensor(
          this.paramVisResolution(),
          this.paramsValuesTensor(),
          this.paramPositionsTensor(),
        ),
      { equal: isSameGTensorValue },
    );

    // controls are updated only when dim size changes
    this.paramValueControls = signal([], { equal: _.isEqual });
    effect(() => {
      const values = this.paramsValuesTensor();
      if (this.lastParams && this.lastParams.dim.pointId.size === values.dim.pointId.size) {
        return;
      }
      this.lastParams = values;
      const paramValues = values.tensor.arraySync() as number[][];
      const controls = [] as FormControl<string>[];
      for (let i = 0; i < values.dim.pointId.size; i++) {
        controls.push(
          new FormControl(`${JSON.stringify(paramValues[i][0])}` as string, [
            floatValidator,
          ]) as FormControl<string>,
        );
      }
      this.paramValueControls.set(controls);
    });

    effect(() => {
      const valueControls = this.paramValueControls();
      // controls --> controlValuesArr
      untracked(() => {
        this.controlValuesArr = toSignal(
          combineLatest(
            valueControls.map((c) =>
              c.valueChanges.pipe(
                filter((v) => {
                  const f = parseFloat(v);
                  return !isNaN(f) && f >= 0 && f <= 1;
                }),
                startWith(c.value),
                distinctUntilChanged(),
              ),
            ),
          ),
          {
            requireSync: true,
            // initialValue: this.paramValueControls().map(c => c.value),
            injector: this.injector,
          },
        );

        if (this.updateParamsFromControlsEffect) {
          this.updateParamsFromControlsEffect.destroy();
        }

        // controlValuesArr --> paramValues.
        this.updateParamsFromControlsEffect = effect(
          () => {
            const controlValues = this.controlValuesArr();
            const curValues = untracked(this.paramsValuesTensor).tensor.arraySync() as number[][];
            let needToUpdate = false;
            for (let i = 0; i < curValues.length; i++) {
              const s = controlValues[i];
              const newValue = parseFloat(s);
              if (!isNaN(newValue) && curValues[i][0] !== newValue) {
                curValues[i][0] = newValue;
                needToUpdate = true;
              }
            }
            if (needToUpdate) {
              this.updateParamValues(curValues);
            }
          },
          { injector: this.injector },
        );
      });
    });

    // paramValues --> value controls
    effect(() => {
      // TODO: assumes controls and values are same length.
      const values = this.paramsValuesTensor();
      const controls = this.paramValueControls();
      const valuesArr = values.tensor.arraySync() as number[][];
      for (let i = 0; i < controls.length; i++) {
        // Used to make sure that when a value is changed by gradient update,
        // the controller knows the new value, and if the user makes an edit
        // that put the value back to the last user-provided value, the value
        // is still changed.
        //
        // TODO: this is where the dependency on a single output value is,
        // the [0] implies outputRepSize = 1
        //
        // Update the value only when it's sufficiently different
        const PRECISION = 4;
        const newValue = valuesArr[i][0].toFixed(PRECISION);
        const oldValue = parseFloat(controls[i].value).toFixed(PRECISION);
        if (newValue !== oldValue) {
          // console.log(`valuesArr[i][0].toFixed(PRECISION): ${valuesArr[i][0].toFixed(PRECISION)}`);
          const directParamStr = `${valuesArr[i][0]}`;
          const directParamStrFixed = newValue;
          controls[i].setValue(
            directParamStr.length < directParamStrFixed.length
              ? directParamStr
              : directParamStrFixed,
            { emitEvent: true },
          );
        }
        // const emitEvent = false; // controls[i].value !== paramValue;
      }
    });

    this.grad = computed(() => {
      const positions = this.paramPositionsTensor();
      const params = this.paramsValuesTensor();
      const dataset = this.dataset();
      if (!dataset || !params || !positions) {
        return null;
      }
      return pointwiseGrad(params, positions, dataset.inputs, dataset.outputs);
    });

    this.learningRateControl = new FormControl(`0.1`) as FormControl<string>;
  }

  updateParamValues(paramValues: number[][]) {
    this.paramsValuesTensor.update((oldValues) => {
      const newValues = new gtensor.GTensor(tf.tensor(paramValues), ['pointId', 'outputRepSize']);
      if (isSameGTensorValue(oldValues, newValues)) {
        return oldValues;
      }
      return newValues;
    });
  }

  updateParamPositions(paramPositions: number[][]) {
    this.paramPositionsTensor.update((oldPositions) => {
      const newPositions = new gtensor.GTensor(tf.tensor(paramPositions), [
        'pointId',
        'inputRepSize',
      ]);
      if (isSameGTensorValue(oldPositions, newPositions)) {
        return oldPositions;
      }
      return newPositions;
    });
  }

  unsubscribeControls(): void {
    if (this.controlSubscriptions) {
      for (const s of this.controlSubscriptions) {
        s.unsubscribe();
      }
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeControls();
  }

  paramValueErrorString(errors: BoundedFloatError | ValidationErrors) {
    if (errors['data']) {
      return errors['data'].message;
    } else {
      return JSON.stringify(errors);
    }
  }

  configUpdated(event: unknown): void {
    // When configUpdate has a new object, we assume it to be correct.
    //
    // TODO: provide some runtime value type checking. Right now all that is
    // needed is valid JSON/JSON5, but if you provide valid JSON missing needed
    // values (e.g. encoderConfig is null), it should complain here, but
    // currently does not.

    const configUpdate = event as ConfigUpdate<ActivationVizConfig>;

    if (configUpdate.close) {
      console.log(`this.view (was: ${this.view()}) is being set to vis`);
      this.view.set('vis');
    }

    if (configUpdate.kind !== ConfigUpdateKind.UpdatedValue) {
      return;
    }

    this.currentConfigStr = configUpdate.json;
    this.currentConfig.set(configUpdate.obj);
  }

  get tfMemoryState(): string {
    return JSON.stringify(tf.memory(), null, 2);
  }

  applyGrad(): void {
    // const curConfig = this.currentConfig();
    const curGradient = this.grad();
    const curParams = this.paramsValuesTensor();
    // console.log(`curParams: ${JSON.stringify(curParams.tensor.arraySync())}`);
    // console.log(`curGradient: ${JSON.stringify(!curGradient || curGradient.tensor.arraySync())}`);
    // console.log(`curConfig: ${JSON.stringify(curConfig)}`);
    if (!curGradient) {
      console.warn('applyGrad called when gradient was not defined.');
      return;
    }
    const curLR = parseFloat(this.learningRateControl.value);
    this.paramsValuesTensor.set(curParams.pointwiseSub(curGradient._tfScalarMul(tf.scalar(curLR))));
    // curConfig.paramValues =
    // console.log(`new curConfig: ${JSON.stringify(curConfig)}`);

    // this.currentConfig.set(curConfig);
  }
}
