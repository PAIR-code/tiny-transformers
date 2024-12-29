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

import { Directive, input } from '@angular/core';
import {
  AbstractControl,
  NG_VALIDATORS,
  ValidationErrors,
  Validator,
  ValidatorFn,
} from '@angular/forms';
import json5 from 'json5';

export interface JsonStrListConfig {
  maxListLen?: number;
  minListLen?: number;
  validStrValues?: Set<string>;
}

export interface JsonStrListError {
  data: {
    value: string;
    config: JsonStrListConfig;
    message: string;
  };
}

export function jsonStrListErrorFn(
  config: JsonStrListConfig,
  value: string,
): JsonStrListError | null {
  let parsedValue: Array<string> | unknown;
  if (!value) {
    return { data: { value, config, message: `empty` } };
  }

  try {
    parsedValue = json5.parse(value);
  } catch (parseError: unknown) {
    console.warn(`jsonStrListErrorFn: ${parseError}`, value);
    return { data: { value, config, message: `not json` } };
  }

  if (!Array.isArray(parsedValue)) {
    return { data: { value, config, message: `not array` } };
  }

  if (config.maxListLen && parsedValue.length > config.maxListLen) {
    return {
      data: {
        value,
        config,
        message: `length ${parsedValue.length} > ${config.maxListLen}`,
      },
    };
  }

  if (config.minListLen && parsedValue.length > config.minListLen) {
    return {
      data: {
        value,
        config,
        message: `length ${parsedValue.length} < ${config.minListLen}`,
      },
    };
  }

  if (config.minListLen && parsedValue.length > config.minListLen) {
    return {
      data: {
        value,
        config,
        message: `length ${parsedValue.length} < ${config.minListLen}`,
      },
    };
  }

  if (config.validStrValues) {
    for (const el of parsedValue) {
      if (!config.validStrValues.has(el)) {
        return {
          data: {
            value,
            config,
            message: `invalid: ${el}`,
          },
        };
      }
    }
  }

  return null;
}

export function jsonStrListValidator(config: JsonStrListConfig): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    return jsonStrListErrorFn(config, control.value);
  };
}

@Directive({
  selector: '[appJsonStrListValidator]',
  // inputs: ['config'],
  standalone: true,
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: JsonStrListValidatorDirective,
      multi: true,
    },
  ],
})
export class JsonStrListValidatorDirective {
  readonly config = input<JsonStrListConfig>({});

  validate(control: AbstractControl): ValidationErrors | null {
    return jsonStrListValidator(this.config())(control);
  }
}
