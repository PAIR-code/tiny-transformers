# WebLab: Multi-Threaded Playground Platform

`weblab` is a platform orchestration engine designed for building web-based interactive AI playgrounds and model dashboards.

It manages **Experiments** composed of hierarchically nested **Sections**. Sections can represent Markdown write-ups, parameter files, custom interactive visualization components, or background Worker cells. By leveraging `distr-signals`, WebLab coordinates computationally expensive processes (like active neural network training or text generation loops) inside background Web Worker threads, ensuring that visualizations and user controls on the main browser thread remain completely fluid and responsive.

## Key Concepts

*   **`Experiment`**: A structural class that contains a list of sections, ancestral links, a cache resolver, a data resolver, and auto-complete trackers.
*   **`Section`**: A flexible component block in an experiment. Its behavior is defined by its `SecDef` configuration:
    *   `SectionList`: A nested list of sub-sections, enabling folders and complex tree structures.
    *   `Path`: A file reference section. Data is loaded lazily from a data resolver path.
    *   `Ref`: A section linking directly to another section, allowing shared parameter configurations.
    *   `UiCell`: A visualization block with input/output reactive pins.
    *   `WorkerCell`: A specialized background cell that spins up a Web Worker, loading its executable JavaScript script dynamically and connecting its inputs/outputs to active signals.
*   **Auto-Complete wiring**: Connects inputs of a cell to the outputs of another cell dynamically. Using `SignalSpace` reactive mappings, the platform binds parameters together immediately upon request.

---

## Example Usage

The following example illustrates how WebLab loads a serialized experiment structure, wires inputs and outputs together, and connects background workers:

```typescript
import { SignalSpace } from '../signalspace/signalspace';
import { LabEnv } from '../distr-signals/lab-env';
import { InMemoryDataResolver } from '../data-resolver/data-resolver';
import { loadExperiment } from './experiment';
import { SecDefOfSecList, SecDefKind } from './section';

// 1. Initialize reactive space and execution environment
const space = new SignalSpace();
const env = new LabEnv(space);

// 2. Define resolvers to mock storage paths
const dataResolver = new InMemoryDataResolver();
const cacheResolver = new InMemoryDataResolver();

// Save a worker script to the simulated resolver
dataResolver.saveStr(
  ['scripts', 'trainer.js'],
  `
  import { WorkerCell } from '../distr-signals/worker-cell';
  import { calculatorCellKind } from './interface';
  const cell = new WorkerCell(calculatorCellKind);
  cell.onInputsChanged((inputs) => { ... });
  `
);

// 3. Define a serialized experiment list
const experimentConfig: SecDefOfSecList = {
  kind: SecDefKind.SectionList,
  id: "my-first-weblab",
  display: { collapsed: false },
  subsections: [
    {
      kind: SecDefKind.WorkerCell,
      id: "nn-trainer",
      display: { collapsed: false },
      // Executable JavaScript script location loaded by worker
      codePath: "scripts/trainer.js",
      // Mapped signal wires
      inputs: {
        learningRate: { value: 0.01 },
        steps: { value: 100 }
      },
      outputs: {
        loss: { value: 0 }
      }
    }
  ]
};

// 4. Load the experiment dynamically!
const experiment = await loadExperiment(
  cacheResolver,
  dataResolver,
  env,
  experimentConfig,
  { fromCache: false }
);

// 5. Inspect active reactive components
const nnTrainerCell = experiment.getSectionLabCell("nn-trainer");
console.log(nnTrainerCell.status()); // "loading" or "ready"

// Get the loss output signal of the trainer cell
const lossSignal = experiment.getSectionOutput("nn-trainer", "loss");
```
