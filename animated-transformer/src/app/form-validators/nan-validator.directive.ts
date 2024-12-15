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

import { Directive } from '@angular/core';
import {
  AbstractControl,
  NG_VALIDATORS,
  ValidationErrors,
  Validator,
  ValidatorFn,
} from '@angular/forms';

/** A hero's name can't match the given regular expression */
export function nanValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const maybeNanFloat = parseFloat(control.value);
    return isNaN(maybeNanFloat) ? { nan: { value: control.value } } : null;
  };
}

@Directive({
  selector: '[appNanValidator]',
  standalone: true,
  providers: [{ provide: NG_VALIDATORS, useExisting: NanValidatorDirective, multi: true }],
})
export class NanValidatorDirective implements Validator {
  validate(control: AbstractControl): ValidationErrors | null {
    return nanValidator()(control);
  }
}
