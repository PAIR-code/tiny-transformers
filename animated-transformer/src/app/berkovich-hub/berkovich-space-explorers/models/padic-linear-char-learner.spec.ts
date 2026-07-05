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
