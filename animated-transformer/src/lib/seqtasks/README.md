# Sequence Tasks Library

`seqtasks` provides a collection of toy sequence-to-sequence and Language Modeling (LM) tasks. 

These synthetic datasets are designed to evaluate the learning capabilities of small neural networks (such as toy positionless or causal transformers). They serve as clean, lightweight, and highly controllable sandboxes for studying attention maps, probability distributions, training dynamics, and algorithmic logic.

## Core Design

Tasks implement a standard `BasicRandLmTask` interface, ensuring consistency across data generation and batch preparation:

*   **Deterministic Seeding**: Tasks consume a seedable `RandomState`, making the synthetic datasets completely reproducible.
*   **Infinite Data Streams**: Examples are created on-the-fly using a `StateIter` generator, providing infinite batches without loading heavy data files.
*   **Format Consistency**: Each example is returned as an `Example` object containing:
    *   `id`: Unique sequential identifier.
    *   `input: string[]`: The input sequence of tokens.
    *   `output: string[]`: The expected output/target sequence of tokens.

---

## Available Tasks

1.  **`AorBisMaxTask` (`ab_task.ts`)**:
    *   **Input**: A random sequence of `'a'`s and `'b'`s (e.g. `['a', 'b', 'b', 'a', 'b']`).
    *   **Output**: Whichever character occurred most frequently in the input (e.g. `['b']`).
    *   **Goal**: Tests if a position-less transformer can learn to act as a count/majority reducer.
2.  **`AbAltTask` (`ab_alt_task.ts`)**:
    *   Pattern-matching and sequencing tasks based on alternating sequences or repeated subsequences.
3.  **`SwapTask` (`swap_task.ts`)**:
    *   List sorting/swapping exercises. Tests learning of basic algorithmic ordering rules.
4.  **`ParenMatchingTask` (`paren_matching_task.ts`)**:
    *   Validates parentheses matching (Dyck languages) or opening/closing brace pairs. Evaluates if transformers can represent hierarchical nested syntax trees.
5.  **`SecretTokenTask` (`secret_token_task.ts`)**:
    *   Associative memory and dictionary retrieval tasks where a key token prompts the model to recall a target value token.
6.  **`DecisionBoundaryTask` (`decision_boundary_task.ts`)**:
    *   Algorithmic classification and decision boundary mappings.
7.  **`TinyWorlds` (`tiny_worlds.ts` / `rules.ts`)**:
    *   Synthetic micro-storytelling generated using microphysics and logic rules. For instance, generating consistent animal action scenarios (e.g. "cats jump over rocks", "squished animals cannot run").

---

## Example Usage

### 1. Instantiating and Generating Batches

```typescript
import { AorBisMaxTask, AorBisMaxTaskConfig } from './ab_task';
import { generateBatch } from './util';

// Create task config
const taskConfig: AorBisMaxTaskConfig = {
  kind: 'AorBisMaxTask',
  maxInputLen: 5,
  genStateConfig: { seed: 42 } // Reproducible seed
};

// Instantiate the task
const task = new AorBisMaxTask(taskConfig);

// Generate a batch of 3 training examples
const examples = generateBatch(task.exampleIter, 3);

examples.forEach((example) => {
  console.log(`Example ${example.id}:`);
  console.log(`  Input:  [ ${example.input.join(', ')} ]`);
  console.log(`  Output: [ ${example.output.join(', ')} ]`);
});

/*
Output:
Example 0:
  Input:  [ a, b, b, a, b ]
  Output: [ b ]
Example 1:
  Input:  [ a, a, a, b, a ]
  Output: [ a ]
Example 2:
  Input:  [ b, a, b, a, a ]
  Output: [ a ]
*/
```

### 2. Using the Task Registry

Task registry enables dynamic configuration and creation of tasks from JSON5 config strings (ideal for interactive command lines or dashboards):

```typescript
import { taskRegistry } from './task_registry';

// Instantiate a ParenMatchingTask dynamically using the registry
const parenTaskSpec = taskRegistry.kinds['ParenMatchingTask'];
const parenTask = parenTaskSpec.makeFn(
  "{ kind: 'ParenMatchingTask', maxInputLen: 8, genStateConfig: { seed: 12 } }"
);

// Grab default config
console.log(parenTaskSpec.defaultConfigStr);
```
