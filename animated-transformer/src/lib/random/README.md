# Random: Deterministic Random Streams

`random` implements deterministic, seedable, forkable, and cloneable pseudorandom number generators (PRNG) in TypeScript.

In machine learning and probabilistic modeling, guaranteeing reproducibility is extremely critical. Standard `Math.random()` is global and non-deterministic, which ruins training reproducibility. `random` solves this by encapsulating random state inside streams that can be branched and cloned.

## Key Concepts

*   **Bitwise mixing PRNG**: Utilizes an efficient integer-mixing bitwise hash function (`nextRandom`) to produce deterministic floating-point numbers uniformly distributed between `0` and `1` starting from a root seed.
*   **Forking/Substreams**: Allows you to generate a secondary independent random stream (`substream()`) from a parent stream. Substreams are completely deterministic based on the parent stream's state, but their outputs do not interfere with the parent's sequence.
*   **Stateful Iteration**: Inherits from `StateIter` (Stateful Iterator) allowing structured cloning of the generator state.

---

## Key Functions

*   `uniformFloatInRange(min, max)`: Generates a float between `min` and `max`.
*   `uniformIntInRange(min, max)`: Generates an integer between `min` and `max` (inclusive of `min`, exclusive of `max`).
*   `randomEntryFromList(l)`: Deterministically selects a random element from a list.
*   `substream()`: Spawns a new child `RandomStream`.

---

## Example Usage

### 1. Replicable Randomness

Using the same seed yields identical sequences, ensuring experiments can be repeated exactly:

```typescript
import { makeRandomStream } from './random';

const stream1 = makeRandomStream(42); // Seed: 42
const stream2 = makeRandomStream(42); // Seed: 42

console.log(stream1.random()); // 0.437189...
console.log(stream2.random()); // 0.437189... (Identical output!)

console.log(stream1.random()); // 0.846125...
console.log(stream2.random()); // 0.846125... (Identical output!)
```

### 2. Spawning Substreams (Parallel Sequences)

Branching streams lets you instantiate parallel random sequences (e.g. for dropout layers, shuffling, and validation splits) deterministically without corrupting the main stream sequence:

```typescript
import { makeRandomStream } from './random';

const mainStream = makeRandomStream(100);

// Spawn a substream
const dropoutStream = mainStream.substream();

console.log(dropoutStream.random()); // Deterministic, but distinct from mainStream
console.log(mainStream.random());    // Main stream continues its sequence independently
```

### 3. List Selection and Ranges

```typescript
import { makeRandomStream } from './random';

const rng = makeRandomStream(99);

// Pick values from ranges
const learningRate = rng.uniformFloatInRange(0.001, 0.1);
const numHeads = rng.uniformIntInRange(2, 8);

// Pick a random token
const token = rng.randomEntryFromList(['[MASK]', '[PAD]', '[EOS]']);
```
