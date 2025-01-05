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

/* Graphical Tensors: each dimension is named.

Related stuff:

* PyTorch Named Tensors:
https://pytorch.org/docs/stable/named_tensor.html
https://github.com/harvardnlp/namedtensor/
http://nlp.seas.harvard.edu/NamedTensor aka Tensors Considered Harmful.

* XArray: pandas inspired numerical library for python.
http://xarray.pydata.org/en/stable/

* Haskell:
https://blog.jle.im/entry/practical-dependent-types-in-haskell-1.html

* Random github bug discussion (a bit confused/confusing):
https://github.com/KhronosGroup/NNEF-Tools/issues/3

TODO: Cleanup the typing using this library: https://github.com/unional/type-plus
  Looks likely that we can get this to check sizes too, although it may make types
  painful/annoying to read.

*/
import * as tf from '@tensorflow/tfjs';
import * as tf_init from '@tensorflow/tfjs-layers/dist/initializers';
import { contract, ContractSpec } from './contract';
import { range } from './gtensor_util';
import { number } from 'yargs';

// export type DName = string | number | symbol;

// Null means it's a constant; there are no dimensions.
export type DName = string;

export interface DimensionData<G extends DName, D extends G> {
  name: D;
  size: number;
  gtensor: GTensor<G>;
  index: number;
}

export type GTensorOrScalar = GTensor<any> | GTensor<never>;
export type GVariableOrScalar = GVariable<any> | GVariable<never>;

interface ErrorMustNotHaveCommonDimension<D, G> {
  _opaqueError: ['ErrorMustNotHaveCommonDimension', D, G];
}

// It would be nice to do this well...
// interface ErrorMustHaveCommonDimension<D, G> {
//   _opaqueError: ['ErrorMustHaveCommonDimension', D, G];
// }

interface ErrorMustPassDimension {
  _opaqueError: ['ErrorMustPassDimensionToDot'];
}

interface ErrorDimensionNamesMustBeEqual<D1, D2> {
  _opaqueError: ['ErrorDimensionNamesMustBeEqual', D1, D2];
}

interface ErrorNotAllowedName<OtherNames> {
  _opaqueError: ['ErrorNotAllowedName', OtherNames];
}

// Hack until can do more with the type system...
function assertCommonNames<G extends string, G2 extends string>(
  g1: GTensor<G>,
  g2: GTensor<G2>
): void {
  const commonNames = g1.dimNames.filter((n) => n in g2.dim);
  if (commonNames.length === 0) {
    throw new Error(`No common dims: ${g1.dimNames} and ${g2.dimNames}`);
  }
  return;
}

// When D1 is a name in M1, and D2 is a name in M2, and D1 = D2 (= D) and D
// is the only name in both M1 and M2; then this type is Dimension<M2, D>.
type DotCompatibleDimension<
  M1 extends string,
  D1 extends M1,
  M2 extends string,
  D2 extends M2
> = D2 extends never
  ? ErrorMustPassDimension
  : D1 extends D2
  ? D2 extends D1
    ? Exclude<M1 & M2, D1 & D2> extends never
      ? Dimension<M2, D2>
      : ErrorNotAllowedName<Exclude<M1 & M2, D2>>
    : ErrorDimensionNamesMustBeEqual<D2, D1>
  : ErrorDimensionNamesMustBeEqual<D1, D2>;

type DisjointDimensions<G2 extends DName, G extends DName> = G2 & G extends never
  ? G2
  : ErrorMustNotHaveCommonDimension<G2, G>;

interface ErrorLiftDimInInput<D> {
  _LiftError_DimInInput: ['LiftError_DimInInput', D];
}

interface ErrorLiftDimInOutput<D> {
  _LiftError_DimMustBeInFnOutput: ['LiftError_DimInOutput', D];
}

// type for: D is a dimension-name not in G and not in G2.
type DimensionFnToLift<D extends DName, G extends DName, G2 extends DName> = D extends G
  ? ErrorLiftDimInInput<D>
  : D extends G2
  ? ErrorLiftDimInOutput<D>
  : D;

export function liftGTensorFnOverDim<D extends string, G extends string, G2 extends string>(
  liftDim: DimensionFnToLift<D, G, G2>,
  toLiftFn: (input: GTensor<G>) => GTensor<G2>
): (input: GTensor<G | D>) => GTensor<G2 | D> {
  function liftedFn(input: GTensor<G | D>): GTensor<G2 | D> {
    if (!((liftDim as string) in input.dim)) {
      throw new ValueError(
        `The lift dimension ${String(liftDim)} must occur in input's dimensions: ${Object.keys(
          input
        )}`
      );
    }
    return toLiftFn(input as GTensor<G>) as GTensor<G2 | D>;
  }
  return liftedFn;
}

export function liftFnOverDim<D extends string, G extends string, G2 extends string>(
  liftDim: DimensionFnToLift<D, G, G2>,
  toLiftFn: (input: Dims<G>) => Dims<G2>
): (input: Dims<G | D>) => Dims<G2 | D> {
  function liftedFn(input: Dims<G | D>): Dims<G2 | D> {
    if (!((liftDim as string) in input)) {
      throw new ValueError(
        `The lift dimension ${String(liftDim)} must occur in input's dimensions: ${Object.keys(
          input
        )}`
      );
    }
    const unstackedDims = input[liftDim as D].unstack() as never as Dims<G>[];
    return stack(liftDim as D, unstackedDims.map(toLiftFn));
  }
  return liftedFn;
}

export function liftMapFnOverDim<
  D extends string, // The new dimension being lifted over.
  G extends string, // The dimensions of the input.
  // A mapping from the name of each output of toLiftFn to the dimensions of that output.
  MapDim extends { [key in keyof MapDim]: MapDim[keyof MapDim] }
>(
  liftDim: DimensionFnToLift<D, G, MapDim[keyof MapDim]>,
  toLiftFn: (input: Dims<G>) => { [key in keyof MapDim]: Dims<MapDim[key]> }
): (input: Dims<G | D>) => { [key in keyof MapDim]: Dims<MapDim[key] | D> } {
  function liftedFn(input: Dims<G | D>): {
    [key in keyof MapDim]: Dims<MapDim[key] | D>;
  } {
    if (!((liftDim as string) in input)) {
      throw new ValueError(
        `The lift dimension ${String(liftDim)} must occur in input's dimensions: ${Object.keys(
          input
        )}`
      );
    }
    const unstackedDims = input[liftDim as D].unstack() as never as Dims<G>[];
    const unstackedApplications = unstackedDims.map(toLiftFn);
    const stackedApplications = {} as {
      [key in keyof MapDim]: Dims<MapDim[key] | D>;
    };
    for (const key of Object.keys(unstackedApplications[0]) as (keyof MapDim)[]) {
      const toStack = unstackedApplications.map((a) => a[key] as Dims<MapDim[keyof MapDim]>);
      stackedApplications[key] = stack(liftDim as D, toStack);
    }
    return stackedApplications;
  }
  return liftedFn;
}

// G is the set of all names in the tensor. D is the specific name of this dimension.
export class Dimension<G extends string, D extends G> implements DimensionData<G, D> {
  name: D;
  size: number;
  gtensor: GTensor<G>;
  index: number;

  constructor(e: DimensionData<G, D>) {
    this.name = e.name;
    this.size = e.size;
    this.gtensor = e.gtensor;
    this.index = e.index;
  }

  get dtype(): tf.DataType {
    return this.gtensor.tensor.dtype;
  }

  // The shape of the Tensor without this dimension.
  get externalShape(): number[] {
    return this.gtensor.tensor.shape.splice(this.index, 1);
  }

  get isFirstDim(): boolean {
    return this.index === 0;
  }
  get isSecondDim(): boolean {
    return this.index === 1;
  }
  get isLastDim(): boolean {
    return this.index === this.gtensor.tensor.shape.length;
  }
  get isSecondLastDim(): boolean {
    return this.index === this.gtensor.tensor.shape.length;
  }

  _rename<T extends string>(newName: T): GTensor<Exclude<G, D> | T> {
    // TODO: shouldn't TS be able to infer that typeod(this.name) extends G? It's specified in the
    // contrains for the class...?
    return this.gtensor.rename(this.name as never, newName) as GTensor<Exclude<G, D> | T>;
  }

  rename<T extends string>(newName: T): Dims<Exclude<G, D> | T> {
    return this._rename(newName).dim;
  }

  _unstack(): GTensor<Exclude<G, D>>[] {
    const tensors = tf.unstack(this.gtensor.tensor, this.index);
    const newDimNames = [...this.gtensor.dimNames] as Exclude<G, D>[];
    newDimNames.splice(this.index, 1);
    return tensors.map((t) => new GTensor<Exclude<G, D>>(t, newDimNames));
  }

  unstack(): Dims<Exclude<G, D>>[] {
    return this._unstack().map((g) => g.dim);
  }
  // pairwise_add(d2: Dimension): GTensor;
  // pairwise_mult(d2: Dimension): GTensor;
}

export type Dims<G extends string> = {
  [key in G]: Dimension<G, key>;
};

export class ValueError extends Error {}

// export function gtensorOfDims<G extends DName>(dims: Dims<G>): GTensor<G> {
//   return dims._gtensor;
// }

export function gtensorOfDims<G extends string>(dims: Dims<G>): GTensor<G> {
  // Technically, we don't know the dimension is G... but it doesn't matter, this makes TS happy.
  // In theory I think `unknown` should replace the second G.
  const d = Object.values(dims)[0] as Dimension<G, G>;
  if (!d) {
    throw new ValueError('gtensorOfDims: empty set of dimensions');
  }

  return d.gtensor;
}

//
export function stackGtensors<G extends string, NewD extends string>(
  newDimName: NewD,
  gtensors: GTensor<G>[]
): GTensor<G | NewD> {
  if (gtensors.length === 0) {
    throw new ValueError('stackDims was empty');
  }
  const tensors = gtensors.map((g) => g.tensor);
  const newTensor = tf.stack(tensors);
  const newDimNames = [newDimName, ...gtensors[0].dimNames];
  return new GTensor(newTensor, newDimNames);
}
export function stack<G extends string, NewD extends string>(
  newDimName: NewD,
  stackDims: Dims<G>[]
): Dims<G | NewD> {
  const gtensors = stackDims.map(gtensorOfDims);
  return stackGtensors(newDimName, gtensors).dim;
}

export type SerializedGTensor<G extends DName> = {
  // Used so that when walking a jstree one can identify a distinguish a
  // SerializedGTensor from named sub-parts of the tree of GTensors...
  __kind__: 'SerializedGTensor';
  buffer: Uint8Array;
  shape: number[];
  dimNames: G[];
  dtype: keyof tf.DataTypeMap;
  // shape: { [key in G]: number };
};

// const SCALAR_DIM_NAME = '#scalar';

// TODO: file feature request for TS for this...
// function isScalar<G extends DName>(g: GTensor<G>): g is GTensor<'#scalar'> {
//   return g.isScalar;
// }

export class GTensor<G extends DName> {
  // TODO: the type-system fails here because we can't force dim to always have all the keys of T,
  // and for the key-name to match the Dimension<T>.
  //
  // The dimensions in the GTensor.
  dim!: Dims<G>;
  tensor: tf.Tensor;
  dimNames: G[];

  get isScalar(): boolean {
    return this.dimNames.length === 0;
  }

  constructor(tensor: tf.Tensor, dimNames: G[]) {
    this.tensor = tensor;
    this.dimNames = dimNames;
    this._resetDim();
  }

  static fromSerialised<G extends DName>(s: SerializedGTensor<G>): GTensor<G> {
    let specificBuffer: tf.DataTypeMap[keyof tf.DataTypeMap];
    switch (s.dtype) {
      case 'float32':
      case 'complex64':
        specificBuffer = new Float32Array(s.buffer);
        break;
      case 'int32':
        specificBuffer = new Int32Array(s.buffer);
        break;
      case 'bool':
        specificBuffer = new Uint8Array(s.buffer);
        break;
      case 'string':
      default:
        throw new Error('not yet supported');
      // const dec = new TextDecoder('utf-8');
      // specificBuffer = dec.decode(s.buffer);
      // break;
    }
    return new GTensor(tf.tensor(specificBuffer, s.shape, s.dtype), s.dimNames);
  }

  toSerialised(): SerializedGTensor<G> {
    return {
      __kind__: 'SerializedGTensor',
      buffer: new Uint8Array(this.tensor.bufferSync().values),
      shape: this.tensor.shape,
      dimNames: this.dimNames,
      dtype: this.tensor.dtype,
    };
  }

  public dispose(): void {
    this.tensor.dispose();
  }

  public gshape(): { [key in G]: number } {
    const gshape = {} as { [key in G]: number };
    for (let i = 0; i < this.dimNames.length; i++) {
      gshape[this.dimNames[i]] = this.tensor.shape[i];
    }
    return gshape;
  }

  // (re)Creates the convenience 'dim' structure for accessing the dimesions.
  _resetDim(): void {
    this.dim = {} as Dims<G>;
    for (let i = 0; i < this.dimNames.length; i++) {
      const iDim = new Dimension<G, G>({
        name: this.dimNames[i],
        index: i,
        size: this.tensor.shape[i],
        gtensor: this,
      });
      this.dim[iDim.name] = iDim;
    }
  }

  public transpose(): GTensor<G> {
    return new GTensor<G>(tf.transpose(this.tensor), this.dimNames.slice().reverse());
  }

  public transposeTo(newNameOrder: G[]): GTensor<G> {
    const perm = newNameOrder.map((n) => this.dim[n].index);
    return new GTensor<G>(tf.transpose(this.tensor, perm), newNameOrder);
  }

  public transposeLike(g2: GTensor<G>): GTensor<G> {
    const perm = g2.dimNames.map((n) => this.dim[n].index);
    return new GTensor<G>(tf.transpose(this.tensor, perm), g2.dimNames);
  }

  // Returns the dimension names & sizes in g2 that are not in this gtensor.
  public subtractDimsFrom<G2 extends DName>(g2: GTensor<G2>): Dimension<G2, G2>[] {
    const dimsToIgnore: Dimension<G2, G2>[] = [];
    const dimsToExpandBy: Dimension<G2, G2>[] = [];
    for (const g2d of Object.values(g2.dim) as Dimension<G2, G2>[]) {
      const g1d = this.dim[g2d.name as never as G] as Dimension<G, G>;
      if (!g1d) {
        dimsToExpandBy.push(g2d);
      } else if (g1d.size !== g2d.size) {
        throw new ValueError(
          `Mismatch on common dimension name ${String(g2d.name)}.` +
            `sizes: ${g2d.size} vs ${g1d.size}`
        );
      } else {
        dimsToIgnore.push(g2d);
      }
    }
    return dimsToExpandBy;
  }

  // Returns the dimension names & sizes in this that are not in g2
  public subtractDims<G2 extends DName>(g2: GTensor<G2>): Dimension<G, G>[] {
    return g2.subtractDimsFrom(this);
  }

  // Expands the gtensor to the combined shape of this and g2: any names in
  // g2 not in this get added (at the start, and in their shape from from g2).
  // This replicates this tensor's values for every extra dimension in g2.
  // Throws an error if there's a dimesion in g2 that has the saame name, but
  // not the same size as it's counter-part in g1.
  public broadcastToCombinedShape<G2 extends DName>(g2: GTensor<G2>): GTensor<G | G2> {
    if (this.isScalar) {
      throw new ValueError('A scalar cannot be broadcastToCombinedShape');
    }
    const dimsToExpandBy = this.subtractDimsFrom(g2);

    const bigTensor = tf.broadcastTo(
      this.tensor,
      dimsToExpandBy.map((d) => d.size).concat(this.tensor.shape)
    );

    const combinedNames: (G | G2)[] = dimsToExpandBy
      .map((d) => d.name as G | G2)
      .concat(this.dimNames);

    return new GTensor(bigTensor, combinedNames);
  }

  // Expands the gtensor to the combined shape of this and g2: any names in
  // g2 not in this get added (at the start, and in their shape from from g2).
  // This replicates this tensor's values for every extra dimension in g2.
  // Throws an error if there's a dimesion in g2 that has the saame name, but
  // not the same size as it's counter-part in g1.
  public broadcastTo<G2 extends DName>(newDimensions: Map<G2, number>): GTensor<G | G2> {
    const bigTensor = tf.broadcastTo(
      this.tensor,
      [...newDimensions.values()].concat(this.tensor.shape)
    );
    const combinedNames: (G | G2)[] = ([...newDimensions.keys()] as (G | G2)[]).concat(
      this.dimNames
    );
    return new GTensor(bigTensor, combinedNames);
  }

  // Rename a set of dimensions.
  public withNewNames<NewNames extends DName>(newNames: NewNames[]): GTensor<NewNames> {
    return new GTensor<NewNames>(this.tensor, newNames);
  }

  // Rename a set of dimensions.
  public renaming<ReplacedNames extends G, NewNames extends DName>(
    // TODO: update to using Map
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
    // renaming: { [Key in ReplacedNames]: NewNames }
    renaming: Map<ReplacedNames, NewNames>
    // from: { [fromKey in G extends T1 ? T1 : never]: 'from' },
    // to: { [toKey in T2]: 'to' },
  ): GTensor<Exclude<G, ReplacedNames> | NewNames> {
    const newDimNames = [...this.dimNames] as never as NewNames[];
    for (const [key, val] of renaming) {
      const index = this.dim[key].index;
      newDimNames[index] = val;
    }
    return new GTensor<Exclude<G, ReplacedNames> | NewNames>(this.tensor, newDimNames);
  }

  // Rename a single dimension.
  public rename<T1 extends G, T2 extends DName>(
    fromName: T1,
    toName: T2
    // from: { [fromKey in G extends T1 ? T1 : never]: 'from' },
    // to: { [toKey in T2]: 'to' },
  ): GTensor<Exclude<G, T1> | T2> {
    // const fromName = Object.keys(from)[0] as string; // T1;
    // const toName = Object.keys(to)[0] as ``;
    const i = this.dimNames.findIndex((n) => (n as DName) === fromName);
    if (i === undefined) {
      throw new ValueError(`${String(fromName)} is missing from ${this.dimNames}`);
    }
    const newDimNames = [...this.dimNames] as (Exclude<G, T1> | T2)[];
    newDimNames.splice(i, 1, toName);
    return new GTensor<Exclude<G, T1> | T2>(this.tensor, newDimNames);
  }

  public applyPointWiseTfFn(fn: (t: tf.Tensor) => tf.Tensor): GTensor<G> {
    return new GTensor(fn(this.tensor), this.dimNames);
  }

  public scalarMul(g: GTensor<never>): GTensor<G> {
    return new GTensor(tf.mul(g.tensor, this.tensor), this.dimNames);
  }
  public scalarAdd(g: GTensor<never>): GTensor<G> {
    return new GTensor(tf.add(g.tensor, this.tensor), this.dimNames);
  }
  public scalarSubFrom(g: GTensor<never>): GTensor<G> {
    return new GTensor(tf.sub(g.tensor, this.tensor), this.dimNames);
  }
  public scalarSub(g: GTensor<never>): GTensor<G> {
    return new GTensor(tf.sub(this.tensor, g.tensor), this.dimNames);
  }
  public scalarDivFrom(g: GTensor<never>): GTensor<G> {
    return new GTensor(tf.div(g.tensor, this.tensor), this.dimNames);
  }
  public scalarDiv(g: GTensor<never>): GTensor<G> {
    return new GTensor(tf.div(this.tensor, g.tensor), this.dimNames);
  }

  // TODO: Deprecate/remove
  public _tfScalarMul(s: tf.Scalar): GTensor<G> {
    return new GTensor(tf.mul(s, this.tensor), this.dimNames);
  }
  public _tfScalarAdd(s: tf.Scalar): GTensor<G> {
    return new GTensor(tf.add(s, this.tensor), this.dimNames);
  }
  public _tfScalarSubFrom(s: tf.Scalar): GTensor<G> {
    return new GTensor(tf.sub(s, this.tensor), this.dimNames);
  }
  public _tfScalarSub(s: tf.Scalar): GTensor<G> {
    return new GTensor(tf.sub(this.tensor, s), this.dimNames);
  }
  public _tfScalarDivFrom(s: tf.Scalar): GTensor<G> {
    return new GTensor(tf.div(s, this.tensor), this.dimNames);
  }
  public _tfScalarDiv(s: tf.Scalar): GTensor<G> {
    return new GTensor(tf.div(this.tensor, s), this.dimNames);
  }

  /* Absolute value */
  public squared(): GTensor<G> {
    return new GTensor(tf.square(this.tensor), this.dimNames);
  }

  /* Absolute value */
  public sqrt(): GTensor<G> {
    return new GTensor(tf.sqrt(this.tensor), this.dimNames);
  }

  /* Absolute value */
  public abs(): GTensor<G> {
    return new GTensor(tf.abs(this.tensor), this.dimNames);
  }

  /* copy with zero values */
  public zero(): GTensor<G> {
    return new GTensor(tf.zeros(this.tensor.shape), this.dimNames);
  }

  /* copy with unit values (1) */
  public one(): GTensor<G> {
    return new GTensor(tf.ones(this.tensor.shape), this.dimNames);
  }

  // Note: this does make sense even when G and G2 are distinct.
  // each value of each matrix is multiplied by each other.
  public pointwiseMul<G2 extends DName>(g2: GTensor<G2>): GTensor<G | G2> {
    if (this.isScalar) {
      return new GTensor(tf.mul(this.tensor, g2.tensor), g2.dimNames) as GTensor<G | G2>;
    } else if (g2.isScalar) {
      return new GTensor(tf.mul(this.tensor, g2.tensor), this.dimNames) as GTensor<G | G2>;
    }
    // TODO: runtime check intersection of dim names?
    const g2big = g2.broadcastToCombinedShape(this);
    const g1big = this.broadcastToCombinedShape(g2);
    const g1bigLikeG2 = g1big.transposeLike(g2big);
    return new GTensor(tf.mul(g1bigLikeG2.tensor, g2big.tensor), g1bigLikeG2.dimNames);
  }

  public pointwiseDiv<G2 extends DName>(g2: GTensor<G2>): GTensor<G | G2> {
    if (this.isScalar) {
      return new GTensor(tf.div(this.tensor, g2.tensor), g2.dimNames) as GTensor<G | G2>;
    } else if (g2.isScalar) {
      return new GTensor(tf.div(this.tensor, g2.tensor), this.dimNames) as GTensor<G | G2>;
    }
    const g2big = g2.broadcastToCombinedShape(this);
    const g1big = this.broadcastToCombinedShape(g2);
    const g1bigLikeG2 = g1big.transposeLike(g2big);
    return new GTensor(tf.div(g1bigLikeG2.tensor, g2big.tensor), g1bigLikeG2.dimNames);
  }

  public pointwiseAdd<G2 extends DName>(g2: GTensor<G2>): GTensor<G | G2> {
    if (this.isScalar) {
      return new GTensor(tf.add(this.tensor, g2.tensor), g2.dimNames) as GTensor<G | G2>;
    } else if (g2.isScalar) {
      return new GTensor(tf.add(this.tensor, g2.tensor), this.dimNames) as GTensor<G | G2>;
    }
    const g2big = g2.broadcastToCombinedShape(this);
    const g1big = this.broadcastToCombinedShape(g2);
    const g1bigLikeG2 = g1big.transposeLike(g2big);
    return new GTensor(tf.add(g1bigLikeG2.tensor, g2big.tensor), g1bigLikeG2.dimNames);
  }

  // TODO: consider having a base set of things saved e.g. tf.scalar(-1)
  public pointwiseSub<G2 extends DName>(g2: GTensor<G2>): GTensor<G | G2> {
    return this.pointwiseAdd(g2._tfScalarMul(tf.scalar(-1)));
  }

  public softmax<D extends G>(n: D): GTensor<G> {
    let newTensor = this.tensor;
    const newDimNames = [...this.dimNames];
    // TODO: remove once tfjs supports softmax on non-last indexes. Until then,
    // we need to permute the tensor to put the softmax dim at the end.
    if (this.dimNames.length - 1 !== this.dim[n].index) {
      const transposition = [
        ...range(0, this.dim[n].index),
        ...range(this.dim[n].index + 1, this.dimNames.length),
        this.dim[n].index,
      ];
      newTensor = tf.transpose(this.tensor, transposition);
      newDimNames.splice(this.dim[n].index, 1);
      newDimNames.push(n);
    }
    // Note default is that softmax works on last dim, i.e.
    // this.dimNames.length - 1
    return new GTensor(tf.softmax(newTensor), newDimNames);
  }

  public log(): GTensor<G> {
    return new GTensor(tf.log(this.tensor), this.dimNames);
  }

  public logSoftmax<D extends G>(n: D): GTensor<G> {
    return new GTensor(tf.logSoftmax(this.tensor, this.dim[n].index), this.dimNames);
  }

  public unstack<D extends G>(n: D): GTensor<Exclude<G, D>>[] {
    const unstacked = this.tensor.unstack(this.dim[n].index);
    const newNames = [...this.dimNames] as Exclude<G, D>[];
    newNames.splice(this.dim[n].index, 1);
    return unstacked.map((t) => new GTensor(t, newNames));
  }

  // Note: this will expand to have all distinct names from both datasets,
  // effectvely broadcasting to grow sizes to unique names of both.
  // And no broadcasting is done for common names.
  public squaredDifference<G2 extends DName>(g2: GTensor<G2>): GTensor<G | G2> {
    if (this.isScalar) {
      new GTensor(tf.squaredDifference(this.tensor, g2.tensor), g2.dimNames);
    } else if (g2.isScalar) {
      new GTensor(tf.squaredDifference(this.tensor, g2.tensor), this.dimNames);
    }
    const g2big = g2.broadcastToCombinedShape(this);
    const g1big = this.broadcastToCombinedShape(g2);
    const g1bigLikeG2 = g1big.transposeLike(g2big);
    return new GTensor(
      tf.squaredDifference(g1bigLikeG2.tensor, g2big.tensor),
      g1bigLikeG2.dimNames
    );
  }

  public sumOverDims<D extends G>(dims: D[]): GTensor<Exclude<G, D>> {
    const dimIndexes = dims.map((d) => this.dim[d].index);
    return new GTensor(
      tf.sum(this.tensor, dimIndexes),
      this.dimNames.filter((d) => !dims.includes(d as D)) as Exclude<G, D>[]
    );
  }

  public prodOverDims<D extends G>(dims: D[]): GTensor<Exclude<G, D>> {
    const dimIndexes = dims.map((d) => this.dim[d].index);
    return new GTensor(
      tf.prod(this.tensor, dimIndexes),
      this.dimNames.filter((d) => !dims.includes(d as D)) as Exclude<G, D>[]
    );
  }

  // public argMax<D extends G>(d: D): GTensor<Exclude<G, D>> {
  //   const dimNames = [...this.dimNames];
  //   dimNames.splice(this.dim[d].index, 1);
  //   return new GTensor(
  //     tf.argMax(this.tensor, this.dim[d].index),
  //     dimNames as (Exclude<G, D>)[]);
  // }

  // public sumDims<D extends G>(
  //   dims: D[],
  // ): GTensor<Exclude<G, D>> {
  //   const FIRST_CHAR_CODE_FOR_d1 = 'A'.charCodeAt(0);
  //   const beforeCharDims = [];
  //   const afterCharDims = []
  //   const afterDimNames = []
  //   for (let i = 0; i < this.dimNames.length; i++) {
  //     const dimAsChar = String.fromCharCode(FIRST_CHAR_CODE_FOR_d1 + i);
  //     beforeCharDims.push(dimAsChar);
  //     if (!(dims as string[]).includes(this.dimNames[i] as string)) {
  //       afterCharDims.push(dimAsChar);
  //       afterDimNames.push(this.dimNames[i]);
  //     }
  //   }
  //   const einsumStr = `${beforeCharDims.join('')}->${afterCharDims.join('')}`;
  //   const resultTensor = tf.einsum(einsumStr, this.tensor);
  //   return new GTensor(resultTensor, afterDimNames as (Exclude<G, D>)[]);
  // }

  // TODO: make sure D2 not already in using: G. DisjointDimensions<D2,G>
  // { [key in D2]: number }
  public splitDim<D extends G, D2 extends DName>(
    d: D,
    newDims: { [key in D2]: number }
  ): GTensor<Exclude<G, D> | D2> {
    const newDimsMap = new Map<D2, number>(Object.entries(newDims) as [D2, number][]);
    const oldShape = this.tensor.shape;
    const newSizes = [];
    const addedDimNames: D2[] = [];
    let totalNewSize = 1;
    for (const [d2, d2Size] of newDimsMap) {
      totalNewSize = totalNewSize * d2Size;
      newSizes.push(d2Size);
      addedDimNames.push(d2);
    }
    if (totalNewSize !== this.dim[d].size) {
      throw new ValueError('splitDim: new shape size !== removed shape size');
    }
    const newShape = [...oldShape];
    newShape.splice(this.dim[d].index, 1, ...newSizes);
    const newDimNames = [...this.dimNames] as (Exclude<G, D> | D2)[];
    newDimNames.splice(this.dim[d].index, 1, ...addedDimNames);
    return new GTensor(this.tensor.reshape(newShape), newDimNames);
  }

  public mergeDims<D extends G, D2 extends DName>(
    ds: D[],
    newDimName: DisjointDimensions<D2, G>
  ): GTensor<Exclude<G, D> | D2> {
    const newShape: number[] = [];
    const newNames: (Exclude<G, D> | D2)[] = [];
    let newDimSize = 1;
    let newDimIndex: number | null = null;
    for (const d of this.dimNames) {
      if (ds.includes(d as never)) {
        newDimSize *= this.dim[d].size;
        if (newDimIndex === null) {
          newDimIndex = this.dim[d].index;
        }
      } else {
        newNames.push(d as never as Exclude<G, D> | D2);
        newShape.push(this.dim[d].size);
      }
    }
    newShape.splice(newDimIndex as number, 0, newDimSize);
    newNames.splice(newDimIndex as number, 0, newDimName as D2);
    return new GTensor(this.tensor.reshape(newShape), newNames);
  }

  public contract<G2 extends DName, D extends G2 & G>(
    g2: GTensor<G2>,
    dimNames: D[]
  ): GTensor<Exclude<G | G2, D>> {
    for (const d of dimNames) {
      if (g2.dim[d].size !== this.dim[d].size) {
        throw new Error(
          `contract dim name sizes must match for '${d}', ` +
            `but they were: ${this.dim[d].size} and ${g2.dim[d].size}`
        );
      }
    }
    // TODO: allow inline renaming, where pairs are given of our name, and
    // their name.
    const spec = new ContractSpec(this.dimNames, g2.dimNames, dimNames);
    const resultTensor = contract(this.tensor, g2.tensor, spec);
    return new GTensor(resultTensor, spec.resultNames);
  }

  public argMax<D extends G>(dim: D): GTensor<Exclude<G, D>> {
    return new GTensor(
      tf.argMax(this.tensor, this.dim[dim].index),
      this.dimNames.filter((n) => n != dim) as Exclude<G, D>[]
    );
  }

  public pointwiseEqual(g2: GTensor<G>): GTensor<G> {
    return new GTensor<G>(this.tensor.equal(g2.tensor), this.dimNames);
  }

  // TODO: support batched gather.
  public gather<D extends G, G2 extends DName>(
    indexes: GTensor<G2>,
    dim: D
    // batchDimName?: G & G2,
  ): GTensor<Exclude<G, D> | G2> {
    // // batchDims.map(d => this.dim[d].index)

    // const commonDims = indexes.dimNames.filter(
    //   n => this.dimNames.includes(n as never as G));

    // const batchPreparedIndexes = (commonDims.length === 1) ? indexes :
    //   indexes.mergeDims(commonDims, '_mergedBatchDimName' as never);
    // let batchDimName = '_mergedBatchDimName';
    // if (commonDims.length !== 1) {
    //   batchDimName = commonDims[0];
    // }

    const replacedIndex = this.dim[dim].index;
    const newDimNames = [
      ...(replacedIndex === 0 ? [] : this.dimNames.slice(0, replacedIndex)),
      // ...(batchDimName ? [batchDimName] : []),
      ...indexes.dimNames,
      ...this.dimNames.slice(replacedIndex + 1),
    ] as never as (Exclude<G, D> | G2)[];

    const gathered = tf.gather(
      this.tensor,
      indexes.tensor,
      replacedIndex
      // batchDimName ? indexes.dim[batchDimName].index : undefined
    );
    return new GTensor<Exclude<G, D> | G2>(gathered, newDimNames);
  }

  public triangularMask(dim1 : G, dim2: G, upperTriangleConst: number): GTensor<G> {
  /* Applies a triangular mask to the provided GTensor
  the values of the upper triangle are set 'upper_triangle_const'

  Parameters:
  - dim1: First dimension of the triangular mask matrix (Should exist in the GTensor)
  - dim2: First dimension of the triangular mask matrix (Should exist in the GTensor)
  - upper_triangle_const = constant to fill the upper triangle of the matrix

  Note: Tensor will be broadcasted over additional dimension i.e. heads, batch.
  */

    let size = this.dim[dim1].size
    let size2 = this.dim[dim2].size

    if (size !== size2){
      throw new Error(
        `Can't generate lower triangular mask for non square tensor `
      );
    }

    // Create a range tensor for row indices
    const rowIndices = tf.range(0, size, 1, 'int32');
    // Create a range tensor for column indices and expand dimensions
    const colIndices = tf.range(0, size, 1, 'int32').expandDims(1);
    // Compare row and column indices to generate a boolean mask
    const mask = tf.greater(rowIndices, colIndices);
    // Apply mask and broadcast
    const maskBroadcasted = new GTensor(mask, [dim1, dim2]).broadcastToCombinedShape(this)
    const maskedM = tf.where(maskBroadcasted.tensor.reshape(this.tensor.shape), tf.scalar(upperTriangleConst).broadcastTo(this.tensor.shape), this.tensor);
    return new GTensor(maskedM, this.dimNames);
  }

}


export class GVariable<G extends DName> extends GTensor<G> {
  variable: tf.Variable;

  constructor(t: GTensor<G> | GTensor<never>, trainable = true, name?: string) {
    // tf.variable() on a disposed Tensor causes stack overflow, which isn't
    // easy to debug.
    t.tensor.throwIfDisposed();
    super(tf.variable(t.tensor, trainable, name), t.dimNames);
    this.variable = this.tensor as tf.Variable;
  }

  assign(t: GTensor<G> | GTensor<never>): void {
    this.variable.assign(t.tensor);
  }
}

export interface InitializerConfig {
  // Only one of these should be specified.
  tuncNormal?: tf_init.TruncatedNormalArgs;
  zeros?: {};
  ones?: {};
  constant?: tf_init.ConstantArgs;
}

export function makeInitializer(config: InitializerConfig): tf_init.Initializer {
  if (config.tuncNormal) {
    return tf.initializers.truncatedNormal(config.tuncNormal);
  } else if (config.zeros) {
    return tf.initializers.zeros();
  } else if (config.ones) {
    return tf.initializers.ones();
  } else if (config.constant) {
    return tf.initializers.constant(config.constant);
  }

  throw new ValueError('need to specify an initalizer config');
}

export function fromInitializer<T extends string>(
  dims: { [key in T]: number },
  initialiser: tf_init.Initializer,
  dtype?: tf.DataType
): GTensor<T> {
  const dimNames = Object.keys(dims) as T[];
  const shape = dimNames.map((n: T) => dims[n]);
  return new GTensor(initialiser.apply(shape, dtype), dimNames);
}

export function makeTruncNormal<T extends string>(
  dims: { [key in T]: number },
  truncNormalConfig?: tf_init.TruncatedNormalArgs,
  dtype?: tf.DataType
): GTensor<T> {
  // TODO: Pass initWeight_stddev through instead of using globals
  return fromInitializer(
    dims,
    tf.initializers.truncatedNormal(
      truncNormalConfig || {
        stddev: 0.05, // window.__globalConfig?.initWeight_stddev || .05,
        mean: 0,
      }
    ),
    dtype
  );
}

export function makeZeros<T extends string>(
  dims: { [key in T]: number },
  dtype: tf.DataType = 'float32'
): GTensor<T> {
  return fromInitializer(dims, tf.initializers.zeros(), dtype);
}

export function identity<T extends string>(
  spec: { dimNames: [T, T]; size: number },
  identityArgs?: tf_init.IdentityArgs,
  dtype?: tf.DataType
): GTensor<T> {
  const dims: { [key in T]: number } = {} as { [key in T]: number };
  dims[spec.dimNames[0]] = spec.size;
  dims[spec.dimNames[1]] = spec.size;
  if (!identityArgs) {
    identityArgs = {};
  }
  return fromInitializer(dims, tf.initializers.identity(identityArgs), dtype);
}

export function makeOnes<T extends string>(
  dims: { [key in T]: number },
  dtype: tf.DataType = 'float32'
): GTensor<T> {
  return fromInitializer(dims, tf.initializers.ones(), dtype);
}

export function makeConstant<T extends string>(
  dims: { [key in T]: number },
  constant: number,
  dtype: tf.DataType = 'float32'
): GTensor<T> {
  return fromInitializer(dims, tf.initializers.constant({ value: constant }), dtype);
}

export function makeRange<T extends DName>(
  dname: T,
  start: number,
  end: number,
  step: number,
  dtype: 'float32' | 'int32' = 'float32'
): GTensor<T> {
  return new GTensor<T>(tf.range(start, end, step, dtype), [dname]);
}

export function makeScalar(
  n: number,
  dtype: 'float32' | 'int32' | 'bool' | 'complex64' | 'string' = 'float32'
): GTensor<never> {
  return new GTensor(tf.scalar(n, dtype), []);
}

export const one = makeScalar(1);
export const zero = makeScalar(0);
