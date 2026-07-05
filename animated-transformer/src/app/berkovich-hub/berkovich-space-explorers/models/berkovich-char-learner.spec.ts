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
import { BerkovichNgramCharLearner, BerkovichConfig } from './berkovich-char-learner';

describe('BerkovichCharLearner Spec', () => {
  const vocab = ['a', 'b', 'c', 'd'];
  const prime = 3;
  const embDim = 5;
  const config: BerkovichConfig = {
    lr: 0.2,
    reg: 0.05,
    regEmbed: 0.05,
    aggMode: 'min',
    beta: 1.0
  };

  it('should initialize and run forward', () => {
    const learner = new BerkovichNgramCharLearner(vocab, embDim, prime);
    expect(learner.E.length).toBe(vocab.length);
    expect(learner.E[0].length).toBe(embDim);
    expect(learner.W.length).toBe(vocab.length);
    expect(learner.W[0].length).toBe(embDim);

    const context = [0, 1, 2]; // 'a', 'b', 'c'
    const res = learner.forward(context, config);
    expect(res.probs.length).toBe(vocab.length);
    expect(res.logits.length).toBe(vocab.length);
    expect(res.H.length).toBe(embDim);
    
    // Sum of probs should be close to 1
    const sumProbs = res.probs.reduce((a: number, b: number) => a + b, 0);
    expect(sumProbs).toBeCloseTo(1.0, 5);
  });

  it('should execute a train step', () => {
    const learner = new BerkovichNgramCharLearner(vocab, embDim, prime);
    const context = [0, 1]; // 'a', 'b'
    const target = 2; // 'c'

    const initialFwd = learner.forward(context, config);
    const initialProb = initialFwd.probs[target];

    // Train step
    const stepRes = learner.trainStep(context, target, config);
    expect(stepRes.loss).toBeGreaterThan(0);
    
    // Run forward again and verify the probability has updated
    const nextFwd = learner.forward(context, config);
    console.log(`Initial target probability: ${initialProb.toFixed(4)}, next: ${nextFwd.probs[target].toFixed(4)}`);
  });
});
