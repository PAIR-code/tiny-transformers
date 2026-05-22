# SignalSpace: Advanced Reactive Signals Library

`signalspace` is a custom, high-performance reactive **Signals** library written in TypeScript. 

Inspired by the ergonomics of Angular Signals, `signalspace` implements a powerful dependency-tracking engine that supports both synchronous propagation and lazy evaluation, safe null-propagation pipelines, automatic cleanup tracking, and synchronous cycle detection.

## Key Features

*   **`SignalSpace`**: A lifecycle container for reactive signals. Creating signals inside a `SignalSpace` allows you to dispose of all active variables, derived graphs, and subscriptions simultaneously when a subspace is closed.
*   **`SetableSignal`**: A root-level signal representing a mutable value. You can read its value like a function call (e.g., `x()`), change its value (`set`), update it via a modifier function (`update`), or trigger downstream mutations (`change`).
*   **`DerivedSignal`**: A reactive node whose value is calculated dynamically from other upstream dependencies:
    *   **`derived` (Sync)**: Computed synchronously whenever any upstream dependency triggers an update.
    *   **`derivedLazy`**: Computes *only when its value is actually requested* (lazy evaluation). This prevents redundant intermediate recalculations in complex dependency graphs.
*   **Null Propagation (`derivedNullable` & `defined`)**: Facilitates clean optional pipelines. Using the `defined(s)` operator within a `derivedNullable` signal automatically forces the entire parent calculation to evaluate to `null` if the dependent signal `s` is null, avoiding verbose conditional logic.
*   **Cycle Detection**: Throws a descriptive runtime error (`loopy setting of values`) if a set chain accidentally attempts to update a signal that triggered it.

---

## Example Usage

### 1. Basic Signals and Derived Calculations

```typescript
import { SignalSpace } from './signalspace';

// Create a signal container space
const space = new SignalSpace();

// Define setable signals
const count = space.setable(10);
const multiplier = space.setable(2);

// Define a derived computed signal
const total = space.derived(() => count() * multiplier());

// Read values
console.log(total()); // 20

// Update root value: changes propagate immediately!
count.set(5);
console.log(total()); // 10

// Clean up all signals inside the space
space.dispose();
```

### 2. Lazy Evaluation (`derivedLazy`)

Lazy signals compute their values only when queried, maximizing efficiency for heavy operations:

```typescript
import { SignalSpace } from './signalspace';

const space = new SignalSpace();
const root = space.setable("Hello");

let computations = 0;

// A lazy derived signal
const upperLazy = space.derivedLazy(() => {
  computations++;
  return root().toUpperCase();
});

// Changing root doesn't trigger computation immediately
root.set("World");
root.set("Antigravity");

console.log(computations); // 0 (No evaluations have run yet!)

// Reading the value forces a single evaluation!
console.log(upperLazy());  // "ANTIGRAVITY"
console.log(computations); // 1
```

### 3. Null Propagation Pipelines (`derivedNullable` & `defined`)

The `defined` operator coordinates conditional pipelines elegantly, propagating `null` gracefully through dependencies:

```typescript
import { SignalSpace, defined } from './signalspace';

const space = new SignalSpace();

const user = space.setable<{ name: string } | null>(null);

// If 'user()' is null, 'greeting' automatically becomes null!
const greeting = space.derivedNullable(() => {
  const activeUser = defined(user); // Triggers null propagation
  return `Hello, ${activeUser.name}!`;
});

console.log(greeting()); // null (No crash, automatically evaluated to null!)

// Set user value
user.set({ name: "Lucas" });
console.log(greeting()); // "Hello, Lucas!"
```

### 4. Piping Async Streams to and from Signals

```typescript
import { SignalSpace } from './signalspace';

const space = new SignalSpace();
const s = space.setable("initial");

// Convert all updates to this signal into an AsyncIterable stream
const stream = space.toIter(s);

setTimeout(() => s.set("second"), 100);
setTimeout(() => s.set("third"), 200);

(async () => {
  for await (const val of stream) {
    console.log(`Stream update: ${val}`);
  }
})();
```
