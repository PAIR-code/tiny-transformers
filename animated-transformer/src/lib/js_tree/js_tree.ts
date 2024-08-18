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
export type DictArrTree<LeafT> =
  | LeafT
  | LeafT[]
  | DictTree<LeafT>
  | DictTree<LeafT>[];
export type DictTree<LeafT> = {
  [key: string]: DictArrTree<LeafT>;
};

/** JsTree class.
 *
 * Encapsulates abstract functions for a kind of DictArrTree, based on an
 * isLeaf function that identifies if an object is a leaf type.
 */
export class JsTreeLib<LeafT> {
  constructor(public isLeaf: (t: unknown) => t is LeafT) {}

  // TODO: provide a sort keys recursively function, to maintain a cached sorted
  // version of a shape.

  // TODO: make an unsorted, faster version
  *iter<T extends LeafT>(
    t: DictArrTree<LeafT>
  ): Generator<T, undefined, undefined> {
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

export function isSimpleLeaf(x: unknown): x is number | string | boolean {
  return (
    typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean'
  );
}
export const SimpleJsTreesLib = new JsTreeLib(isSimpleLeaf);

// ObjT is a type that defines the shape of the tree, (and is assumed to have
// LeafT leaf-nodes).
export class JsTree<LeafT, ObjT extends DictArrTree<LeafT>> {
  obj: ObjT;
  tree: DictArrTree<LeafT>;
  treeAndObj: DictArrTree<LeafT> & ObjT;
  list: LeafT[];

  constructor(
    public lib: JsTreeLib<LeafT>,
    public objTree: DictArrTree<LeafT> & ObjT
  ) {
    this.obj = objTree;
    this.tree = objTree;
    this.treeAndObj = objTree;
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
  map<Leaf2 extends LeafT>(
    fn: (l: LeafT, i: number) => Leaf2
  ): JsTree<Leaf2, DictArrTree<Leaf2>> {
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
    const unflattened = this.lib.map(this.tree, (_, i) => list[i]) as ObjT;
    return new JsTree(this.lib, unflattened);
  }
}
