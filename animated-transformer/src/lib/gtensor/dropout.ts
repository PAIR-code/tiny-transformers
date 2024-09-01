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
    TensorOrVarKind,
    TensorKind,
    GTensor,
    GTensorOrVar,
    makeScalar,
    VariableKind,
  } from './gtensor';

  export type DropoutParams<T extends TensorOrVarKind> = {
    dropoutRate: GTensorOrVar<T, never>;
  } & {};
  // & {} is workaround for https://github.com/microsoft/TypeScript/issues/48070
  type WorkAroundMakesThisTrue = DropoutParams<VariableKind> extends DropoutParams<TensorKind>
    ? true
    : false;
  // These are needed to get workaround to function accross files.
  export type VarDropoutParams = DropoutParams<VariableKind>;
  export type TensorDropoutParams = DropoutParams<TensorKind>;

  export function initDropoutParams(
    dropoutRate: number,
  ): DropoutParams<TensorKind> {
    const dropoutParams: DropoutParams<TensorOrVarKind> = {
      dropoutRate: makeScalar(dropoutRate, 'float32'),
    };
    return dropoutParams;
  }
  
  
  export function dropout<G extends string, D extends G>(
    dropoutParams: DropoutParams<TensorOrVarKind>,
    g: GTensor<G>,
    dim: D,
    deterministic?: boolean,
  ): GTensor<G> {
    // TODO (@aliciafmachado): implement dropout
    return g;
  }
  