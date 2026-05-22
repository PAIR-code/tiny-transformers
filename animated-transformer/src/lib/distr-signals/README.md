# Distributed Signals Library

`distr-signals` is a framework for multi-threaded, reactive programming. It connects main-thread reactive systems (`SignalSpace`) with isolated execution environments like Web Workers. By defining strongly-typed input/output message interfaces, it lets you distribute computationally heavy workloads (e.g., neural network training, sequence generation) to background threads without locking up the browser main thread UI.

## Key Concepts

*   **`CellKind`**: Defines the metadata, input/output keys, and streamed channels for a Web Worker process. It provides strong compile-time typing of messages.
*   **`LabEnv`**: The main application environment that orchestrates cells and registers active workers in a `SignalSpace`.
*   **`CellController`**: Controls the lifecycle of a worker cell. It handles sending signal updates from the main thread to the worker's inputs and propagates worker outputs back to main-thread reactive signals.
*   **`WorkerCell`**: The execution loop inside the Web Worker thread that listens to messages, runs computations, and replies with results.

---

## Example Usage

### 1. Defining a Cell Interface (`CellKind`)

Create a shared file defining the worker inputs and outputs:

```typescript
import { CellKind, Kind } from './cell-kind';

// Define the schema of the inputs and outputs
export interface CalculatorInputs {
  x: number;
  y: number;
}

export interface CalculatorOutputs {
  sum: number;
}

// Instantiate the CellKind to enforce types
export const calculatorCellKind = new CellKind<
  CalculatorInputs,
  {},                  // InStreams
  CalculatorOutputs,
  {}                   // OutStreams
>('calculator-worker', {
  inputs: {
    x: Kind,
    y: Kind,
  },
  outputs: {
    sum: Kind,
  },
});
```

### 2. Implementing the Worker Thread (`calculator.worker.ts`)

```typescript
import { WorkerCell } from './worker-cell';
import { calculatorCellKind } from './calculator-interface';

const workerCell = new WorkerCell(calculatorCellKind);

// React to inputs changing
workerCell.onInputsChanged((inputs) => {
  const { x, y } = inputs;
  const sum = x + y;
  
  // Send outputs back to main thread
  workerCell.sendOutputs({ sum });
});
```

### 3. Orchestrating in the Main Thread

```typescript
import { SignalSpace } from '../signalspace/signalspace';
import { LabEnv } from './lab-env';
import { calculatorCellKind } from './calculator-interface';

const space = new SignalSpace();
const env = new LabEnv(space);

// Create local setable signals
const xSignal = space.setable(5);
const ySignal = space.setable(10);

// Instantiate worker
const worker = new Worker(new URL('./calculator.worker.ts', import.meta.url));

// Start the cell, linking our signals to worker inputs
const { cell, onceStarted } = env.start(calculatorCellKind, worker, {
  inputs: {
    x: xSignal,
    y: ySignal,
  }
});

await onceStarted;

// The output is dynamically exposed as a reactive signal
const sumSignal = cell.outputs.sum;
console.log(sumSignal()); // 15

// Changing a setable signal automatically triggers worker execution!
xSignal.set(20);

// Wait for the reactive update to bounce back from the worker
setTimeout(() => {
  console.log(sumSignal()); // 30
}, 100);
```
