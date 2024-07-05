/// <reference lib="webworker" />

import {
  computeMetrics,
  initTransformerTrainState,
  TrainMetrics,
  TransformerTrainState,
} from 'src/lib/trainer/basic_transformer_trainer';
import { mapNonNull } from 'src/lib/rxjs/util';
import { TrainStateConfig, trySgdTrainStep } from 'src/lib/trainer/train_state';
import { stringifyJsonValue } from 'src/lib/pretty_json/pretty_json';
import { DictTree, SimpleJsTreesLib } from 'src/lib/js_tree/js_tree';
import * as tf from '@tensorflow/tfjs';
import {
  prepareBasicTaskTokenRep,
  strSeqPrepFn,
  singleNextTokenIdxOutputPrepFn,
} from 'src/lib/tokens/token_gemb';
import { BasicLmTask, BasicLmTaskUpdate } from 'src/lib/seqtasks/util';
import { GTensor } from 'src/lib/gtensor/gtensor';

// interface Input {}

const onceInputs = new Promise<string>((resolve) => {
  addEventListener('message', ({ data }) => {
    resolve(data);
  });
});

async function run() {
  const inputs = await onceInputs;
  console.log('webworker got input!', inputs);

  const t = new GTensor(tf.tensor([1, 2, 3]), ['a']);
  const v = t.contract(t, ['a']).tensor.arraySync() as number;

  postMessage({
    t: t.toSerialised(),
    v,
  });
}

run();
