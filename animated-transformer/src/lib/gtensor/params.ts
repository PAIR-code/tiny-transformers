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
/*

We use the term Params to refer to the set of types that match 

  jstree.DictArrTree<GTensor<any>>

That is, any javascript object with GTensor leaves (including GVariable leaves).

e.g. 

  type LayerNormParams<T extends TensorKind> = {
    gain: GTensorKindFn<T, never>;
    bias?: GTensorKindFn<T, never>;
    epsilon: GTensorKindFn<T, never>;
  } 

provides you with a type that has a gain, bias, and epsilon scalar values, and
when TensorKind is GTensor, this is: 

  type LayerNormParams = {
    gain: GScalar;
    bias?: GScalar;
    epsilon: GScalar;
  }

The neat thing about this class of types is that there are some nice programatic
type operations that let you do things like convert them into serializable
objects, or variable-objects (objects that can be assigned to in GPU memory).

  const l = LayerNormParams;
  const savableL = constToSerialParams(l);

will give you: 

  savableL: {
    gain: SerializedGScalar;
    bias?: SerializedGScalar;
    epsilon: SerializedGScalar;
  }

Note: 
  GScalar = GTensor<never>
  SerializedGScalar = SerializedGTensor<never>
*/

import * as jstree from '../js_tree/js_tree';
import { DName, GTensor, GVariable, SerializedGTensor } from './gtensor';

// ----------------------------------------------------------------------------
// Note: the key idea here is that we can parameterise other types so that a
// given instance knows if it has Variable (imperitively editable) parameter
// values, or if the tensors might be fixed constant tensors.
export type ConstTKind = 'constTensor'; // == GTensor
export type VarTKind = 'varTensor'; // == GVariable
export type SerialTKind = 'serialisedTensor'; // ==
export type TensorKind = ConstTKind | VarTKind | SerialTKind;

export type AnyGTensorOrVar<T extends TensorKind> = T extends ConstTKind
  ? GTensor<any>
  : T extends VarTKind
  ? GVariable<any>
  : T extends SerialTKind
  ? SerialTKind
  : never;

export type GTensorKindFn<T extends TensorKind, D extends DName> = T extends ConstTKind
  ? GTensor<D>
  : T extends VarTKind
  ? GVariable<D>
  : T extends SerialTKind
  ? SerialTKind
  : never;

export type VarifyTensorParams<T> = T extends (infer SubT)[]
  ? VarifyTensorParams<SubT>[]
  : T extends GTensor<infer N>
  ? GVariable<N>
  : T extends jstree.DictTree<GTensor<any>>
  ? { [key in keyof T]: VarifyTensorParams<T[key]> }
  : never;

export type SerializeTensorParams<T> = T extends (infer SubT)[]
  ? SerializeTensorParams<SubT>[]
  : T extends GTensor<infer N>
  ? SerializedGTensor<N>
  : T extends jstree.DictTree<GTensor<any>>
  ? { [key in keyof T]: SerializeTensorParams<T[key]> }
  : never;

export function constToVarParams<Params extends jstree.DictArrTree<GTensor<any>>>(
  params: Params
): VarifyTensorParams<Params> {
  const vparams = jstree.map(params, (t: GTensor<any>) => new GVariable(t));
  return vparams as VarifyTensorParams<Params>;
}

export function constToSerialParams<Params extends jstree.DictArrTree<GTensor<any>>>(
  params: Params
): SerializeTensorParams<Params> {
  const vparams = jstree.map(params, (t: GTensor<any>) => t.toSerialised());
  return vparams as SerializeTensorParams<Params>;
}
