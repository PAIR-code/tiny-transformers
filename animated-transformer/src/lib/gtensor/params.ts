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

  type LayerNormParams = {
    gain: GScalar;
    bias?: GScalar;
    epsilon: GScalar;
  }

Is type that has a gain, bias, and epsilon scalar tensor values.

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

Where: 
  GScalar = GTensor<never>
  SerializedGScalar = SerializedGTensor<never>
*/

import * as jstree from '../js_tree/js_tree';
import { SavableValueKind } from '../weblab/savable-value';
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

export type DeserializeTensorParams<T> = T extends (infer SubT)[]
  ? DeserializeTensorParams<SubT>[]
  : T extends SerializedGTensor<infer N>
  ? GTensor<N>
  : T extends jstree.DictTree<SerializedGTensor<any>>
  ? { [key in keyof T]: DeserializeTensorParams<T[key]> }
  : never;

// Note: there is no varToConstParams because GVariable is a supertype of
// GTensor already. So you should never need that.

export function varifyParams<Params extends jstree.DictArrTree<GTensor<any>>>(
  params: Params
): VarifyTensorParams<Params> {
  const vparams = jstree.map(params, (t: GTensor<any>) => new GVariable(t));
  return vparams as VarifyTensorParams<Params>;
}

export function serializeParams<Params extends jstree.DictArrTree<GTensor<any>>>(
  params: Params
): SerializeTensorParams<Params> {
  const vparams = jstree.map(params, (t: GTensor<any>) => t.toSerialised());
  return vparams as SerializeTensorParams<Params>;
}

export function deserializeParams<SerialParams extends jstree.DictArrTree<SerializedGTensor<any>>>(
  serialParams: SerialParams
): DeserializeTensorParams<SerialParams> {
  const params = jstree.map(serialParams, (s: SerializedGTensor<any>) => GTensor.fromSerialised(s));
  return params as DeserializeTensorParams<SerialParams>;
}

// Unclear if this is useful or not...
export function savableParamsKind<Params extends jstree.DictArrTree<GTensor<any>>>() {
  return new SavableValueKind<'SVK_Params', Params, SerializeTensorParams<Params>>(
    'SVK_Params',
    serializeParams as (params: Params) => SerializeTensorParams<Params>,
    deserializeParams as (serialParams: SerializeTensorParams<Params>) => Params
  );
}

export function listifyVarParams<VarParams extends jstree.DictArrTree<GVariable<any>>>(
  p: VarParams
) {
  return jstree.flatten(p as jstree.DictArrTree<GVariable<any>>);
}

export function assignParams<Params extends jstree.DictArrTree<GTensor<any>>>(
  p: VarifyTensorParams<Params>,
  t: Params
) {
  return jstree.forEachZip<GVariable<any>, GTensor<any>>(
    (lp, lt) => lp.variable.assign(lt.tensor),
    p,
    t
  );
}

export function disposeParams(p: jstree.DictArrTree<GTensor<any>>) {
  jstree.map(p, (g) => g.dispose());
}
