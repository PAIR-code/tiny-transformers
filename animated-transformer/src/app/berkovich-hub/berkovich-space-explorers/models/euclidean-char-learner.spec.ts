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
import { EuclideanCharLearner } from './euclidean-char-learner';

describe('EuclideanCharLearner Spec', () => {
  const vocab = ['a', 'b', 'c', 'd'];
  const embDim = 5;

  it('should initialize, forward and train', () => {
    const learner = new EuclideanCharLearner(vocab, embDim);
    expect(learner.E.length).toBe(vocab.length);
    expect(learner.W.length).toBe(vocab.length);
    expect(learner.W[0].length).toBe(embDim);
    expect(learner.biases.length).toBe(vocab.length);

    const context = [0, 1, 2];
    const target = 3;
    const config = { lr: 0.1, reg: 0.01 };

    const res = learner.forward(context);
    expect(res.probs.length).toBe(vocab.length);
    const sumProbs = res.probs.reduce((a: number, b: number) => a + b, 0);
    expect(sumProbs).toBeCloseTo(1.0, 5);

    const initialLoss = -Math.log(res.probs[target] + 1e-15);

    const stepRes = learner.trainStep(context, target, config);
    expect(stepRes.loss).toBeCloseTo(initialLoss, 5);

    const nextRes = learner.forward(context);
    expect(nextRes.probs[target]).toBeGreaterThan(res.probs[target]);
  });
});
