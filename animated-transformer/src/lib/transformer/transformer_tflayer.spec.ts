/* Copyright 2023 Google LLC. All Rights Reserved.

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

import * as transformer from './transformer_tflayer';
// import * as attention_head from './attention_head';
// import { TokenEmbConfig } from '../tokens/token_emb';
import * as tf from '@tensorflow/tfjs';
// import * as swap_task from '../seqtasks/swap_task';
// import json5 from 'json5';
// import { TrainingConfig } from '../../app/config-store.service';
// import { nextFrame } from '@tensorflow/tfjs';

describe('TFJS Layers Transformer', () => {
  let config: transformer.EncoderConfig;

  beforeEach(() => {
    config = {
      seqLen: 3,
      inputRepSize: 2,
      // TODO: generalise so that we can have hetrogenious sized attention heads.
      nAttnHeads: 2,
      valueRepSize: 4,
      kqRepSize: 1,
      outputRepSize: 2,
      // (returnAllParts === true) iff returns the intermediate attention computations.
      returnAllParts: true,
    };
  });

  it('basic transformer shapes', () => {
    const encoder = transformer.encoder(config);

    const inputExample1 = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    const inputExample2 = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    const inputBatch = [inputExample1, inputExample2];
    const inputTensor = tf.tensor3d(inputBatch);

    const outputs = encoder.apply(inputTensor) as transformer.TransformerParts;
    const [transformerOuput, attendedValues, attention, values, keys, queries] =
      outputs;
    const batchSize = inputBatch.length;

    expect(transformerOuput.shape).toEqual([
      batchSize,
      inputExample1.length,
      config.outputRepSize,
    ]);
    expect(attendedValues.shape).toEqual([
      batchSize,
      inputExample1.length,
      config.valueRepSize * config.nAttnHeads,
    ]);
    expect(attention.shape).toEqual([
      batchSize,
      inputExample1.length,
      inputExample1.length * config.nAttnHeads,
    ]);
    expect(values.shape).toEqual([
      batchSize,
      inputExample1.length,
      config.valueRepSize * config.nAttnHeads,
    ]);
    expect(keys.shape).toEqual([
      batchSize,
      inputExample1.length,
      config.kqRepSize * config.nAttnHeads,
    ]);
    expect(queries.shape).toEqual([
      batchSize,
      inputExample1.length,
      config.kqRepSize * config.nAttnHeads,
    ]);
  });

  xit('training a transformer', async () => {
    config.returnAllParts = false;
    const encoder = transformer.encoder(config);

    const inputExample1 = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    const inputExample2 = [
      [2, 1],
      [4, 3],
      [6, 5],
    ];
    const inputBatch = [inputExample1, inputExample2];
    const inputTensor = tf.tensor3d(inputBatch);

    encoder.compile({
      optimizer: tf.train.adam(),
      loss: tf.losses.meanSquaredError,
      metrics: ['mse'],
    });

    // A simple data generator that repeats the identity function on a single example.
    function* identityDataGenerator(
      numExamples: number
    ): Iterator<tf.TensorContainerObject> {
      const inputExample1 = [
        [1, 2],
        [3, 4],
        [5, 6],
      ];
      let index = 0;
      while (index < numExamples) {
        index++;
        yield {
          xs: inputExample1, // inputs
          ys: inputExample1, // correct outputs
        } as tf.TensorContainerObject;
      }
    }
    const ds = tf.data.generator(() => identityDataGenerator(200));
    const batchSize = 20;

    // const batch1 = await ds.batch(batchSize).take(1).toArray()
    console.log('encoder.predictOnBatch:', encoder.predictOnBatch(inputTensor));
    console.log('encoder.calculateLosses:', encoder.calculateLosses());

    // const batch1 = await ds.batch(batchSize).take(1).toArray();
    // const history = await encoder.fit(inputTensor, inputTensor);
    // console.log(history);

    const history = await encoder.fitDataset(ds.batch(batchSize), {
      batchesPerEpoch: 3,
      epochs: 2,
      // // shuffle: false, // not needed as inputs are created randomly.
      // // shuffle: true,
      // callbacks: tfvis.show.fitCallbacks(
      //   { name: 'Training Performance' },
      //   ['loss', 'mse'],
      //   { height: 200,
      //     // callbacks: ['onBatchEnd', 'onEpochEnd']
      // })
    });

    console.log(history);
    expect(history.history['loss'].length).toEqual(2);
  });
});
