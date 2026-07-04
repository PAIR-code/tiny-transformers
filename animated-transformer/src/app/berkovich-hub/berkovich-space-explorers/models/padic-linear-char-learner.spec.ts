import { PadicLinearCharLearner } from './padic-linear-char-learner';

describe('PadicLinearCharLearner', () => {
  it('should initialize and run forward without crashing', () => {
    const vocab = ['a', 'b', 'c'];
    const learner = new PadicLinearCharLearner(vocab, 2, 2n);
    const config = {
      learningRate: 0.01,
      regularization: 0.001,
      beta: 1.0,
      aggMode: 'min' as 'min' | 'average'
    };

    // empty context
    const out1 = learner.forward([], config);
    expect(out1).toBeDefined();

    // normal context
    const out2 = learner.forward([0, 1], config);
    expect(out2).toBeDefined();

    // train step
    learner.trainStep([0, 1], 2, config as any);
  });
});
