# StateIter: Deterministic Stateful Iterators

`state-iter` implements deterministic stateful iterators.

Standard JavaScript generators and iterators maintain internal mutable state invisibly. Once an iterator advances, its history is lost, and it is impossible to "fork", "clone", or "rollback" the sequence without restarting the execution loop entirely. `state-iter` solves this by encapsulating iterator state explicitly as a cloneable object (`S`) alongside a stateless generation closure.

## Key Concepts

*   **`StateIter<S, T>`**: A wrapper implementing `Iterable<T>` and `Iterator<T>`. It couples a mutable state object of type `S` with a stateless iterator creator function `(s: S) => Iterator<T>`.
*   **Cloneable/Forkable**: Because the state object is a pure JavaScript structure, `StateIter` provides a `copy()` method. This performs a deterministic `structuredClone` on the state object, allowing you to clone or "branch" an active data sequence perfectly.
*   **Pipeline Operators**: Implements lazy stream transformation methods:
    *   `map`: Lazily transforms values emitted by the stream.
    *   `filter`: Lazily filters values.
    *   `takeOutN(n)`: Mutates the active iterator by pulling the next `n` items out and returning them as a flat array.

---

## Example Usage

### 1. Cloning/Forking an Active Stream

Cloning an iterator lets you branch sequences (for instance, creating identical train/validation sequences or branching search algorithms) deterministically:

```typescript
import { StateIter } from './state-iter';

// Create a simple state: { counter: number }
const initState = { counter: 1 };

// A stateless iterator generator function
function* countGenerator(s: typeof initState) {
  while (true) {
    yield s.counter++;
  }
}

// Instantiate the StateIter
const stream = new StateIter(initState, countGenerator);

console.log(stream.next().value); // 1
console.log(stream.next().value); // 2

// Fork the stream! Performs a structuredClone of current state: { counter: 3 }
const branchedStream = stream.copy();

console.log(stream.next().value);         // 3 (Main stream continues...)
console.log(branchedStream.next().value); // 3 (Branched stream matches perfectly!)

console.log(stream.next().value);         // 4
console.log(branchedStream.next().value); // 4
```

### 2. Pulling Batches (`takeOutN`)

```typescript
import { StateIter } from './state-iter';

const stream = new StateIter({ counter: 1 }, function* (s) {
  while (true) yield s.counter++;
});

// Pull 3 elements out as a batch. Advances the stream state.
const batch = stream.takeOutN(3);
console.log(batch); // [ 1, 2, 3 ]

console.log(stream.next().value); // 4
```
