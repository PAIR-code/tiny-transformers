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

import { PadicLinearCharLearner } from './padic-linear-char-learner';
import { BerkovichConfig } from './berkovich-char-learner';

describe('PadicLinearCharLearner', () => {
  it('should initialize and run forward without crashing', () => {
    const vocab = ['a', 'b', 'c'];
    const learner = new PadicLinearCharLearner(vocab, 2, 2);
    const config: BerkovichConfig = {
      lr: 0.01,
      reg: 0.001,
      regEmbed: 0.002,
      beta: 1.0,
      aggMode: 'min'
    };

    // empty context
    const out1 = learner.forward([], config);
    expect(out1).toBeDefined();

    // normal context
    const out2 = learner.forward([0, 1], config);
    expect(out2).toBeDefined();

    // train step
    learner.trainStep([0, 1], 2, config);
  });
});
