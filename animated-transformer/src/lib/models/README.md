# Models Registry Library

`models` implements a unified registry and dynamic instantiation framework for neural network models. 

By coupling models with a dynamic configuration schema, this library makes it easy to serialize, deserialize, and instantiate deep learning models (like Named Tensor Transformers) from simple configuration files or interactive frontend settings.

## Key Concepts

*   **`Model`**: A strongly-typed interface encapsulating:
    *   `config`: The JSON-stringifiable specification detailing hyper-parameters (layer count, dimensions, etc.).
    *   `params`: A nested dictionary-tree (`DictArrTree<GTensor>`) containing the model's actual tensor weight parameters.
*   **`modelRegistry`**: A central configuration registry (`ConfigKindRegistry`) used to catalog all supported model architectures.
*   **`makeModel(kind, configStr)`**: Instantiates a registered model architecture by its type name (`kind`), parsing an optional JSON/JSON5 config string, or falling back to its default registered configuration.

---

## Example Usage

### 1. Defining and Registering a Model

```typescript
import { Model, modelRegistry } from './model_registry';
import { GTensor } from '../gtensor/gtensor';
import { JsonWithKind } from '../json/config-obj';

// Define Model Configuration Schema
interface SimpleMlConfig extends JsonWithKind {
  kind: 'SimpleMLP';
  hiddenRep: number;
}

// Define Parameter Shape
type SimpleMLPParams = {
  w1: GTensor<'input' | 'hidden'>;
  w2: GTensor<'hidden' | 'output'>;
};

class SimpleMLPModel implements Model<SimpleMlConfig, SimpleMLPParams> {
  constructor(
    public config: SimpleMlConfig,
    public params: SimpleMLPParams
  ) {}
}

// Create instantiation builder
function createSimpleMLP(config: SimpleMlConfig): SimpleMLPModel {
  const params: SimpleMLPParams = {
    w1: ... // Initialized Named Tensors
    w2: ...
  };
  return new SimpleMLPModel(config, params);
}

// Register the MLP model
export const simpleMlpKind = modelRegistry.register(
  { kind: 'SimpleMLP', hiddenRep: 64 } as SimpleMlConfig,
  createSimpleMLP
);
```

### 2. Dynamically Instantiating Registered Models

```typescript
import { makeModel } from './model_registry';

// Create an instance of the SimpleMLP with standard config
const defaultModel = makeModel('SimpleMLP');
console.log(defaultModel.config.hiddenRep); // 64

// Instantiate SimpleMLP with custom overrides via JSON5 config string
const customModel = makeModel(
  'SimpleMLP',
  "{ kind: 'SimpleMLP', hiddenRep: 256 }"
);
console.log(customModel.config.hiddenRep); // 256
```
