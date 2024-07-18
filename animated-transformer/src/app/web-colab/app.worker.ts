/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import { GTensor, SerializedGTensor } from 'src/lib/gtensor/gtensor';

import * as lab from '../../lib/weblab/workerlab';

console.log('app.worker', self.location);

type InputKind = string;
type OutputKind = {
  t: SerializedGTensor<'a'>;
  v: number;
} | null;

const input = lab.inputting('name', '' as InputKind);

const output = lab.outputting('tensor', null as OutputKind);

lab.space.effect(() => {
  const inputName = input();
  console.log(`webworker got input! ${inputName}`);

  const t = new GTensor(tf.tensor([1, 2, 3]), ['a']);
  const v = t.contract(t, ['a']).tensor.arraySync() as number;

  output.set({
    t: t.toSerialised(),
    v,
  });
});
