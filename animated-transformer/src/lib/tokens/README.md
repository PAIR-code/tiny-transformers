# Tokens Embedding Library

`tokens` manages string vocabulary representations, token index mappings, and Named Tensor sequence embeddings.

In deep learning natural language processing models, raw text strings must be converted into dense vector matrices before entering neural layers. This library abstracts dictionary index conversions and batched token embedding lookups, outputting cleanly typed `GTensor` matrices.

## Key Concepts

*   **`BasicTaskTokenRep`**: Encapsulates the task vocabulary, string-to-index mapping dictionary (`tokenToIdx`), and index-to-string list (`tokens`). It automatically registers special utility tokens:
    *   `[MASK]`: Used for masked token prediction or language model targets.
    *   `[PAD]`: Padding token used to align sequences of different lengths in a batch.
    *   `[EOS]`: End-of-Sequence token indicating boundaries.
    *   `' '` (space): Word boundary spaces.
*   **Sequence Embeddings**:
    *   `embed(tokenToIdx, embeddings, input)`: Takes a single sequence of strings (`string[]`) and maps it to a dense 2D tensor of shape `['pos', 'inputRep']`.
    *   `embedBatch(...)`: Processes a 2D array of token indexes, padding short sequences to match `maxInputLength`, and gathers the corresponding vectors into a dense 3D tensor of shape `['batch', 'pos', 'inputRep']`.
*   **Sequence Prep Helpers**:
    *   `expectedOutputSeqPrepFn`: Prepares expected shifted sequences for causal autoregressive training.
    *   `singleNextTokenIdxOutputPrepFn`: Extracts target token indexes of shape `['batch']` for next-token classifiers.

---

## Example Usage

### 1. Vocabulary Preparation

```typescript
import { prepareBasicTaskTokenRep } from './token_gemb';

// Set up token mappings for a custom character set
const tokenRep = prepareBasicTaskTokenRep(['a', 'b', 'c']);

console.log(tokenRep.tokens);
// Output: [ "a", "b", "c", "[MASK]", "[PAD]", "[EOS]", " " ]

console.log(tokenRep.tokenToIdx['[MASK]']); // 3
console.log(tokenRep.tokenToIdx['[PAD]']);  // 4
```

### 2. Single Sequence Embedding

```typescript
import * as tf from '@tensorflow/tfjs';
import { GTensor } from '../gtensor/gtensor';
import { embed, prepareBasicTaskTokenRep } from './token_gemb';

const tokenRep = prepareBasicTaskTokenRep(['a', 'b']);

// Create dummy model embeddings: 7 tokens x 16 embedding dimensions
const embeddings = new GTensor(
  tf.randomNormal([7, 16]),
  ['tokenId', 'inputRep']
);

// Embed a string sequence
const inputSeq = ['a', 'b', 'a'];
const embedded = embed(tokenRep.tokenToIdx, embeddings, inputSeq);

console.log(embedded.dimNames); // [ "pos", "inputRep" ]
console.log(embedded.dim.pos.size);      // 3
console.log(embedded.dim.inputRep.size); // 16
```

### 3. Batched Sequence Embedding (with Padding)

```typescript
import * as tf from '@tensorflow/tfjs';
import { GTensor } from '../gtensor/gtensor';
import { embedBatch, prepareBasicTaskTokenRep } from './token_gemb';

const tokenRep = prepareBasicTaskTokenRep(['a', 'b']);
const embeddings = new GTensor(tf.randomNormal([7, 16]), ['tokenId', 'inputRep']);

// 2D array of integer token IDs. Lengths are 3 and 1.
const batchTokenIds = [
  [0, 1, 0], // "a", "b", "a"
  [1]        // "b"
];

// Embed and pad to aligned length 4
const batched = embedBatch(embeddings, batchTokenIds, {
  paddingId: tokenRep.tokenToIdx[tokenRep.padToken], // Use '[PAD]' index
  padAt: 'end',                                       // Append padding
  dtype: 'int32',
  maxInputLength: 4
});

console.log(batched.dimNames); // [ "batch", "pos", "inputRep" ]
console.log(batched.dim.batch.size);    // 2
console.log(batched.dim.pos.size);      // 4
console.log(batched.dim.inputRep.size); // 16
```
