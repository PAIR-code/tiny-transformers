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

import { Directive, Input } from '@angular/core';
import {
  AbstractControl,
  NG_VALIDATORS,
  ValidationErrors,
  Validator,
  ValidatorFn,
} from '@angular/forms';

export interface BoundsConfig {
  lowerBound?: number;
  upperBound?: number;
}

export interface BoundedFloatError {
  data: {
    value: string;
    config: BoundsConfig;
    message: string;
  };
}

/** A float that must be between 0 and 1 */
export function boundedFloatErrorFn(config: BoundsConfig, value: string): BoundedFloatError | null {
  const maybeNanFloat = parseFloat(value);
  const { lowerBound, upperBound } = config;
  if (isNaN(maybeNanFloat)) {
    return { data: { value, config, message: `nan` } };
  } else if (upperBound != undefined && maybeNanFloat > upperBound) {
    return {
      data: {
        value,
        config,
        message: `_ > ${upperBound}`,
      },
    };
  } else if (lowerBound !== undefined && maybeNanFloat < lowerBound) {
    return {
      data: {
        value,
        config,
        message: `_ < ${lowerBound}`,
      },
    };
  }
  return null;
}

export function boundedFloatValidator(config: BoundsConfig): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    return boundedFloatErrorFn(config, control.value);
  };
}

@Directive({
  selector: '[appBoundedFloatValidator]',
  standalone: true,
  inputs: ['config'],
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: BoundedFloatValidatorDirective,
      multi: true,
    },
  ],
})
export class BoundedFloatValidatorDirective implements Validator {
  @Input() config: BoundsConfig = {};

  validate(control: AbstractControl): ValidationErrors | null {
    return boundedFloatValidator(this.config)(control);
  }
}
