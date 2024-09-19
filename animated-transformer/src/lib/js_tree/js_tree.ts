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

/** JsTree: functions for working on raw JS object trees.
 *
 * Represent JS Objects that can have individual leaves, leaves that are lists
 * of some object type, as well as string-keyed JS dictionary objects, or lists
 * of JS dictionary objects.
 */

/** DictArrTree and DictTree.
 *
 * Raw JS objects that are either dictionaries, arrays, of trees of these with a
 * unique type that captures the leaves.
 *
 * e.g. as used to represent parameters structures for GTensors.
 *
 * Note: does not support mixing of tree nodes and leaf nodes in arrays. Also
 * does not allow multi-dimensional lists of nodes. Not allowing these is easier
 * to understand, and makes code simpler too. Also, such structures are easy for
 * people to get confused about.
 */
export type DictArrTree<LeafT> = LeafT | LeafT[] | DictTree<LeafT> | DictTree<LeafT>[];
export type DictTree<LeafT> = {
  [key: string]: DictArrTree<LeafT>;
};

export type LeafSubst<Leaf, Leaf2, T> = T extends (infer SubT)[]
  ? LeafSubst<Leaf, Leaf2, SubT>[]
  : T extends Leaf
  ? Leaf2
  : T extends DictTree<Leaf>
  ? { [key in keyof T]: LeafSubst<Leaf, Leaf2, T[key]> }
  : never;

type Foo = { a: string; b: string[]; c: { d: string }[] };
type Foo2 = LeafSubst<string, number, Foo>;

export type LeafOf<T> = T extends DictArrTree<infer LeafT> ? LeafT : never;

export interface SomeClass<T> extends Function {
  new (...args: any[]): T;
}

export function isSomeClass<T>(x: any): x is SomeClass<T> {
  return (
    typeof x === 'number' ||
    typeof x === 'string' ||
    typeof x === 'boolean' ||
    '__kind__' in x || // we use this for specific tree shaped leaf types.
    (x.constructor.name !== 'Array' && x.constructor.name !== 'Object')
  );
}

/** JsTree library...
 *
 * Encapsulates abstract functions for a kind of DictArrTree, based on an
 * isLeaf function that identifies if an object is a leaf type.
 */
// TODO: provide a sort keys recursively function, to maintain a cached sorted
// version of a shape.

// TODO: make an unsorted, faster version
export function* iter<Leaf>(
  t: DictArrTree<Leaf>
): Generator<Leaf, undefined, undefined> & Iterable<Leaf> {
  if (isSomeClass(t)) {
    yield t;
  } else if (t instanceof Array && t.length > 0 && isSomeClass(t[0])) {
    for (const el of t) {
      yield el as Leaf;
    }
  } else {
    // t: ParamsDict<T> | ParamsDict<T>[]
    const node = t as DictTree<Leaf> | DictTree<Leaf>[];
    if (node instanceof Array) {
      for (const el of node) {
        for (const subel of iter(el)) {
          yield subel as Leaf;
        }
      }
    } else {
      for (const k of Object.keys(node).sort()) {
        for (const subel of iter(node[k])) {
          // Treat { x =
          // if (subel !== undefined) {
          yield subel as Leaf;
          // }
        }
      }
    }
  }
  return;
}

export function forEach<Leaf>(fn: (el: Leaf, i: number) => void, t: DictArrTree<Leaf>): void {
  let i = 0;
  for (const el of iter(t)) {
    fn(el, i++);
  }
}

// Assumes they have the same shape.
export function forEachZip<Leaf1, Leaf2>(
  fn: (l1: Leaf1, l2: Leaf2, i: number) => void,
  t1: DictArrTree<Leaf1>,
  t2: DictArrTree<Leaf2>
): void {
  let i = 0;
  const iter1 = iter(t1);
  const iter2 = iter(t2);
  let el1 = iter1.next();
  let el2 = iter2.next();
  while (el1.value && el2.value) {
    fn(el1.value, el2.value, i++);
    el1 = iter1.next();
    el2 = iter2.next();
  }
}

// map<T extends DictArrTree<LeafT>>(t: T, fn: (l: LeafT, i: number) => T): T {
//   let i = 0;
//   function mapWithIndex(l: LeafT): T {
//     return fn(l, i++);
//   }
//   return this.mapTree(t, mapWithIndex);
// }

// Note: you might be tempted to try... export function `map<Leaf1, Leaf2, T
// extends DictArrTree<Leaf1>>` and have a return type of `LeafSubst<Leaf1,
// Leaf2, T>`, but not that won't work for any parameterised types. e.g.
// GTensor<'rep'> ==> GVariable<'rep'> is not expressible because you cannot
// bind type params in the LeafSubst call.
export function map<Leaf1, Leaf2>(
  t: DictArrTree<Leaf1>,
  fn: (l: Leaf1, i: number) => Leaf2
): DictArrTree<Leaf2> {
  let i = 0;
  function mapWithIndex(l: Leaf1): Leaf2 {
    return fn(l, i++);
  }
  return mapTree(t, mapWithIndex);
}

export function copy<T extends DictArrTree<any>>(t: T): T {
  return map(t, (l) => l) as T;
}

export function mapTree<Leaf1, Leaf2>(
  t: DictArrTree<Leaf1>,
  fn: (l: Leaf1) => Leaf2
): DictArrTree<Leaf2> {
  if (isSomeClass(t)) {
    return fn(t);
  } else if (t instanceof Array && t.length > 0 && isSomeClass(t[0])) {
    return (t as Leaf1[]).map((e) => fn(e));
  } else {
    const node = t as DictTree<Leaf1> | DictTree<Leaf1>[];
    if (node instanceof Array) {
      return node.map((el) => mapDict(el, fn));
    } else {
      return mapDict(node, fn);
    }
  }
}

export function mapDict<Leaf1, Leaf2>(
  d: DictTree<Leaf1>,
  fn: (l: Leaf1) => Leaf2
): DictTree<Leaf2> {
  const mappedTree = {} as DictTree<Leaf2>;
  Object.keys(d)
    .sort()
    .forEach((k) => {
      // if (mappedTree[k] !== undefined) {
      mappedTree[k] = mapTree(d[k], fn);
      // }
    });
  return mappedTree;
}

export function reduce<Leaf, Result>(
  fn: (prev: Result, cur: Leaf, index: number) => Result,
  initialValue: Result,
  t: DictArrTree<Leaf>
): Result {
  // TODO: maybe speed up with a more iter-native def...
  return flatten(t).reduce(fn, initialValue);
}

export function nullify(t: DictArrTree<any>): DictArrTree<null> {
  return map(t, (l) => null);
}

export function flatten<Leaf>(p: DictArrTree<Leaf>): Leaf[] {
  return [...iter(p)];
  // const l = [];
  // for (const el of this.iter(p)) {
  //   l.push(el);
  // }
  // return l;
}

// We use `T extends DictArrTree` here so that the original type can be preserved
// for the return value.
export function unflatten<T extends DictArrTree<any>>(shapeTree: T, list: LeafOf<T>[]): T {
  return map(shapeTree, (_, i) => list[i]) as T;
}

// Idea: can/should we initialize with a shape? / example instance.
// This assumes no optional fields.
export function copyFromFlattened<Leaf, T extends DictArrTree<Leaf>>(original: T, list: Leaf[]): T {
  return map(original, (_, i) => list[i]) as T;
}

// -----------------------------------------------------------------------------
// Earlier less beautiful way to do this, but sometimes useful: make a specific
// isLeaf function and then you need to wrap the tools into a class...
// -----------------------------------------------------------------------------
/** JsTree class.
 *
 * Encapsulates abstract functions for a kind of DictArrTree, based on an
 * isLeaf function that identifies if an object is a leaf type.
 */
export class JsTreeLib<LeafT> {
  constructor(public isLeaf: (t: any) => t is LeafT) {}

  // TODO: provide a sort keys recursively function, to maintain a cached sorted
  // version of a shape.

  // TODO: make an unsorted, faster version
  *iter<T extends LeafT>(t: DictArrTree<LeafT>): Generator<T, undefined, undefined> {
    if (this.isLeaf(t)) {
      yield t as T;
    } else if (t instanceof Array && t.length > 0 && this.isLeaf(t[0])) {
      for (const el of t) {
        yield el as T;
      }
    } else {
      // t: ParamsDict<T> | ParamsDict<T>[]
      const node = t as DictTree<LeafT> | DictTree<LeafT>[];
      if (node instanceof Array) {
        for (const el of node) {
          for (const subel of this.iter(el)) {
            yield subel as T;
          }
        }
      } else {
        for (const k of Object.keys(node).sort()) {
          for (const subel of this.iter(node[k])) {
            // Treat { x =
            // if (subel !== undefined) {
            yield subel as T;
            // }
          }
        }
      }
    }
    return;
  }

  forEach(fn: (el: LeafT, i: number) => void, t: DictArrTree<LeafT>): void {
    let i = 0;
    for (const el of this.iter(t)) {
      fn(el, i++);
    }
  }

  // Assumes they have the same shape.
  forEachZip<L1 extends LeafT, L2 extends LeafT>(
    fn: (l1: L1, l2: L2, i: number) => void,
    t1: DictArrTree<L1>,
    t2: DictArrTree<L2>
  ): void {
    let i = 0;
    const iter1 = this.iter<L1>(t1);
    const iter2 = this.iter<L2>(t2);
    let el1 = iter1.next();
    let el2 = iter2.next();
    while (el1.value && el2.value) {
      fn(el1.value, el2.value, i++);
      el1 = iter1.next();
      el2 = iter2.next();
    }
  }

  // map<T extends DictArrTree<LeafT>>(t: T, fn: (l: LeafT, i: number) => T): T {
  //   let i = 0;
  //   function mapWithIndex(l: LeafT): T {
  //     return fn(l, i++);
  //   }
  //   return this.mapTree(t, mapWithIndex);
  // }

  map<T, TreeKind extends DictArrTree<LeafT>>(
    t: TreeKind,
    fn: (l: LeafT, i: number) => T
  ): DictArrTree<T> {
    let i = 0;
    function mapWithIndex(l: LeafT): T {
      return fn(l, i++);
    }
    return this.mapTree(t, mapWithIndex);
  }

  copy<T>(t: DictArrTree<LeafT>): DictArrTree<LeafT> {
    return this.map(t, (l, i) => l);
  }

  mapTree<T>(t: DictArrTree<LeafT>, fn: (l: LeafT) => T): DictArrTree<T> {
    if (this.isLeaf(t)) {
      return fn(t);
    } else if (t instanceof Array && t.length > 0 && this.isLeaf(t[0])) {
      return (t as LeafT[]).map((e) => fn(e as LeafT));
    } else {
      const node = t as DictTree<LeafT> | DictTree<LeafT>[];
      if (node instanceof Array) {
        return node.map((el) => this.mapDict(el, fn));
      } else {
        return this.mapDict(node, fn);
      }
    }
  }
  mapDict<T>(d: DictTree<LeafT>, fn: (l: LeafT) => T): DictTree<T> {
    const mappedTree = {} as DictTree<T>;
    Object.keys(d)
      .sort()
      .forEach((k) => {
        // if (mappedTree[k] !== undefined) {
        mappedTree[k] = this.mapTree(d[k], fn);
        // }
      });
    return mappedTree;
  }

  reduce<T>(
    fn: (prev: T, cur: LeafT, index: number) => T,
    initialValue: T,
    t: DictArrTree<LeafT>
  ): T {
    // TODO: maybe speed up with a more iter-native def...
    return this.flatten(t).reduce(fn, initialValue);
  }

  nullify(t: DictArrTree<LeafT>): DictArrTree<null> {
    return this.map(t, (l) => null);
  }

  flatten<P extends DictArrTree<LeafT>>(p: P): LeafT[] {
    return [...this.iter(p)];
    // const l = [];
    // for (const el of this.iter(p)) {
    //   l.push(el);
    // }
    // return l;
  }

  unflatten<P extends DictArrTree<LeafT>>(shapeTree: P, list: LeafT[]): P {
    return this.map(shapeTree, (_, i) => list[i]) as P;
  }
}

// -----------------------------------
// ObjT is a type that defines the shape of the tree, (and is assumed to have
// LeafT leaf-nodes).
//
// CONSIDER: could the consturtcor input be forced to be safe? And/or would
// it benefit from a special factory function?
export class JsTree<LeafT, ObjT> {
  obj: ObjT;
  tree: DictArrTree<LeafT>;
  treeAndObj: DictArrTree<LeafT> & ObjT;
  list: LeafT[];

  constructor(public lib: JsTreeLib<LeafT>, objTree: ObjT) {
    this.obj = objTree;
    this.tree = objTree as DictArrTree<LeafT>;
    this.treeAndObj = objTree as DictArrTree<LeafT> & ObjT;
    this.list = [...this.lib.iter(this.tree)];
  }

  iter<T extends LeafT>(): Generator<T, undefined, undefined> {
    return this.lib.iter(this.tree);
  }

  forEach(fn: (el: LeafT, i: number) => void): void {
    this.lib.forEach(fn, this.tree);
  }

  // Assumes they have the same shape.
  forEachZip<Leaf2 extends LeafT>(
    fn: (l1: LeafT, l2: Leaf2, i: number) => void,
    t2: JsTree<Leaf2, DictArrTree<Leaf2>>
  ): void {
    this.lib.forEachZip(fn, this.tree, t2.tree);
  }

  // map<T extends DictArrTree<LeafT>>(t: T, fn: (l: LeafT, i: number) => T): T {
  //   let i = 0;
  //   function mapWithIndex(l: LeafT): T {
  //     return fn(l, i++);
  //   }
  //   return this.mapTree(t, mapWithIndex);
  // }
  map<Leaf2 extends LeafT>(fn: (l: LeafT, i: number) => Leaf2): JsTree<Leaf2, DictArrTree<Leaf2>> {
    const newObjTree = this.lib.map(this.tree, fn);
    return new JsTree<Leaf2, DictArrTree<Leaf2>>(
      this.lib as JsTreeLib<Leaf2>,
      newObjTree as ObjT & DictArrTree<Leaf2>
    );
  }

  copy(): JsTree<LeafT, ObjT> {
    return this.map((l, i) => l) as JsTree<LeafT, ObjT>;
  }

  reduce<T>(fn: (prev: T, cur: LeafT, index: number) => T, initialValue: T): T {
    return this.lib.reduce(fn, initialValue, this.tree);
  }

  flatten(): LeafT[] {
    return this.lib.flatten(this.tree);
  }

  // Idea: can/should we initialize with a shape? / example instance.
  // This assumes no optional fields.
  copyFromFlattened(list: LeafT[]): JsTree<LeafT, ObjT> {
    const unflattened = this.lib.map(this.tree, (_, i) => list[i]);
    return new JsTree(this.lib, unflattened as ObjT);
  }
}

// export function isSimpleLeaf(x: unknown): x is number | string | boolean {
//   return (
//     typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean'
//   );
// }
// export const SimpleJsTreesLib = new JsTreeLib(isSimpleLeaf);

// export interface SomeClass<T> extends Function {
//   new (...args: any[]): T;
// }

// export const jsTreeLib = new JsTreeLib<SomeClass<any>>(isSomeClass);
