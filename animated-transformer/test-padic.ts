/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { PadicLinearCharLearner } from './src/app/berkovich-hub/berkovich-space-explorers/models/padic-linear-char-learner';

async function runTest() {
  try {
    const vocab = ['a', 'b', 'c'];
    console.log('Initializing model...');
    const learner = new PadicLinearCharLearner(vocab, 2, 2 as any);
    
    const config = {
      learningRate: 0.01,
      regularization: 0.001,
      beta: 1.0,
      aggMode: 'min' as 'min' | 'average',
      lr: 0.01,
      reg: 0.001,
      regEmbed: 0.001,
    };

    console.log('Testing empty forward pass...');
    const out1 = learner.forward([], config);
    console.log('Empty forward passed.');

    console.log('Testing context forward pass...');
    const out2 = learner.forward([0, 1], config);
    console.log('Context forward passed. Predictions:', out2.probs);

    console.log('Testing train step...');
    const stepRes = learner.trainStep([0, 1], 2, config);
    console.log('Train step passed. Loss:', stepRes.loss);
    
    console.log('SUCCESS');
  } catch (e) {
    console.error('Test crashed!', e);
  }
}

runTest();
