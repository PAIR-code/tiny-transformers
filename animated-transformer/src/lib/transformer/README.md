# Named Tensor Transformer Library

`transformer` provides a complete implementation of multi-head self-attention **Transformer decoder** architectures using the `gtensor` Named Tensors library. 

By modeling tensor operations explicitly at the type-level, this implementation avoids indexing errors and exposes key architectural stages—such as Query/Key/Value projections, causal masking, relative position encodings, feed-forward neural projections, and residual connections—with compile-time safety and clear autocomplete tooling.

## Key Components

*   **`TransformerParams`**: Zips together the model weights:
    *   `tokenEmbedding`: Maps raw vocabulary tokens into dense vector representations.
    *   `layers`: An array of `AttnHeadParams` representing the weights for each layer in the Transformer stack.
*   **`AttnHeadParams`**: Holds the parameters for an individual attention layer:
    *   `queryM`, `keyM`, `valueM`: The dense projection matrices for queries, keys, and values.
    *   `headsToInputRepM`: The projection matrix mapping multiple attention heads back to the hidden representation size.
    *   `ff`: Feed-forward neural layers with weights (`w`) and biases (`bIn`, `bOut`).
    *   `layerNormPostFF` / `layerNormHeadsProjection`: Layer Normalization parameters.
    *   `relativePosAttention`: Relative Position Attention matrices.
*   **`computeAttnHead(...)`**: Computes multi-head self-attention. It projects inputs, executes key-query contract products, applies causal masking, performs relative position offsets, handles dropouts, projects back to hidden coordinates, and applies layer norms and residual additions.
*   **`computeTransformer(...)`**: Computes the full feed-forward loop through all stacked layers.

---

## Key Mathematical Implementations

### 1. Multi-Head Attention Product

The Query-Key multiplication computes attention weights between the query position `'queryPos'` and key position `'keyPos'` for each head `'heads'`. In `gtensor`, this contraction is written as:

```typescript
let rawAttention = keys
  .rename('pos', 'keyPos')
  .contract(queries.rename('pos', 'queryPos'), ['kq']);
// Resulting shape: ['batch', 'heads', 'queryPos', 'keyPos']
```

### 2. Causal Attention Masking

Causal masking ensures tokens cannot attend to subsequent future tokens in the sequence (preserving the causal autoregressive constraint):

```typescript
export function causalMask(
  rawAttention: GTensor<'batch' | 'heads' | 'queryPos' | 'keyPos'>
): GTensor<'batch' | 'heads' | 'queryPos' | 'keyPos'> {
  // Fills upper-triangle elements exceeding current position index with -Infinity
  // before applying softmax over the 'keyPos' dimension.
  ...
}
```

### 3. Relative Position Encodings

Incorporates relative position attention biases dynamically into the attention logits:

```typescript
const posAttentionMatrix = makePosAttentionMatrix(params.relativePosAttention);
rawAttention = rawAttention.pointwiseAdd(posAttentionMatrix);
```

---

## Example Usage

### 1. Creating and Forwarding a Transformer Model

```typescript
import { makeTransformer, defaultTransformerConfig, computeTransformer } from './transformer_gtensor';
import { makeRandomStream } from '../random/random';
import * as tf from '@tensorflow/tfjs';

// 1. Define seed generator
const rng = makeRandomStream(42);

// 2. Load default configuration (e.g., input size 64, 4 layers, 4 heads)
const config = defaultTransformerConfig();

// 3. Instantiate model weights
const model = makeTransformer(config);

// 4. Create dummy input: batch=2, pos=5, inputRep=64
const inputs = new GTensor(
  tf.randomNormal([2, 5, 64]),
  ['batch', 'pos', 'inputRep']
);

// 5. Execute forward pass!
const computation = tf.tidy(() => {
  return computeTransformer(model, inputs, rng);
});

// The final output sequence representation
const finalOutput = computation.layers[computation.layers.length - 1].seqOutput;

console.log(finalOutput.dimNames); // [ "batch", "pos", "inputRep" ]
console.log(finalOutput.dim.batch.size);    // 2
console.log(finalOutput.dim.pos.size);      // 5
console.log(finalOutput.dim.inputRep.size); // 64
```
