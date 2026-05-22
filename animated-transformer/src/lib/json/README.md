# JSON Utilities Library

`json` provides advanced primitives and registries for representing, formatting, pretty printing, and dynamically configuring JSON/JSON5-serializable objects.

## Key Features

1.  **Robust Quoting (`json.ts`)**:
    *   An efficient string-escapement utility (`quote`) that wraps string values in JSON-compliant quotes, escaping control and non-printable characters securely.
2.  **Premium Pretty Printing (`pretty_json.ts`)**:
    *   Uses the `tubes` library to format complex JSON values dynamically based on line-width constraints (`arrWrapAt`, `objWrapAt`).
    *   Packs arrays onto a single line if they fit; collapses primitive lists cleanly; breaks out compound arrays across multiple lines; sorts keys alphabetically by default; and optionally omits quotes on standard JavaScript keys when safe.
3.  **Dynamic Config Registry (`config-obj.ts`)**:
    *   Provides `ConfigObj` and `ConfigKindRegistry` to pair active runtime model objects (like neural networks, sequence datasets, or tasks) with their underlying JSON/JSON5 configurations.
    *   Enables interactive dashboards or command-line applications to re-instantiate active classes immediately from a parsed configuration string.

---

## Example Usage

### 1. Premium Pretty Printing

```typescript
import { stringifyJsonValue } from './pretty_json';

const data = {
  modelName: "Transformer",
  layers: [
    { id: 1, heads: 4, active: true },
    { id: 2, heads: 8, active: false }
  ],
  tags: ["toy", "interactive", "NamedTensors"]
};

// Pretty print with customized wrapping constraints
const prettyString = stringifyJsonValue(data, {
  arrWrapAt: 40, // Wrap arrays exceeding 40 characters
  objWrapAt: 50, // Wrap objects exceeding 50 characters
  sortObjKeys: true // Alphabetize object keys
});

console.log(prettyString);
/*
Output:
{
  layers: [
    { active: true, heads: 4, id: 1 },
    { active: false, heads: 8, id: 2 }
  ],
  modelName: "Transformer",
  tags: [ "toy", "interactive", "NamedTensors" ]
}
*/
```

### 2. Registering Configurations (`ConfigKindRegistry`)

A registry couples an object creator with a default configuration so objects can be loaded/re-instantiated dynamically:

```typescript
import { ConfigKindRegistry, JsonWithKind } from './config-obj';

// 1. Define a class that keeps its generating config
interface MyTaskConfig extends JsonWithKind {
  kind: 'MyTask';
  steps: number;
}

class MyTask {
  constructor(public config: MyTaskConfig) {}
}

// 2. Create the registry
const registry = new ConfigKindRegistry<MyTask>();

// 3. Register MyTask with its default configuration
const myTaskKindSpec = registry.register(
  { kind: 'MyTask', steps: 100 } as MyTaskConfig,
  (config) => new MyTask(config)
);

// 4. Re-make MyTask dynamically from a configuration string (e.g., from JSON5 CLI)
const newStr = "{ kind: 'MyTask', steps: 500 }";
const taskInstance = myTaskKindSpec.makeFn(newStr);

console.log(taskInstance.config.steps); // 500
```
