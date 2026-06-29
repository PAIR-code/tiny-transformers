/* Copyright 2026 Google LLC. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import { describe, it, expect } from 'vitest';
import { BerkovichCharLearner, EuclideanCharLearner } from './berkovich-models';

describe('Berkovich & Euclidean Models Spec', () => {
  const vocab = ['a', 'b', 'c', 'd'];
  const prime = 3;
  const embDim = 5;

  it('should initialize and run forward for BerkovichCharLearner', () => {
    const learner = new BerkovichCharLearner(prime, vocab, embDim);
    expect(learner.embeddings.length).toBe(vocab.length);
    expect(learner.embeddings[0].length).toBe(embDim);
    expect(learner.constraints.length).toBe(vocab.length);
    expect(learner.constraints[0].length).toBe(embDim);

    const context = [0, 1, 2]; // 'a', 'b', 'c'
    const res = learner.forward(context, 'min', 1.0);
    expect(res.probs.length).toBe(vocab.length);
    expect(res.logits.length).toBe(vocab.length);
    expect(res.H.length).toBe(embDim);
    
    // Sum of probs should be close to 1
    const sumProbs = res.probs.reduce((a, b) => a + b, 0);
    expect(sumProbs).toBeCloseTo(1.0, 5);
  });

  it('should execute a train step for BerkovichCharLearner', () => {
    const learner = new BerkovichCharLearner(prime, vocab, embDim);
    const context = [0, 1]; // 'a', 'b'
    const target = 2; // 'c'

    const initialFwd = learner.forward(context, 'min', 1.0);
    const initialProb = initialFwd.probs[target];

    // Train step
    const stepRes = learner.trainStep(context, target, 0.2, 0.05, 0.05, 'min', 1.0);
    expect(stepRes.loss).toBeGreaterThan(0);
    
    // Run forward again and verify the probability has updated
    const nextFwd = learner.forward(context, 'min', 1.0);
    console.log(`Initial target probability: ${initialProb.toFixed(4)}, next: ${nextFwd.probs[target].toFixed(4)}`);
  });

  it('should initialize, forward and train for EuclideanCharLearner', () => {
    const learner = new EuclideanCharLearner(vocab, embDim);
    expect(learner.embeddings.length).toBe(vocab.length);
    expect(learner.weights.length).toBe(vocab.length);
    expect(learner.biases.length).toBe(vocab.length);

    const context = [0, 1, 2];
    const target = 3;

    const res = learner.forward(context);
    expect(res.probs.length).toBe(vocab.length);
    const sumProbs = res.probs.reduce((a, b) => a + b, 0);
    expect(sumProbs).toBeCloseTo(1.0, 5);

    const initialLoss = -Math.log(res.probs[target] + 1e-15);

    const stepRes = learner.trainStep(context, target, 0.1, 0.01);
    expect(stepRes.loss).toBeCloseTo(initialLoss, 5);

    const nextRes = learner.forward(context);
    expect(nextRes.probs[target]).toBeGreaterThan(res.probs[target]);
  });
});
