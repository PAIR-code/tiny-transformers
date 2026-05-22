# Trainer Library

`trainer` provides core training loops, parameter state managers, automatic gradient zipping, and optimization utilities.

## Key Concepts

*   **`TrainState`**: A comprehensive class encapsulating all states required for training a model:
    *   `model`: Holds the active model weights (`params`) and specifications (`config`).
    *   `grads`: A matching dictionary-tree shape storing parameter gradients.
    *   `lossFn`: The objective loss function that maps variables, inputs, and targets to a single `tf.Scalar`.
    *   `taskSplit`: Manages the dataset splits (train iterators, verification sets).
    *   `nSteps` / `nExamples`: Trackers recording progress.
*   **`gradsVarTreeFunctor(...)`**: An autograd utility that records operations on parameter GVariables inside a synchronous `tf.tidy` call, returning a zipped structure containing the computed gradients and loss scalar.
*   **`trySgdTrainStep(state)`**: Executes a single Stochastic Gradient Descent step: prepares the next batch, calculates gradients, updates GVariable weights, and computes the active mean loss.
*   **`AdamOptimizer` (Experimental)**: An implementation (currently commented out) of the Adam optimizer tracking momentum running moments (`m` and `v`) per parameter node.

---

## Example Training Loop

The following example demonstrates how to set up and execute a training sequence using `TrainState`:

```typescript
import * as tf from '@tensorflow/tfjs';
import { TrainState, trySgdTrainStep } from './train_state';
import { AorBisMaxTask } from '../seqtasks/ab_task';
import { makeRandomStream } from '../random/random';
import { strSeqPrepFn, singleNextTokenIdxOutputPrepFn, prepareBasicTaskTokenRep } from '../tokens/token_gemb';

// 1. Set up dataset and seed generator
const generator = makeRandomStream(1337);
const task = new AorBisMaxTask({
  kind: 'AorBisMaxTask',
  maxInputLen: 5,
  genStateConfig: { seed: 42 }
});

// 2. Prepare Token vocabulary
const tokenRep = prepareBasicTaskTokenRep(['a', 'b']);

// 3. Define Model Weights
const params = {
  tokenEmbedding: new GVariable(new GTensor(tf.randomNormal([7, 16]), ['tokenId', 'inputRep'])),
  denseWeights: new GVariable(new GTensor(tf.randomNormal([16, 2]), ['inputRep', 'outputClass']))
};

// 4. Define Objective Loss Function
function crossEntropyLoss(model, inputs, targets, rng) {
  // inputs: batch x pos x inputRep
  // We take the mean representation over the 'pos' dimension
  const meanRep = inputs.sumOverDims(['pos']).scalarDiv(makeScalar(5));
  
  // Project to classes
  const logits = meanRep.contract(model.params.denseWeights, ['inputRep']);
  
  // Compute cross entropy loss
  return tf.tidy(() => {
    const loss = tf.losses.softmaxCrossEntropy(
      targets.tensor, // Target indexes
      logits.tensor
    );
    return loss.asScalar();
  });
}

// 5. Instantiate TrainState
const state = new TrainState(
  { model: { config: { spec: {}, tokenRep }, params } },
  {
    learningRate: 0.01,
    batchSize: 8,
    maxInputLength: 5,
    testSetSize: 16,
    trainSetSize: 100
  },
  crossEntropyLoss,
  {
    task,
    testSetIndex: new Set(),
    testSetExamples: [],
    trainSetIter: task.exampleIter
  },
  strSeqPrepFn,
  singleNextTokenIdxOutputPrepFn,
  generator
);

// 6. Execute Training Steps!
for (let step = 0; step < 100; step++) {
  trySgdTrainStep(state);
  
  if (step % 10 === 0) {
    console.log(`Step ${state.nSteps} | Mean Loss: ${state.batchMeanLoss}`);
  }
}
```
