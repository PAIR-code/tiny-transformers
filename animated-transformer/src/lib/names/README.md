# Names: Fresh Variable Name Generator

`names` provides a lightweight utility to programmatically generate unique ("fresh") variable names. It is highly useful when working with compilation steps, code generation pipelines, logic rules unification (such as variable renaming to avoid collisions), or printing mathematical equations.

## Key Concepts

*   **Prefixes and Postfixes**: Names are formatted systematically using a prefix, a unique identifier sequence, and an optional postfix (e.g. `_a`, `_b1`).
*   **Seed Alphabet walking**: Names are walked starting from index `0` mapping to a list of chars (by default `a` to `z`). Once indices exceed the alphabet size, numerical suffixes are seamlessly appended (e.g. `_a2`).
*   **Collision Prevention**: Avoids collisions by maintaining a `usedNameSet`. It increments the name generator ID automatically until it produces a string that is completely fresh within the set.

---

## Example Usage

### 1. Simple Fresh Names Generation

```typescript
import { FreshNames } from './simple_fresh_names';

const names = new FreshNames();

// Create standard names sequentially
console.log(names.makeAndAddNextName()); // "_a"
console.log(names.makeAndAddNextName()); // "_b"
console.log(names.makeAndAddNextName()); // "_c"
```

### 2. Avoiding Existing Names (Collision Prevention)

```typescript
import { FreshNames } from './simple_fresh_names';

// Pre-populate already used names
const names = new FreshNames();
names.addNames(['_a', '_b', 'myCustomVariable']);

// Generates '_c', skipping '_a' and '_b'
console.log(names.makeAndAddNextName()); // "_c"

// Generate with a specific custom prefix
console.log(names.makeAndAddNextName({ prefix: 'var_' })); // "var_d"
```

### 3. Forking Name Spaces

Forking creates a cloned namespace context. This lets you generate temporary variables in sub-computations without mutating the parent namespace set:

```typescript
import { FreshNames } from './simple_fresh_names';

const rootNames = new FreshNames();
rootNames.addNames(['_a']);

// Fork root context
const subNames = rootNames.fork();

console.log(subNames.makeAndAddNextName()); // "_b"
console.log(subNames.makeAndAddNextName()); // "_c"

// Root namespace is unchanged and does not contain '_b' or '_c'
console.log(rootNames.makeAndAddNextName()); // "_b"
```
