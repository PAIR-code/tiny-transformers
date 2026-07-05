import { PadicLinearCharLearner } from './src/app/berkovich-hub/berkovich-space-explorers/models/padic-linear-char-learner';
import { BerkovichBigramBiasCharLearner } from './src/app/berkovich-hub/berkovich-space-explorers/models/berkovich-bigram-bias-char-learner';
import { AffinoidNgramCharLearner } from './src/app/berkovich-hub/berkovich-space-explorers/models/affinoid-ngram-char-learner';
import { TropicalMlpCharLearner } from './src/app/berkovich-hub/berkovich-space-explorers/models/tropical-mlp-char-learner';
import { BerkovichAttentionCharLearner } from './src/app/berkovich-hub/berkovich-space-explorers/models/berkovich-attention-char-learner';

const vocab = ['a', 'b', 'c', 'd', 'e'];
const samples = [
  { contextIndices: [0, 1], targetIdx: 2 }, // "ab" -> "c"
  { contextIndices: [1, 2], targetIdx: 3 }, // "bc" -> "d"
  { contextIndices: [2, 3], targetIdx: 4 }, // "cd" -> "e"
  { contextIndices: [3, 4], targetIdx: 0 }, // "de" -> "a"
  { contextIndices: [4, 0], targetIdx: 1 }  // "ea" -> "b"
];

async function trainModel(name: string, learner: any, config: any, epochs: number = 100) {
  console.log(`\n========================================`);
  console.log(`Training Model: ${name}`);
  console.log(`========================================`);

  // Initial Eval
  let initialLoss = 0;
  let initialAcc = 0;
  for (const sample of samples) {
    const fwd = learner.forward(sample.contextIndices, config);
    initialLoss += -Math.log(fwd.probs[sample.targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
    if (predIdx === sample.targetIdx) initialAcc++;
  }
  console.log(`Initial Loss: ${(initialLoss / samples.length).toFixed(4)} | Initial Accuracy: ${(initialAcc / samples.length * 100).toFixed(1)}%`);

  // Train loop
  for (let ep = 1; ep <= epochs; ep++) {
    const batchRes = learner.trainBatch(samples, config);
    if (ep === 1 || ep === epochs || ep % 10 === 0) {
      console.log(`Epoch ${ep.toString().padStart(2, '0')}/${epochs} | Batch Loss: ${batchRes.loss.toFixed(4)} | Accuracy: ${(batchRes.accuracy * 100).toFixed(1)}%`);
    }
  }

  // Final Eval
  let finalLoss = 0;
  let finalAcc = 0;
  for (const sample of samples) {
    const fwd = learner.forward(sample.contextIndices, config);
    finalLoss += -Math.log(fwd.probs[sample.targetIdx] + 1e-15);
    const predIdx = fwd.probs.indexOf(Math.max(...fwd.probs));
    if (predIdx === sample.targetIdx) finalAcc++;
  }
  console.log(`Final Loss:   ${(finalLoss / samples.length).toFixed(4)} | Final Accuracy:   ${(finalAcc / samples.length * 100).toFixed(1)}%`);
  const success = (finalLoss / samples.length) < (initialLoss / samples.length);
  console.log(`Convergence status: ${success ? 'PASSED (Loss Decreased)' : 'FAILED'}`);
  return { name, initialLoss: initialLoss / samples.length, finalLoss: finalLoss / samples.length, success };
}

async function runAll() {
  const baseConfig = {
    lr: 0.01,
    reg: 0.002,
    regEmbed: 0.001,
    beta: 1.5,
    aggMode: 'min' as const,
    prime: 3,
    embDim: 3,
    contextLength: 2
  };

  const results: any[] = [];

  try {
    // 1. Padic Linear
    const padicLinear = new PadicLinearCharLearner(vocab, baseConfig.embDim, baseConfig.prime);
    results.push(await trainModel('Padic Linear Layer', padicLinear, baseConfig));

    // 2. Bigram Bias
    const bigramBias = new BerkovichBigramBiasCharLearner(vocab, baseConfig.embDim, baseConfig.prime);
    results.push(await trainModel('Berkovich Bigram + Class Bias', bigramBias, baseConfig));

    // 3. Affinoid N-gram
    const affConfig = { ...baseConfig, numConstraints: 2 };
    const affinoidNgram = new AffinoidNgramCharLearner(vocab, baseConfig.embDim, baseConfig.prime, affConfig.numConstraints);
    results.push(await trainModel('Affinoid N-Gram (2 Constraints)', affinoidNgram, affConfig));

    // 4. Tropical MLP
    const mlpConfig = { ...baseConfig, hiddenDim: 4 };
    const tropicalMlp = new TropicalMlpCharLearner(vocab, baseConfig.embDim, baseConfig.prime, mlpConfig.hiddenDim);
    results.push(await trainModel('Deep Tropical MLP (4 Hidden)', tropicalMlp, mlpConfig));

    // 5. Berkovich Attention
    const attConfig = { ...baseConfig, betaAtt: 2.0 };
    const attention = new BerkovichAttentionCharLearner(vocab, baseConfig.embDim, baseConfig.prime);
    results.push(await trainModel('Berkovich QKV Attention', attention, attConfig));

    console.log('\n========================================');
    console.log('SUMMARY TABLE');
    console.log('========================================');
    console.table(results);
  } catch (e) {
    console.error('Unified testing suite crashed!', e);
  }
}

runAll();
