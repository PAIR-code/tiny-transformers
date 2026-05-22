# JsTree Library

`js_tree` provides functional utility operators for working recursively with raw JavaScript object trees. 

In machine learning and deep learning applications, model weights, neural network layers, optimizer moments, or hyperparameters are frequently structured as nested trees of JavaScript dictionaries, arrays, and leaf values (such as Tensors or Numbers). `js_tree` makes it easy to iterate over, map, reduce, flatten, and rebuild these tree structures without corrupting their overall nested shape.

## Key Concepts

*   **`DictArrTree<LeafT>`**: A union representing either a single leaf value `LeafT`, an array of leaf values `LeafT[]`, or a dictionary mapping string keys to sub-trees `DictTree<LeafT>`.
*   **`isLeaf(x)`**: Identifies whether a given JavaScript variable is a leaf node (primitive, custom instance, or an object containing a custom `__kind__` string).
*   **Sorted Iteration**: Iteration processes keys in sorted alphabetical order. This guarantees deterministic indexing, which is essential when flattening tree weights into raw flat arrays for optimization algorithms.

---

## Key Functions

*   **`iter(tree)`**: A generator iterating over all leaves inside a tree.
*   **`forEach(fn, tree)`**: Iterates and executes a callback for each leaf.
*   **`forEachZip(fn, tree1, tree2)`**: Sequentially iterates and executes a callback on pairs of matching leaf nodes in two trees of the same shape.
*   **`map(tree, fn)`**: Transforms each leaf in a tree, returning a new tree with the exact same hierarchical shape.
*   **`flatten(tree)`**: Compresses all leaves in a tree into a flat one-dimensional array.
*   **`unflatten(shapeTree, flatList)`**: Rebuilds a nested tree structure of `shapeTree`'s shape using the sequential elements of a flat array.

---

## Example Usage

### 1. Shape-Preserving Mapping

```typescript
import { map } from './js_tree';

// Imagine a complex model parameter dictionary
const weights = {
  layer1: {
    weights: [1, 2, 3],
    bias: 0.5,
  },
  layer2: {
    weights: [4, 5],
    bias: -0.2,
  }
};

// Double all numerical leaves in the tree
const doubled = map(weights, (value) => value * 2);

console.log(doubled);
/*
Output:
{
  layer1: {
    weights: [2, 4, 6],
    bias: 1.0,
  },
  layer2: {
    weights: [8, 10],
    bias: -0.4,
  }
}
*/
```

### 2. Zipping Two Trees

```typescript
import { forEachZip } from './js_tree';

const weights1 = { a: 1, b: { c: 2 } };
const weights2 = { a: 10, b: { c: 20 } };

forEachZip((w1, w2, index) => {
  console.log(`Pair ${index}: ${w1} and ${w2}`);
}, weights1, weights2);

// Output:
// Pair 0: 1 and 10
// Pair 1: 2 and 20
```

### 3. Flattening and Unflattening

Flattening and unflattening are highly useful when passing model weight structures to numeric optimizers that require flat vector inputs:

```typescript
import { flatten, unflatten } from './js_tree';

const shape = {
  head: { weight: 0 },
  body: { biases: [0, 0] }
};

// Flattening
const flatList = flatten({
  head: { weight: 5.2 },
  body: { biases: [1.1, -0.9] }
});
console.log(flatList); // [ 5.2, 1.1, -0.9 ]

// Rebuilding/Unflattening back into a tree
const updatedTree = unflatten(shape, [9.9, 8.8, 7.7]);
console.log(updatedTree);
/*
Output:
{
  head: { weight: 9.9 },
  body: { biases: [8.8, 7.7] }
}
*/
```
