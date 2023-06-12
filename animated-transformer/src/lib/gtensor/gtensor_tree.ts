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


/* Parameter Naming to Index Maps.

Provides a canonical translation back forth between a nested dicts with leaf
gtensors (e.g. used to store all parameters for a model), and a list of tensors
as needed by tfjs for calculating gradients etc.
*/

import { GTensor, DName, GVariableOrScalar, GTensorOrScalar, GVariable } from './gtensor';
import { Tensor } from '@tensorflow/tfjs';
import { JsTreeLib, DictArrTree, DictTree, JsTree } from '../js_tree/js_tree';

// ----------------------------------------------------------------------------
//  Application to GTensors and Tensors
// ----------------------------------------------------------------------------
// Note: you can't use string type instead of any here.
export function isGTensor(g: unknown): g is GTensorOrScalar {
  return g instanceof GTensor;
}
export function isGVariable(g: unknown): g is GVariableOrScalar {
  return g instanceof GTensor;
}


// export type ParamLeaf = GVariable<any> | GVariable<never> | GTensor<any> | GTensor<never> | string | number | boolean;

// export function isParamLeaf(x: unknown): x is ParamLeaf {
//   return typeof x === 'number' || typeof x === 'string'
//     || typeof x === 'boolean' || x instanceof GTensor;
// }


// export function gTensorRemapper<T extends DName>(g: GTensor<T>, t: Tensor): GTensor<T> {
//   return new GTensor(t, g.dimNames);
// }

// export type GTensorTree = DictArrTree<GTensorOrScalar>;

export const gtensorTrees = new JsTreeLib(isGTensor);
export const gvariableTrees = new JsTreeLib(isGVariable);
// export const paramTrees = new JsTreeLib(isParamLeaf);

// export function flattenToTensors<P extends GTensorTree>(t: P): Tensor[] {
//   return gtensorTrees.flatten(t).map(x => x.tensor);
// }

// export function unflattenFromTensors<P extends DictArrTree<GTensorOrScalar>>(
//   shape: P, tensors: Tensor[]
// ): P {
//   return gtensorTrees.map(shape, (g, i) => {
//     return new GTensor(tensors[i], g.dimNames);
//   }) as P;
// }

export type JsTreeGVariable = DictArrTree<GTensorOrScalar>;
export type JsTreeGTensor = DictArrTree<GTensorOrScalar>;

/**
 * A wrapper for when there are two views of an object, one is as a GTensorTree,
 * and the other as the raw object that you access normally.
 */
// export class JsIsoWrap<T, Tree extends JsTreeGTensor> {
//   tree: Tree;

//   constructor(
//     public asTree: (x: T) => Tree,
//     public asParts: (t: Tree) => T,
//     public parts: T,
//   ) {
//     this.tree = asTree(parts);
//   }

//   map(fn: (l: GTensor<string>, i: number) => GTensor<string>) {
//     this.tree = gtensorTrees.map(this.tree, fn) as Tree;
//     this.parts = this.asParts(this.tree);
//   }

//   forEach(fn: (l: GTensor<string>, i: number) => void) {
//     gtensorTrees.forEach(fn, this.tree);
//   }

//   flatten(): GTensor<string>[] {
//     return gtensorTrees.flatten(this.tree);
//   }
// }

export class GVariableTree<T> extends JsTree<GVariableOrScalar, T> {
  constructor(
    init: T & DictArrTree<GVariableOrScalar>
  ) {
    super(gvariableTrees, init);
  }
}

export class GTensorTree<T> extends JsTree<GTensorOrScalar, T> {
  constructor(
    init: T & DictArrTree<GTensorOrScalar>
  ) {
    super(gvariableTrees, init);
  }
}

// REFLECTION: Probably a bad idea to mix params and compute spec.

// export class ParamTree<T> extends JsTree<ParamLeaf, T> {
//   constructor(
//     init: T & DictArrTree<ParamLeaf>
//   ) {
//     super(paramTrees, init);
//   }
// }


// /**
//  * A wrapper for when there are two views of an object, one is as a GTensorTree,
//  * and the other as the raw object that you access normally.
//  */
// export class GVariableTree<T> {
//   tree: DictArrTree<GVariable<string> | GVariable<never>>;
//   obj: T;

//   constructor(
//     init: T | DictArrTree<GVariable<string> | GVariable<never>>,
//   ) {
//     this.tree = init as DictArrTree<GVariable<string> | GVariable<never>>;
//     this.obj = init as T;
//   }

//   map(fn: (l: GVariable<string>, i: number) => GVariable<string>) {
//     this.tree = gvariableTrees.map(this.tree, fn);
//     this.obj = this.tree as never as T;
//   }

//   forEach(fn: (l: GTensor<string>, i: number) => void) {
//     gtensorTrees.forEach(fn, this.tree);
//   }

//   flatten(): GTensor<string>[] {
//     return gtensorTrees.flatten(this.tree);
//   }
// }



/**
 * A wrapper for when there are two views of an object, one is as a GTensorTree,
 * and the other as the raw object that you access normally.
 */
export class JsWrap<Tree extends JsTreeGTensor, T> {
  tree: Tree;
  obj: T;

  constructor(
    init: T | JsTreeGTensor,
  ) {
    this.tree = init as Tree;
    this.obj = init as T;
  }

  map(fn: (l: GTensor<string>, i: number) => GTensor<string>) {
    this.tree = gtensorTrees.map(this.tree, fn) as Tree;
    this.obj = this.tree as never as T;
  }

  forEach(fn: (l: GTensor<string>, i: number) => void) {
    gtensorTrees.forEach(fn, this.tree);
  }

  flatten(): GTensor<string>[] {
    return gtensorTrees.flatten(this.tree);
  }
}



// export class Params<T, LeafT> {
//   tree: DictArrTree<LeafT>;

//   constructor(
//     public asTree: (x: T) => DictArrTree<LeafT>,
//     public asParts: (t: DictArrTree<LeafT>) => T,
//     public parts: T,
//   ) {
//     this.tree = asTree(obj);
//   }

//   map(fn: (l: LeafT, i: number) => LeafT) {
//     map
//   }
// }
