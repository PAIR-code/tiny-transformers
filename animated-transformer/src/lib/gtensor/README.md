# GTensor: Typed Named Tensors Library

`gtensor` is a high-performance Named Tensors library written in TypeScript, built on top of TensorFlow.js (`@tensorflow/tfjs`). 

In standard tensor libraries, dimensions are referenced by their position indexes (e.g., `0`, `1`, `2`). This makes deep learning code highly error-prone, hard to read, and brittle to refactor. `gtensor` solves this by **naming each dimension** at the type level. Dimension names are represented as string literal types (e.g., `'batch'`, `'pos'`, `'inputRep'`), allowing the TypeScript compiler to verify dimension compatibility, auto-complete dimension names, and infer output shapes on-the-fly.

## Key Concepts

*   **`GTensor<G extends string>`**: The core Named Tensor wrapper around a `tf.Tensor`. The generic `G` represents a union type of its dimensions (e.g., `GTensor<'batch' | 'pos' | 'inputRep'>`).
*   **`GVariable<G extends string>`**: A subclass representing mutable, trainable parameters (wrapping a `tf.Variable`) whose values can be updated during optimizer steps.
*   **`contract(xa, xb, dims)`**: Matrix multiplication / tensor contraction. Multiplies and sums over the shared dimensions specified in `dims`. The contracted dimensions are automatically excluded from the resulting tensor's type.
*   **Dynamic Reshaping**:
    *   `splitDim`: Splits a single dimension into multiple new dimensions with specific sizes.
    *   `mergeDims`: Merges a set of dimensions into a single consolidated dimension.
*   **Broadcasting**:
    *   `broadcastToCombinedShape`: Replicates tensor values across dimensions present in another tensor, automatically resolving common names and ensuring size consistency.

---

## Example Usage

### 1. Construction and Transposition

```typescript
import * as tf from '@tensorflow/tfjs';
import { GTensor } from './gtensor';

// Create a 2D Named Tensor with dimensions 'pos' and 'inputRep'
const x = new GTensor(
  tf.tensor2d([
    [1.0, 2.0],
    [3.0, 4.0]
  ]),
  ['pos', 'inputRep']
);

// Access dimension metadata with auto-completion and type-checking!
console.log(x.dim.pos.size);      // 2
console.log(x.dim.inputRep.index); // 1

// Transpose: dimensions are automatically flipped in type signature
const xT = x.transpose(); 
// Type signature of xT is: GTensor<'pos' | 'inputRep'>
// Internal dimension order is: ['inputRep', 'pos']
```

### 2. Dimension Contraction (Matrix Multiplication)

When contracting tensors, dimensions specified for contraction are reduced away, leaving behind the remaining dimensions:

```typescript
import { GTensor } from './gtensor';

// x: pos x inputRep
const x: GTensor<'pos' | 'inputRep'> = ...;

// W: inputRep x hiddenRep
const W: GTensor<'inputRep' | 'hiddenRep'> = ...;

// Contract over the 'inputRep' dimension.
// The type system automatically infers the result to be GTensor<'pos' | 'hiddenRep'>!
const z = x.contract(W, ['inputRep']);
```

### 3. Splitting and Merging Dimensions

```typescript
import { GTensor } from './gtensor';

// x: batch x hiddenDim (hiddenDim size is 128)
const x: GTensor<'batch' | 'hiddenDim'> = ...;

// Split 'hiddenDim' (128) into 'heads' (4) and 'value' (32)
// Resulting type: GTensor<'batch' | 'heads' | 'value'>
const split = x.splitDim('hiddenDim', {
  heads: 4,
  value: 32
});

// Merge 'heads' and 'value' back into a new dimension 'mergedRep'
// Resulting type: GTensor<'batch' | 'mergedRep'>
const merged = split.mergeDims(['heads', 'value'], 'mergedRep');
```

### 4. Gradient Computations (`grad.ts`)

`gtensor` provides functional utilities for automatic differentiation over parameter structures:

```typescript
import { gradsVarTreeFunctor } from './grad';
import { GVariable } from './gtensor';

// Define active variables
const w = new GVariable(new GTensor(tf.tensor1d([2.0]), ['x']));

// Calculate gradients of a loss function with respect to variable trees
const calcGradsAndLoss = gradsVarTreeFunctor({ w }, () => {
  // Compute loss: w^2
  return w.squared().tensor.asScalar();
});

const { grads, loss } = calcGradsAndLoss();
console.log(loss.dataSync()[0]); // 4.0 (loss value)
console.log(grads.w.tensor.dataSync()[0]); // 4.0 (derivative 2 * w)
```
